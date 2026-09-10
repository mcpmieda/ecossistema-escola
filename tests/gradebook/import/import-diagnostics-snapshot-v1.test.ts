import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEnv } from '../../../server/env';
import { AuthenticationError } from '../../../server/auth/session';
import { AuthorizationError } from '../../../server/auth/roles';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresDatabaseV1,
  type GradebookPostgresQuerySqlV1,
  type GradebookPostgresSqlV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { replaceGradebookImportDiagnosticsSnapshotV1 as replace } from '../../../server/gradebook/application/import/import-diagnostics-snapshot-v1';
import type { GradebookImportDiagnosticsAuditRequestV1 } from '../../../shared/gradebook-contracts/imports/import-diagnostics-v1';
import { onRequest } from '../../../functions/api/gradebook/import-diagnostics';

const mocks = vi.hoisted(() => ({auth:vi.fn(),authorize:vi.fn()}));
vi.mock('../../../server/env', () => ({validateEnv:(env:unknown) => env}));
vi.mock('../../../server/auth/session', () => ({
  requireAuth:mocks.auth,
  AuthenticationError:class extends Error { readonly status=401; },
}));
vi.mock('../../../server/auth/roles', () => ({
  AuthorizationError:class extends Error { readonly status=403; },
}));
vi.mock('../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1', () => ({authorizeGradebookD1RuntimeV1:mocks.authorize}));
vi.mock('../../../server/gradebook/persistence/postgres/official-gradebook-database-v1', () => ({
  withOfficialGradebookDatabaseV1:async (env:RuntimeEnv, operation:(env:RuntimeEnv)=>Promise<Response|null>) => operation(env),
}));

type Row=Record<string,unknown>;
let pg:PGlite;
let database:GradebookPostgresDatabaseV1;
let failInsert=false;
let wrongInsertCount=false;
let transactions=0;
const queries:string[]=[];

async function execute(client:Pick<PGlite,'query'>,query:string,values:readonly unknown[],transactional:boolean) {
  queries.push(query);
  if (!transactional && (!query.startsWith('SELECT') || query.includes('pg_advisory_xact_lock'))) {
    throw new Error('snapshot-write-or-lock-outside-transaction');
  }
  if (failInsert && query.startsWith('INSERT INTO gradebook.importacao_diagnostico')) throw new Error('synthetic-insert-failure');
  const result=await client.query<Row>(query,[...values]);
  const count=wrongInsertCount && query.startsWith('INSERT INTO gradebook.importacao_diagnostico') ? 0 : result.affectedRows ?? result.rows.length;
  return Object.assign(result.rows,{count});
}

beforeAll(async () => {
  pg=new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql','utf8'));
  const sql:GradebookPostgresSqlV1={
    unsafe:(query,values=[]) => execute(pg,query,values,false),
    async begin(operation) {
      transactions++;
      return pg.transaction(async (transaction) => {
        const sql:GradebookPostgresQuerySqlV1={unsafe:(query,values=[])=>execute(transaction,query,values,true)};
        return operation(sql);
      });
    },
    async end() { await pg.close(); },
  };
  database=createGradebookPostgresDatabaseFromSqlV1(sql);
},30_000);
afterAll(async () => { await database?.close(); });
beforeEach(async () => {
  failInsert=false; wrongInsertCount=false; transactions=0; queries.length=0;
  await pg.exec('TRUNCATE gradebook.importacao_diagnostico;');
  mocks.auth.mockReset().mockResolvedValue({oid:'00000000-0000-4000-8000-000000000001'});
  mocks.authorize.mockReset().mockReturnValue({});
});

