import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { createRelationalBulletinServiceV2 } from '../../../server/gradebook/application/bulletins/relational-bulletin-v2';
import {
  GRADEBOOK_BULLETIN_ROUTE_V1,
  handleBulletinRequestV1,
} from '../../../server/gradebook/http/bulletin-routes-v1';
import { createRelationalBulletinSnapshotRepositoryV2 } from '../../../server/gradebook/persistence/postgres/relational-bulletin-snapshot-v2';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresDatabaseV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { testEnv } from '../../fixtures';

let pg: PGlite;
let database: GradebookPostgresDatabaseV1;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await pg.exec('CREATE ROLE gradebook_app NOLOGIN NOSUPERUSER NOBYPASSRLS;');
  await pg.exec(
    readFileSync(
      'migrations/gradebook-simplified/0005_relational_bulletin_snapshot_v2.sql',
      'utf8',
    ),
  );
  await pg.exec(
    'ALTER TABLE gradebook.fechamento ADD COLUMN rec_rr_mask SMALLINT NOT NULL DEFAULT 0;',
  );
  await pg.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2026,60000,2);
    INSERT INTO gradebook.turma (id,ano,codigo,nome,etapa,turno) VALUES (10,2026,'6A','6º ANO A',6,'M');
    INSERT INTO gradebook.professor (id,ano,nome) VALUES (1,2026,'DOCENTE UM'),(2,2026,'DOCENTE DOIS');
    INSERT INTO gradebook.disciplina (id,ano,nome) VALUES (1,2026,'MATEMATICA'),(2,2026,'PORTUGUES');
    INSERT INTO gradebook.oferta (id,ano,turma_id,professor_id,disciplina_id) VALUES
      (10,2026,10,1,1),(20,2026,10,2,2);
    INSERT INTO gradebook.aluno (id,ano,nome) VALUES (1,2026,'ALUNO REGULAR'),(2,2026,'ALUNO ASSISTIDO');
    INSERT INTO gradebook.vinculo (ano,turma_id,numero,aluno_id,situacao) VALUES
      (2026,10,1,1,NULL),(2026,10,2,2,2);
    INSERT INTO gradebook.instrumento (id,oferta_id,trimestre,slot,maximo,descricao)
      SELECT oferta_id * 1000 + trimestre * 100 + slot, oferta_id, trimestre, slot,
             CASE WHEN slot = 11 THEN CASE WHEN trimestre = 3 THEN 22000 ELSE 16500 END
                  ELSE CASE WHEN trimestre = 3 THEN 9000 ELSE 6750 END END,
             CASE slot WHEN 1 THEN 'AV1' WHEN 2 THEN 'AV2' ELSE 'ATIVIDADE' END
        FROM (VALUES (10),(20)) oferta(oferta_id)
        CROSS JOIN generate_series(1,3) trimestre
        CROSS JOIN (VALUES (1),(2),(11)) instrumento(slot);
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT i.id, 1, CASE WHEN i.oferta_id = 20 THEN 0 ELSE i.maximo END
        FROM gradebook.instrumento i;
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT i.id, 2, i.maximo FROM gradebook.instrumento i;
    INSERT INTO gradebook.fechamento (oferta_id,aluno_id,am1_fonte,am2_fonte,am3_fonte,rec_nc_mask)
      VALUES (10,1,30000,30000,40000,0),(20,1,0,0,0,1),
             (10,2,30000,30000,40000,0),(20,2,30000,30000,40000,0);
  `);
  const execute = async (sql: string, values: readonly unknown[] = []) => {
    const result = await pg.query<Record<string, unknown>>(sql, [...values]);
    return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
  };
  database = createGradebookPostgresDatabaseFromSqlV1({
    unsafe: execute,
    async begin(operation) {
      return pg.transaction(async (tx) =>
        operation({
          async unsafe(sql, values = []) {
            const result = await tx.query<Record<string, unknown>>(sql, [...values]);
            return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
          },
        }),
      );
    },
    async end() {
      await pg.close();
    },
  });
}, 30_000);

afterAll(async () => {
  await database?.close();
});

function service(snapshotId = '11111111-1111-4111-8111-111111111111') {
  let instant = 0;
  return createRelationalBulletinServiceV2({
    database,
    snapshots: createRelationalBulletinSnapshotRepositoryV2(database),
    now: () => new Date(Date.UTC(2026, 8, 11, 12, 0, instant++)).toISOString(),
    createSnapshotId: () => snapshotId,
  });
}

const base = {
  year: 2026 as const,
  classId: 10,
  detail: 'detailed' as const,
  presentation: { locale: 'pt-BR', dateStyle: 'long' as const },
};

describe('relational bulletin V2', () => {
  it('loads the fixed catalog and presents subjects in the configured order', async () => {
    const workspace = service();
    expect(
      await workspace.execute(
        { contractVersion: 2, operation: 'catalog', year: 2026 },
        { issuerOid: 'actor' },
      ),
    ).toMatchObject({ state: 'ready', classes: [{ id: 10, label: '6º ANO A', studentCount: 2 }] });
    const response = await workspace.execute(
      {
        contractVersion: 2,
        operation: 'preview',
        selection: {
          ...base,
          studentId: 1,
          period: { kind: 'term', term: 1 },
        },
      },
      { issuerOid: 'actor' },
    );
    expect(response).toMatchObject({
      state: 'ready',
      model: {
        authority: {
          officialValues: 'imported-source',
          calculatedValues: 'descriptive-comparison',
        },
        subjects: [
          {
            subject: { abbreviation: 'P' },
            terms: [
              {
                sourceAmMilli: 0,
                calculatedAmMilli: 0,
                comparison: 'match',
                instruments: expect.any(Array),
              },
            ],
          },
          {
            subject: { abbreviation: 'M' },
            terms: [{ sourceAmMilli: 30000, calculatedAmMilli: 30000, comparison: 'match' }],
          },
        ],
      },
    });
  });

  it('shows normal grades and N/C recovery together and keeps ASSISTIDO without a result', async () => {
    const workspace = service();
    const annual = await workspace.execute(
      {
        contractVersion: 2,
        operation: 'preview',
        selection: {
          ...base,
          studentId: 1,
          period: { kind: 'annual' },
        },
      },
      { issuerOid: 'actor' },
    );
    expect(annual).toMatchObject({
      state: 'ready',
      model: {
        emissionReadiness: { ready: true },
        overall: { visibleResult: 'REPROVADO POR NÃO COMPARECIMENTO' },
      },
    });
    if (annual.state !== 'ready' || annual.operation !== 'preview')
      throw new Error('annual-preview-missing');
    expect(annual.model.subjects[0]).toMatchObject({
      subject: { abbreviation: 'P' },
      annual: {
        classification: 'failed-no-show',
        recoveryTerms: [{ source: 'NC' }, { source: null }, { source: null }],
      },
    });
    const assisted = await workspace.execute(
      {
        contractVersion: 2,
        operation: 'preview',
        selection: {
          ...base,
          studentId: 2,
          period: { kind: 'annual' },
        },
      },
      { issuerOid: 'actor' },
    );
    expect(assisted).toMatchObject({
      state: 'ready',
      model: {
        student: { statusLabel: 'ASSISTIDO' },
        overall: { calculatedResult: null, visibleResult: null },
        subjects: expect.any(Array),
      },
    });
    if (assisted.state !== 'ready' || assisted.operation !== 'preview')
      throw new Error('assisted-preview-missing');
    expect(assisted.model.subjects).toHaveLength(2);
  });

  it('emits and reprints terminal R/R while ordinary incomplete annual bulletins remain blocked', async () => {
    await pg.exec(`
      INSERT INTO gradebook.conselho_decisao (aluno_id, decisao, justificativa, registrado_por)
        VALUES (1, 1, 'DECISAO ANTERIOR SINTETICA', '11111111-1111-4111-8111-111111111111');
      UPDATE gradebook.fechamento SET rec_rr_mask = 1 WHERE oferta_id = 10 AND aluno_id = 1;
      UPDATE gradebook.fechamento SET rec_nc_mask = 0 WHERE oferta_id = 20 AND aluno_id = 1;
      DELETE FROM gradebook.nota
       WHERE aluno_id = 1
         AND instrumento_id = (
           SELECT id FROM gradebook.instrumento
            WHERE oferta_id = 20 AND trimestre = 1 AND slot = 2
         );
    `);
    const selection = {
      ...base,
      studentId: 1,
      period: { kind: 'annual' as const },
    };
    try {
      const workspace = service('22222222-2222-4222-8222-222222222222');
      const preview = await workspace.execute(
        { contractVersion: 2, operation: 'preview', selection },
        { issuerOid: 'actor' },
      );
      expect(preview).toMatchObject({
        state: 'ready',
        model: {
          overall: { formalCouncilDecision: null, visibleResult: 'REPROVADO' },
          emissionReadiness: { ready: true, reasons: [] },
        },
      });
      if (preview.state !== 'ready' || preview.operation !== 'preview')
        throw new Error('repeat-preview-missing');
      expect(preview.model.subjects.some((subject) =>
        subject.annual?.classification === 'failed-repeat')).toBe(true);

      const emitted = await workspace.execute(
        { contractVersion: 2, operation: 'emit', selection },
        { issuerOid: 'actor' },
      );
      expect(emitted).toMatchObject({
        state: 'ready',
        snapshot: {
          snapshotId: '22222222-2222-4222-8222-222222222222',
          model: { overall: { visibleResult: 'REPROVADO' } },
        },
      });
      if (emitted.state !== 'ready' || emitted.operation !== 'emit')
        throw new Error('repeat-snapshot-missing');
      await expect(workspace.execute({
        contractVersion: 2,
        operation: 'emit-batch',
        selection: {
          ...base,
          studentIds: [1],
          period: { kind: 'annual' },
        },
      }, { issuerOid: 'actor' })).resolves.toMatchObject({
        state: 'ready',
        ready: [{
          studentId: 1,
          snapshot: { snapshotId: '22222222-2222-4222-8222-222222222222' },
        }],
        blocked: [],
      });
      await expect(workspace.execute({
        contractVersion: 2,
        operation: 'reprint',
        snapshotId: emitted.snapshot.snapshotId,
        snapshotVersion: emitted.snapshot.snapshotVersion,
      }, { issuerOid: 'actor' })).resolves.toMatchObject({
        state: 'ready',
        source: 'historical-snapshot',
        snapshot: { model: { overall: { visibleResult: 'REPROVADO' } } },
      });

      await pg.exec(
        'UPDATE gradebook.fechamento SET am1_fonte = NULL WHERE oferta_id = 20 AND aluno_id = 1;',
      );
      const missingOfficialAm = await service(
        '33333333-3333-4333-8333-333333333333',
      ).execute(
        { contractVersion: 2, operation: 'emit', selection },
        { issuerOid: 'actor' },
      );
      expect(missingOfficialAm).toMatchObject({ state: 'insufficient-data' });
      if (missingOfficialAm.state !== 'insufficient-data')
        throw new Error('repeat-bulletin-without-official-am-was-not-blocked');
      expect(missingOfficialAm.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/^missing-official-am:/u),
      ]));
      await pg.exec(
        'UPDATE gradebook.fechamento SET am1_fonte = 0 WHERE oferta_id = 20 AND aluno_id = 1;',
      );

      await pg.exec(
        'UPDATE gradebook.fechamento SET rec_rr_mask = 0 WHERE oferta_id = 10 AND aluno_id = 1;',
      );
      const incomplete = await service('33333333-3333-4333-8333-333333333333').execute(
        { contractVersion: 2, operation: 'emit', selection },
        { issuerOid: 'actor' },
      );
      expect(incomplete).toMatchObject({ state: 'insufficient-data' });
      if (incomplete.state !== 'insufficient-data')
        throw new Error('ordinary-incomplete-bulletin-was-not-blocked');
      expect(incomplete.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/^incomplete-calculation:/u),
        expect.stringMatching(/^annual-in-progress:/u),
      ]));
    } finally {
      await pg.exec(`
        DELETE FROM gradebook.boletim_snapshot
         WHERE snapshot_id = '22222222-2222-4222-8222-222222222222';
        DELETE FROM gradebook.conselho_decisao WHERE aluno_id = 1;
        UPDATE gradebook.fechamento SET rec_rr_mask = 0 WHERE oferta_id = 10 AND aluno_id = 1;
        UPDATE gradebook.fechamento SET am1_fonte = 0, rec_nc_mask = 1
         WHERE oferta_id = 20 AND aluno_id = 1;
        INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor)
          SELECT id, 1, 0 FROM gradebook.instrumento
           WHERE oferta_id = 20 AND trimestre = 1 AND slot = 2
          ON CONFLICT (instrumento_id, aluno_id) DO UPDATE SET valor = EXCLUDED.valor;
      `);
    }
  });

  it('emits idempotently, advances on changed facts and reprints only the historical snapshot', async () => {
    const workspace = service();
    const request = {
      contractVersion: 2 as const,
      operation: 'emit' as const,
      selection: {
        ...base,
        detail: 'summary' as const,
        studentId: 1,
        period: { kind: 'term' as const, term: 1 as const },
      },
    };
    const first = await workspace.execute(request, { issuerOid: 'actor-a' });
    const retry = await workspace.execute(request, { issuerOid: 'actor-b' });
    expect(first).toMatchObject({ state: 'ready', snapshot: { snapshotVersion: 1 } });
    expect(retry).toMatchObject({ state: 'ready', snapshot: { snapshotVersion: 1 } });
    await pg.exec(
      'UPDATE gradebook.fechamento SET am1_fonte = 1000 WHERE oferta_id = 20 AND aluno_id = 1;',
    );
    const changed = await workspace.execute(request, { issuerOid: 'actor-b' });
    expect(changed).toMatchObject({ state: 'ready', snapshot: { snapshotVersion: 2 } });
    if (first.state !== 'ready' || first.operation !== 'emit')
      throw new Error('first-snapshot-missing');
    const reprint = await workspace.execute(
      {
        contractVersion: 2,
        operation: 'reprint',
        snapshotId: first.snapshot.snapshotId,
        snapshotVersion: 1,
      },
      { issuerOid: 'actor-b' },
    );
    expect(reprint).toMatchObject({
      state: 'ready',
      source: 'historical-snapshot',
      snapshot: { snapshotVersion: 1 },
    });
    if (reprint.state !== 'ready' || reprint.operation !== 'reprint')
      throw new Error('reprint-missing');
    expect(reprint.snapshot.model.subjects[0]).toMatchObject({
      subject: { abbreviation: 'P' },
      terms: [{ sourceAmMilli: 0 }],
    });
    expect(
      (await pg.query('SELECT count(*)::integer AS count FROM gradebook.boletim_snapshot')).rows,
    ).toEqual([{ count: 2 }]);
  });

  it('materializes a batch with a bounded academic query count instead of N+1 reads', async () => {
    const academicQueries: string[] = [];
    const counted = (target: D1WriteDatabaseV1): D1WriteDatabaseV1 => ({
      prepare(query) {
        if (
          !query.includes('gradebook.boletim_snapshot') &&
          /^\s*(?:SELECT|WITH)\b/iu.test(query)
        ) {
          academicQueries.push(query);
        }
        return target.prepare(query);
      },
      exec(query) {
        return target.exec(query);
      },
      ...(target.batch ? { batch: (statements) => target.batch!(statements) } : {}),
    });
    const countedDatabase = {
      ...counted(database),
      transaction: <T>(operation: (tx: D1WriteDatabaseV1) => Promise<T>) =>
        database.transaction((tx) => operation(counted(tx))),
    };
    const workspace = createRelationalBulletinServiceV2({
      database: countedDatabase,
      snapshots: createRelationalBulletinSnapshotRepositoryV2(countedDatabase),
      now: () => '2026-09-11T12:00:00.000Z',
    });
    const response = await workspace.execute(
      {
        contractVersion: 2,
        operation: 'emit-batch',
        selection: {
          year: 2026,
          classId: 10,
          studentIds: [2, 1],
          period: { kind: 'annual' },
          detail: 'detailed',
          presentation: { locale: 'pt-BR', dateStyle: 'long' },
        },
      },
      { issuerOid: 'actor-batch' },
    );
    expect(response).toMatchObject({ state: 'ready', ready: expect.any(Array) });
    if (response.state !== 'ready' || response.operation !== 'emit-batch') {
      throw new Error('batch-emission-missing');
    }
    expect(
      response.ready.map(({ studentId, snapshot }) => [studentId, snapshot.model.student.id]),
    ).toEqual([
      [2, 2],
      [1, 1],
    ]);
    expect(academicQueries).toHaveLength(5);
  });
});

async function http(
  body: unknown,
  role: 'ADMINISTRADOR' | 'PROFESSOR' | null = 'ADMINISTRADOR',
  overrides: Partial<RuntimeEnv> = {},
): Promise<Response> {
  const headers = new Headers({
    Origin: testEnv.OFFICIAL_ORIGIN,
    'Content-Type': 'application/json',
  });
  if (role) {
    const session = await seal(
      {
        oid: '22222222-2222-4222-8222-222222222222',
        name: 'Synthetic Bulletin',
        username: 'synthetic-bulletin@example.test',
        roles: [role],
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      testEnv.SESSION_SECRET,
    );
    headers.set('Cookie', `${SESSION_COOKIE}=${session}`);
  }
  const response = await handleBulletinRequestV1(
    new Request(`${testEnv.OFFICIAL_ORIGIN}${GRADEBOOK_BULLETIN_ROUTE_V1}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    {
      ...testEnv,
      RUNTIME_ENVIRONMENT: 'local',
      GRADEBOOK_STORAGE_PROVIDER: 'postgres',
      GRADEBOOK_D1: database,
      ...overrides,
    },
  );
  if (!response) throw new Error('route-not-found');
  return response;
}

describe('relational bulletin V2 HTTP boundary', () => {
  const catalog = { contractVersion: 2, operation: 'catalog', year: 2026 };

  it('serves only the persistence administrator and always uses no-store', async () => {
    const response = await http(catalog);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toMatchObject({
      contractVersion: 2,
      state: 'ready',
      operation: 'catalog',
    });
    expect((await http(catalog, 'PROFESSOR')).status).toBe(403);
    expect((await http(catalog, null)).status).toBe(401);
  });

  it('accepts another valid year scope and keeps the production feature gate closed', async () => {
    expect((await http({ ...catalog, year: 2025 })).status).toBe(200);
    expect(
      (
        await http(catalog, 'ADMINISTRADOR', {
          RUNTIME_ENVIRONMENT: 'production',
          GRADEBOOK_PRODUCTION_ENABLED: 'false',
        })
      ).status,
    ).toBe(503);
  });
});
