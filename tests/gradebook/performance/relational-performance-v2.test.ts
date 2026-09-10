import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGradebookPostgresDatabaseFromSqlV1, type GradebookPostgresDatabaseV1, type GradebookPostgresSqlV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { createRelationalPerformanceV2 } from '../../../server/gradebook/application/read-models/performance/relational-performance-v2';
import { handlePerformanceRequestV1 } from '../../../server/gradebook/http/performance-routes-v1';
import { performanceRequestSchemaV2, performanceResponseSchemaV2, performanceResponseMatchesV2, type PerformanceRequestV2 } from '../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { seal } from '../../../server/auth/sealed';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { testEnv } from '../../fixtures';
import type { RuntimeEnv } from '../../../server/env';

let pg: PGlite;
let database: GradebookPostgresDatabaseV1;
let readsFail = false;
const queries: string[] = [];
const matrixRequest = (extra = {}): PerformanceRequestV2 => ({ transportVersion: 2, operation: 'matrix', year: 2090, classId: 10, period: 1, mode: 'regular', statuses: [null, 1, 2, 3, 4, 5, 7], ...extra });
const service = () => createRelationalPerformanceV2(database);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await pg.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2090,60000,2),(2091,65000,3);
    INSERT INTO gradebook.turma (id,ano,codigo,nome,etapa,turno) VALUES
      (10,2090,'A1','TURMA SINTETICA',6,'M'),(20,2090,'B1','TURMA SINTETICA B',6,'T'),
      (30,2091,'A1','OUTRO ANO SINTETICO',6,'M'),(40,2090,'C1','SEM DEFINICAO',6,'T'),
      (50,2090,'D1','AMBIGUA',6,'T'),(60,2090,'E1','LIMITE DE TAMANHO',6,'T');
    INSERT INTO gradebook.professor (id,ano,nome) VALUES (1,2090,'DOCENTE SINTETICO'),(2,2090,'OUTRO DOCENTE SINTETICO'),(3,2091,'DOCENTE SINTETICO');
    INSERT INTO gradebook.disciplina (id,ano,nome) VALUES (1,2090,'MATEMATICA SINTETICA'),(2,2090,'PORTUGUES SINTETICO'),(3,2091,'MATEMATICA SINTETICA');
    INSERT INTO gradebook.oferta (id,ano,turma_id,professor_id,disciplina_id) VALUES
      (10,2090,10,1,1),(11,2090,10,1,2),(20,2090,20,1,1),(30,2091,30,3,3),
      (40,2090,40,1,1),(50,2090,50,1,1),(51,2090,50,2,1);
    INSERT INTO gradebook.aluno (id,ano,nome,conselho_anterior,conselho_anterior_por) SELECT n,2090,'ALUNO SINTETICO '||n,false,'11111111-1111-4111-8111-111111111111'::uuid FROM generate_series(1,10) n;
    INSERT INTO gradebook.aluno (id,ano,nome) VALUES (99,2091,'ALUNO SINTETICO 1'),(40,2090,'SEM DEFINICAO SINTETICO');
    INSERT INTO gradebook.vinculo SELECT 2090,10,n,n,CASE WHEN n=6 THEN 2 WHEN n=7 THEN 4 ELSE NULL END,NULL FROM generate_series(1,8) n;
    INSERT INTO gradebook.vinculo VALUES (2090,10,9,9,6,20),(2090,20,1,9,7,10),(2091,30,1,99,NULL,NULL),(2090,40,1,40,NULL,NULL);
    INSERT INTO gradebook.aluno (id,ano,nome) SELECT 1000+n,2090,'POPULACAO SINTETICA '||n FROM generate_series(1,151) n;
    INSERT INTO gradebook.vinculo SELECT 2090,60,n,1000+n,NULL,NULL FROM generate_series(1,151) n;
    INSERT INTO gradebook.instrumento (id,oferta_id,trimestre,slot,maximo,descricao)
      SELECT o*100+t*20+s,o,t,s,CASE WHEN s=11 THEN CASE WHEN t=3 THEN 22000 ELSE 16500 END ELSE CASE WHEN t=3 THEN 9000 ELSE 6750 END END,'AVALIACAO SINTETICA'
      FROM (VALUES (10),(11)) a(o) CROSS JOIN generate_series(1,3) b(t) CROSS JOIN (VALUES (1),(2),(11)) c(s);
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT i.id,a,CASE WHEN a=2 THEN 0 WHEN a=3 THEN 1000 WHEN a=4 THEN CASE WHEN slot=11 THEN 6000 ELSE 4000 END WHEN a=8 THEN 20000 ELSE CASE WHEN slot=11 THEN 12000 ELSE 6000 END END
      FROM gradebook.instrumento i CROSS JOIN generate_series(1,8) a WHERE a<>5 AND NOT(a=3 AND i.slot=2);
    INSERT INTO gradebook.fechamento (oferta_id,aluno_id,am1_fonte,am2_fonte,am3_fonte,rec1,rec2,rec3,rec_nc_mask,u_fonte)
      SELECT o,1,24000,24000,24000,NULL,NULL,NULL,0,72000 FROM (VALUES(10),(11)) a(o);
    INSERT INTO gradebook.fechamento (oferta_id,aluno_id,rec1,rec2,rec3,rec_nc_mask,u_fonte) VALUES
      (10,2,18000,18000,24000,0,60000),(11,2,18000,18000,24000,0,60000),
      (10,4,NULL,18000,24000,1,NULL),(11,4,NULL,NULL,NULL,0,NULL);
    INSERT INTO gradebook.conselho_decisao (aluno_id,decisao,justificativa,registrado_por)
      VALUES (4,1,'DECISAO SINTETICA','11111111-1111-4111-8111-111111111111');
  `);
  const sql: GradebookPostgresSqlV1 = {
    async unsafe() { throw new Error('read-outside-transaction'); },
    async begin(operation) { return pg.transaction(async (tx) => operation({ async unsafe(query, values = []) {
      queries.push(query);
      if (readsFail && query.startsWith('SELECT')) throw new Error('synthetic-private-failure');
      const result = await tx.query<Record<string, unknown>>(query, [...values]);
      if (query.startsWith('SET TRANSACTION')) expect((await tx.query("SELECT current_setting('transaction_read_only') AS r,current_setting('transaction_isolation') AS i")).rows).toEqual([{ r: 'on', i: 'repeatable read' }]);
      return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
    } })); },
    async end() { await pg.close(); },
  };
  database = createGradebookPostgresDatabaseFromSqlV1(sql);
}, 30_000);
afterAll(async () => { await database?.close(); });
beforeEach(() => { queries.length = 0; readsFail = false; });

async function matrix(extra = {}) {
  const response = await service().execute(matrixRequest(extra));
  if (response.state !== 'ready' || response.operation !== 'matrix') throw new Error(JSON.stringify(response));
  return response;
}
async function http(body: unknown, role: 'ADMINISTRADOR' | 'PROFESSOR' | null = 'ADMINISTRADOR', overrides: Partial<RuntimeEnv> = {}) {
  const headers = new Headers({ Origin: testEnv.OFFICIAL_ORIGIN, 'Content-Type': 'application/json' });
  if (role) headers.set('Cookie', `${SESSION_COOKIE}=${await seal({ oid: '11111111-1111-4111-8111-111111111111', name: 'Synthetic', username: 'synthetic@example.test', roles: [role], exp: Math.floor(Date.now() / 1000) + 600 }, testEnv.SESSION_SECRET)}`);
  const response = await handlePerformanceRequestV1(new Request(`${testEnv.OFFICIAL_ORIGIN}/api/gradebook/performance`, { method: 'POST', headers, body: JSON.stringify(body) }), { ...testEnv, RUNTIME_ENVIRONMENT: 'local', GRADEBOOK_STORAGE_PROVIDER: 'postgres', GRADEBOOK_D1: database, ...overrides });
  if (!response) throw new Error('route-not-found');
  return response;
}

describe('relational performance V2 on the complete PostgreSQL baseline', () => {
  it('reads one repeatable read snapshot without N+1, old relations or writes', async () => {
    const result = await matrix();
    expect(queries).toHaveLength(6);
    expect(queries.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b|academic_record|academic_entity/u);
    expect(result.rows).toHaveLength(8);
    expect(result.offers).toHaveLength(2);
    expect(result).toMatchObject({ authority: 'calculated-preview', statistics: { classRows: 8, visibleRows: 8, eligibleRows: 6 } });
    expect(performanceResponseSchemaV2.safeParse(result).success).toBe(true);
    expect(gzipSync(JSON.stringify(result)).length).toBeLessThan(500_000);
  });
  it('keeps zero, partial, missing, N/C and the imported reference distinct', async () => {
    const result = await matrix();
    const at = (id: number) => result.rows.find((r) => r.student.id === id)!.cells[0]!;
    expect(at(1)).toMatchObject({ valueMilli: 24000, state: 'complete', sourceReferenceMilli: 24000, sourceComparison: 'match' });
    expect(at(2)).toMatchObject({ valueMilli: 0, state: 'complete', level: 'below' });
    expect(at(3)).toMatchObject({ state: 'partial', level: 'not-classified', sourceComparison: 'unavailable' });
    expect(at(5)).toMatchObject({ valueMilli: null, state: 'not-recorded' });
    const recovery = await matrix({ mode: 'recovery' });
    expect(recovery.rows.map((r) => r.student.id)).toEqual([2,4]);
    expect(recovery.rows[1]!.cells[0]).toMatchObject({ valueMilli: null, state: 'no-show' });
    expect(recovery.rows[1]!.cells[1]).toMatchObject({ state: 'recovery-pending' });
  });
  it('does not promote statuses to active indicators or override human decisions', async () => {
    const result = await matrix({ period: 'annual' });
    expect(result.rows.find((r) => r.student.id === 6)).toMatchObject({ student: { indicatorEligible: false }, calculatedAnnual: { state: 'no-result', label: null } });
    expect(result.rows.find((r) => r.student.id === 7)).toMatchObject({ student: { indicatorEligible: false }, calculatedAnnual: { label: 'TRANSFERIDO' } });
    expect(result.rows.find((r) => r.student.id === 4)).toMatchObject({ calculatedAnnual: { label: 'EM RECUPERAÇÃO' }, formalCouncilDecision: { code: 1, label: 'APROVADO PELO CONSELHO' } });
  });
  it('preserves warnings and refuses to invent comparability', async () => {
    const result = await matrix();
    expect(result.rows.find((r) => r.student.id === 8)!.cells[0]!.warningCodes).toContain('value-above-maximum');
    expect(result.comparison).toEqual({ available: false, reason: 'comparability-not-contracted' });
  });
  it.each([1,2,3,'annual'])('keeps period %s in the returned request scope', async (period) => {
    expect(await matrix({ period })).toMatchObject({ period, mode: 'regular' });
  });
  it('returns current movement at the new class only and excludes the historical position', async () => {
    expect((await matrix()).rows.some((r) => r.student.id === 9)).toBe(false);
    expect((await matrix({ classId: 20 })).rows[0]!.student).toMatchObject({ id: 9, status: 7, indicatorEligible: true });
  });
  it('does not invent a successful result from missing offer definitions', async () => {
    const result = await matrix({ classId: 40 });
    expect(result.rows[0]).toMatchObject({ calculatedAnnual: null, cells: [{ valueMilli: null, state: 'unavailable' }] });
  });
  it('rejects ambiguous offerings instead of merging two teachers by subject', async () => {
    expect(await service().execute(matrixRequest({ classId: 50 }))).toEqual({ transportVersion: 2, state: 'ambiguous-offers' });
  });
  it('rejects a scope beyond the row limit instead of truncating silently', async () => {
    expect(await service().execute(matrixRequest({ classId: 60 }))).toEqual({ transportVersion: 2, state: 'scope-too-large' });
  });
  it('loads only the requested student and offer in a cell detail', async () => {
    const request: PerformanceRequestV2 = { transportVersion: 2, operation: 'cell-detail', year: 2090, classId: 10, period: 1, mode: 'regular', studentId: 2, offerId: 10 };
    const result = await service().execute(request);
    expect(result).toMatchObject({ operation: 'cell-detail', student: { id: 2 }, offer: { id: 10 } });
    expect(performanceResponseMatchesV2(request, result)).toBe(true);
    expect(queries).toHaveLength(6);
    expect(queries[5]).toContain('AND v.aluno_id=');
    expect(queries[5]).toContain('AND o.id=');
  });
  it('loads the student trajectory without a matrix for other students', async () => {
    const result = await service().execute({ transportVersion: 2, operation: 'student-detail', year: 2090, classId: 10, period: 3, mode: 'regular', studentId: 1 });
    expect(result).toMatchObject({ operation: 'student-detail', row: { student: { id: 1 } }, trajectory: [{ offerId: 10 }, { offerId: 11 }] });
    expect(queries).toHaveLength(6);
  });
  it.each([{ year: 2091, classId: 10 }, { year: 2092, classId: 10 }, { classId: 999 }])('rejects a mismatched or missing year/class %j', async (extra) => {
    expect(await service().execute(matrixRequest(extra))).toEqual({ transportVersion: 2, state: 'not-found' });
  });
  it('pages registered classes without inventing a selected year', async () => {
    const request = { transportVersion: 2, operation: 'classes', year: 2090, offset: 0, limit: 2 } as const;
    const result = await service().execute(request);
    expect(result).toMatchObject({ classes: [{ id: 10 }, { id: 20 }], nextOffset: 2 });
    expect(performanceResponseMatchesV2(request, result)).toBe(true);
    expect(queries).toHaveLength(3);
  });
  it.each([{ statuses: [] }, { statuses: [null,null] }, { statuses: [6] }, { classId: "1 OR 1=1" }, { mode: 'automatic' }, { extra: true }])('rejects invalid or unknown input before SQL %j', async (extra) => {
    expect(performanceRequestSchemaV2.safeParse(matrixRequest(extra)).success).toBe(false);
    expect(await service().execute(matrixRequest(extra))).toEqual({ transportVersion: 2, state: 'invalid-request' });
    expect(queries).toHaveLength(0);
  });
  it('serves V2 through the real HTTP authorization boundary with no-store', async () => {
    const response = await http(matrixRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ transportVersion: 2, authority: 'calculated-preview', operation: 'matrix' });
  });
  it.each([null, 'PROFESSOR'] as const)('denies unauthenticated or unauthorized role %s without reads', async (role) => {
    const response = await http(matrixRequest(), role);
    expect([401,403]).toContain(response.status);
    expect(queries).toHaveLength(0);
  });
  it('does not bypass the production runtime gate', async () => {
    const response = await http(matrixRequest(), 'ADMINISTRADOR', { RUNTIME_ENVIRONMENT: 'production', GRADEBOOK_PRODUCTION_ENABLED: 'false' });
    expect(response.status).toBe(503); expect(queries).toHaveLength(0);
  });
  it('keeps database failures opaque and never converts them to an empty success', async () => {
    readsFail = true;
    const response = await http(matrixRequest());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain('synthetic-private-failure');
    expect(body).toContain('unavailable');
  });
});