function observation(keys:readonly string[]=['synthetic-key'], input:{fileName?:string;hash?:string;year?:number|null}={}):GradebookImportDiagnosticsAuditRequestV1 {
  return {
    version:1,academicYear:input.year===undefined?2090:input.year,
    fileName:input.fileName??'synthetic.xlsx',sha256:(input.hash??'a').repeat(64),
    diagnostics:keys.map((key)=>({key,severity:'warning',code:'source-unavailable',message:'Valor indisponível.',recommendedAction:'Confira a fonte.',fieldKind:'recovery'})),
  };
}
async function state() {
  return (await pg.query<Row>('SELECT id,ano,arquivo,encode(hash,\'hex\') AS hash,chave,nivel,codigo,primeiro_em,ultimo_em,ocorrencias FROM gradebook.importacao_diagnostico ORDER BY arquivo,chave')).rows;
}
async function request(method:'GET'|'POST',body?:unknown,origin='https://school.test',query='') {
  return onRequest({
    request:new Request(`https://school.test/api/gradebook/import-diagnostics${query}`,{
      method,headers:{Origin:origin,'Content-Type':'application/json'},
      ...(method==='POST'?{body:JSON.stringify(body)}:{}),
    }),
    env:{OFFICIAL_ORIGIN:'https://school.test',GRADEBOOK_D1:database},
  } as unknown as Parameters<typeof onRequest>[0]);
}

describe('atomic current diagnostic snapshot on the complete relational schema', () => {
  it('locks before replacing and writes the entire set in one transaction', async () => {
    expect(await replace(database,observation(['k1','k2']))).toBe(2);
    expect(transactions).toBe(1);
    expect(queries).toHaveLength(4);
    expect(queries[0]).toContain('pg_advisory_xact_lock');
    expect(queries[0]).not.toContain('::jsonb');
    expect(queries[1]).toContain('pg_advisory_xact_lock');
    expect(queries[2]).toMatch(/^DELETE FROM/u);
    expect(queries[3]).toMatch(/^INSERT INTO/u);
    expect((await state()).map((row)=>row.chave)).toEqual(['k1','k2']);
  });

  it('removes resolved evidence and leaves only the current source version', async () => {
    await replace(database,observation(['old1','old2']));
    expect(await replace(database,observation(['current'],{hash:'b'}))).toBe(3);
    expect(await state()).toMatchObject([{chave:'current',hash:'b'.repeat(64),ocorrencias:1}]);
  });

  it('preserves the exact previous rows if insertion fails after deletion', async () => {
    await replace(database,observation(['old']));
    const previous=await state();
    failInsert=true;
    await expect(replace(database,observation(['new'],{hash:'b'}))).rejects.toThrow('synthetic-insert-failure');
    expect(await state()).toEqual(previous);
  });

  it('rolls back an incomplete write confirmation instead of reporting a partial snapshot', async () => {
    await replace(database,observation(['old']));
    const previous=await state();
    wrongInsertCount=true;
    await expect(replace(database,observation(['new'],{hash:'b'}))).rejects.toThrow('import-diagnostics-incomplete-snapshot');
    expect(await state()).toEqual(previous);
  });

  it('clears an empty observation even if the source hash is unchanged', async () => {
    await replace(database,observation(['old']));
    queries.length=0;
    expect(await replace(database,observation([]))).toBe(1);
    expect(await state()).toEqual([]);
    expect(queries.some((query)=>query.startsWith('INSERT'))).toBe(false);
  });

  it('does not clear another file or year', async () => {
    await replace(database,observation(['other-file'],{fileName:'other-synthetic.xlsx',hash:'b'}));
    await replace(database,observation(['other-year'],{year:2091,hash:'c'}));
    await replace(database,observation(['mine']));
    await replace(database,observation([]));
    expect((await state()).map((row)=>row.chave).sort()).toEqual(['other-file','other-year']);
  });

  it('treats renamed identical bytes as one current content, with the current filename', async () => {
    await replace(database,observation(['key']));
    await replace(database,observation(['key'],{fileName:'renamed-synthetic.xlsx'}));
    expect(await state()).toMatchObject([{arquivo:'renamed-synthetic.xlsx',chave:'key'}]);
    expect(await state()).toHaveLength(1);
  });

  it('handles unknown years without accumulating unresolved versions', async () => {
    await replace(database,observation(['old'],{year:null}));
    await replace(database,observation(['new'],{year:null,hash:'b'}));
    expect(await state()).toMatchObject([{ano:null,chave:'new'}]);
    expect(await state()).toHaveLength(1);
  });

  it('rejects duplicate keys and missing transaction support before writing', async () => {
    await expect(replace(database,observation(['duplicate','duplicate']))).rejects.toThrow('invalid-import-diagnostics-snapshot');
    await expect(replace({prepare:database.prepare,exec:database.exec},observation())).rejects.toThrow('import-diagnostics-transaction-unavailable');
    expect(queries).toHaveLength(0);
    expect(transactions).toBe(0);
  });

  it('supports the existing 5,000-item bound without per-item SQL', async () => {
    const value=observation(Array.from({length:5000},(_,index)=>`key-${index}`));
    expect(await replace(database,value)).toBe(5000);
    expect(queries).toHaveLength(4);
    expect(await state()).toHaveLength(5000);
    const counts=(await pg.query('SELECT (SELECT count(*)::integer FROM gradebook.nota) AS notas,(SELECT count(*)::integer FROM gradebook.importacao) AS imports')).rows;
    expect(counts).toEqual([{notas:0,imports:0}]);
  });

  it('concurrent invocations leave a complete committed set, never a mixture', async () => {
    // PGlite serializes connections: this proves transaction boundaries and final sets,
    // not multi-session PostgreSQL advisory-lock contention (a private pilot gate).
    await Promise.all([
      replace(database,observation(['a1','a2'])),
      replace(database,observation(['b1','b2','b3'],{hash:'b'})),
    ]);
    const keys=(await state()).map((row)=>row.chave);
    expect([['a1','a2'],['b1','b2','b3']]).toContainEqual(keys);
    expect(transactions).toBe(2);
  });
});

describe('diagnostic HTTP integration with synthetic identity and real SQL transaction', () => {
  it('POST records and an empty POST removes the snapshot, with no-store', async () => {
    const first=await request('POST',observation());
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({version:1,state:'recorded',affected:1});
    expect(first.headers.get('Cache-Control')).toContain('no-store');
    const empty=await request('POST',observation([]));
    expect(await empty.json()).toEqual({version:1,state:'recorded',affected:1});
    expect(await state()).toEqual([]);
  });

  it('GET reads current evidence with bounded pagination and no writes', async () => {
    await replace(database,observation(['k1','k2']));
    const previous=await state();
    queries.length=0;
    const result=await request('GET',undefined,'https://school.test','?ano=2090&limit=1');
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toContain('no-store');
    expect(await result.json()).toMatchObject({version:1,state:'ready',nextOffset:1,items:[{academicYear:2090,fileName:'synthetic.xlsx',code:'source-unavailable',studentName:null}]});
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/^SELECT/u);
    expect(await state()).toEqual(previous);
  });

  it('rejects unauthenticated requests before any SQL', async () => {
    mocks.auth.mockRejectedValueOnce(new AuthenticationError());
    const result=await request('POST',observation());
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({version:1,state:'not-authorized'});
    expect(queries).toHaveLength(0);
  });

  it('rejects missing capability before any SQL', async () => {
    mocks.authorize.mockImplementationOnce(()=>{throw new AuthorizationError();});
    const result=await request('POST',observation());
    expect(result.status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('rejects a cross-origin write before any SQL', async () => {
    expect((await request('POST',observation(),'https://untrusted.test')).status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('maps duplicate input to invalid-request and preserves the old set', async () => {
    await replace(database,observation(['old']));
    const previous=await state();
    const result=await request('POST',observation(['same','same']));
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({version:1,state:'invalid-request'});
    expect(await state()).toEqual(previous);
  });

  it('reports insertion failure without exposing SQL or erasing earlier evidence', async () => {
    await replace(database,observation(['old']));
    const previous=await state();
    failInsert=true;
    const log=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    try {
      const result=await request('POST',observation(['new'],{hash:'b'}));
      expect(result.status).toBe(500);
      expect(await result.json()).toEqual({version:1,state:'unavailable'});
      expect(await state()).toEqual(previous);
      expect(log).toHaveBeenCalledWith(JSON.stringify({message:'gradebook_import_diagnostics_failed'}));
    } finally { log.mockRestore(); }
  });
});
