import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRelationalCouncilV3 } from '../../../server/gradebook/application/council/relational-council-v3';
import { createCouncilWorkspaceRequestHandlerV1 } from '../../../server/gradebook/http/council-routes-v1';
import { seal } from '../../../server/auth/sealed';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { testEnv } from '../../fixtures';
import type { RuntimeEnv } from '../../../server/env';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresDatabaseV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';

const ACTOR = '11111111-1111-4111-8111-111111111111';
let pg: PGlite;
let database: GradebookPostgresDatabaseV1;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await pg.exec('CREATE ROLE gradebook_app NOLOGIN NOSUPERUSER NOBYPASSRLS;');
  await pg.exec(readFileSync('migrations/gradebook-simplified/0003_council_session_v3.sql', 'utf8'));
  await pg.exec(readFileSync('migrations/gradebook-simplified/0004_council_v3_least_privilege.sql', 'utf8'));
  await pg.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2026,60000,2);
    INSERT INTO gradebook.turma (id,ano,codigo,nome,etapa,turno) VALUES
      (10,2026,'6A','TURMA SINTETICA',6,'M');
    INSERT INTO gradebook.professor (id,ano,nome) VALUES (1,2026,'DOCENTE SINTETICO');
    INSERT INTO gradebook.disciplina (id,ano,nome) VALUES (1,2026,'MATEMATICA');
    INSERT INTO gradebook.oferta (id,ano,turma_id,professor_id,disciplina_id) VALUES (10,2026,10,1,1);
    INSERT INTO gradebook.aluno (id,ano,nome) VALUES
      (1,2026,'ALUNO ELEGIVEL'),(2,2026,'ALUNO APROVADO'),(3,2026,'ALUNO TRANSFERIDO');
    INSERT INTO gradebook.vinculo (ano,turma_id,numero,aluno_id,situacao) VALUES
      (2026,10,1,1,NULL),(2026,10,2,2,NULL),(2026,10,3,3,4);
    INSERT INTO gradebook.instrumento (id,oferta_id,trimestre,slot,maximo,descricao)
      SELECT 100+t*10+s,10,t,s,15000,'AVALIACAO SINTETICA'
      FROM generate_series(1,3) t CROSS JOIN generate_series(1,2) s;
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT id,1,0 FROM gradebook.instrumento;
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT id,2,15000 FROM gradebook.instrumento;
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT id,3,15000 FROM gradebook.instrumento;
    INSERT INTO gradebook.fechamento (oferta_id,aluno_id,rec1,rec2,rec3,rec_nc_mask,u_fonte)
      VALUES (10,1,10000,10000,10000,0,30000);
  `);
  database = createGradebookPostgresDatabaseFromSqlV1({
    async unsafe() { throw new Error('outside-transaction'); },
    async begin(operation) {
      return pg.transaction(async (tx) => operation({ async unsafe(sql, values = []) {
        const result = await tx.query<Record<string, unknown>>(sql, [...values]);
        return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
      } }));
    },
    async end() { await pg.close(); },
  });
}, 30_000);
afterAll(async () => { await database?.close(); });

function request(operation: string, extra: Record<string, unknown> = {}) {
  return { contractVersion: 3, operation, year: 2026, classId: 10, ...extra };
}

describe('relational Council V3 lifecycle', () => {
  it('keeps eligibility calculated and completes open, decide, vote, close, reopen and close again', async () => {
    const service = createRelationalCouncilV3(database, ACTOR);
    expect(await service.execute({ contractVersion: 3, operation: 'classes', year: 2026, offset: 0, limit: 100 })).toMatchObject({
      state: 'ready', classes: [{ id: 10, sessionState: 'not-opened', sessionVersion: 0 }],
    });
    const initial = await service.execute(request('workspace'));
    expect(initial).toMatchObject({ state: 'ready', workspace: { session: { state: 'not-opened', version: 0 },
      summary: { total: 3, eligible: 1, pending: 1, notEligible: 2 } } });
    if (initial.state !== 'ready' || initial.operation === 'classes') throw new Error('initial-workspace-missing');
    const eligibleStudent = initial.workspace.students.find((student) => student.id === 1);
    expect(eligibleStudent).toMatchObject({ eligibility: { eligible: true, failedComponentCount: 1 } });
    expect(eligibleStudent?.components[0]).toMatchObject({ result: 'not-approved' });
    expect(eligibleStudent?.components[0]?.terms.map((term) => term.valueMilli)).toEqual([0, 0, 0]);
    expect(initial.workspace.students.find((student) => student.id === 2)?.eligibility.code).toBe('approved');
    expect(initial.workspace.students.find((student) => student.id === 3)?.eligibility.code).toBe('status');

    expect(await service.execute(request('open', { expectedVersion: 0, idempotencyKey: 'open:synthetic:0001', justification: 'Início da reunião.' })))
      .toMatchObject({ state: 'ready', workspace: { session: { state: 'open', version: 1 } } });
    expect(await service.execute(request('decision', { studentId: 2, decision: 1, expectedVersion: 1,
      idempotencyKey: 'decision:ineligible:0001', justification: 'Tentativa sintética.' }))).toEqual({
      contractVersion: 3, state: 'student-not-eligible', currentVersion: 1,
    });

    const decisionRequest = request('decision', { studentId: 1, decision: 1, expectedVersion: 1,
      idempotencyKey: 'decision:synthetic:0001', justification: 'Deliberação favorável registrada.' });
    const decided = await service.execute(decisionRequest);
    expect(decided).toMatchObject({ state: 'ready', workspace: { session: { version: 2 }, summary: { decided: 1, approved: 1, pending: 0 } } });
    expect(await service.execute(decisionRequest)).toMatchObject({ state: 'ready', workspace: { session: { version: 2 } } });
    expect(await service.execute({ ...decisionRequest, decision: 2 })).toEqual({ contractVersion: 3, state: 'idempotency-conflict' });

    const voted = await service.execute(request('vote', { studentId: 1, favoraveis: 2, contrarios: 2,
      expectedVersion: 2, idempotencyKey: 'vote:synthetic:0001', justification: 'Contagem numérica da reunião.' }));
    expect(voted).toMatchObject({ state: 'ready', workspace: { session: { version: 3 } } });
    if (voted.state !== 'ready' || voted.operation === 'classes') throw new Error('voted-workspace-missing');
    expect(voted.workspace.students.find((student) => student.id === 1)?.vote).toMatchObject({
      favoraveis: 2, contrarios: 2, presentes: 4, comparison: 'empate',
    });

    const closed = await service.execute(request('close', { expectedVersion: 3, reviewReference: voted.workspace.session.reviewReference,
      idempotencyKey: 'close:synthetic:0001', justification: 'Primeiro fechamento da reunião.' }));
    expect(closed).toMatchObject({ state: 'ready', workspace: { session: { state: 'closed', version: 4, snapshotCount: 1 },
      closures: [{ sequence: 1, summary: { eligible: 1, approved: 1 } }] } });
    expect(await service.execute(request('decision', { studentId: 1, decision: 2, expectedVersion: 4,
      idempotencyKey: 'decision:closed:0001', justification: 'Alteração bloqueada.' }))).toEqual({
      contractVersion: 3, state: 'session-closed', currentVersion: 4,
    });

    const reopened = await service.execute(request('reopen', { expectedVersion: 4,
      idempotencyKey: 'reopen:synthetic:0001', justification: 'Correção formal após revisão.' }));
    expect(reopened).toMatchObject({ state: 'ready', workspace: { session: { state: 'open', version: 5, snapshotCount: 1 } } });
    const changed = await service.execute(request('decision', { studentId: 1, decision: 2, expectedVersion: 5,
      idempotencyKey: 'decision:synthetic:0002', justification: 'Deliberação revista em nova sessão.' }));
    expect(changed).toMatchObject({ state: 'ready', workspace: { session: { version: 6 }, summary: { approved: 0, rejected: 1 } } });
    expect(await service.execute(request('close', { expectedVersion: 6, reviewReference: 'council-review:2026:10:5',
      idempotencyKey: 'close:synthetic:wrong', justification: 'Revisão desatualizada.' }))).toEqual({
      contractVersion: 3, state: 'review-conflict', currentVersion: 6,
    });
    if (changed.state !== 'ready' || changed.operation === 'classes') throw new Error('changed-workspace-missing');
    const closedAgain = await service.execute(request('close', { expectedVersion: 6, reviewReference: changed.workspace.session.reviewReference,
      idempotencyKey: 'close:synthetic:0002', justification: 'Segundo fechamento após correção.' }));
    expect(closedAgain).toMatchObject({ state: 'ready', workspace: { session: { state: 'closed', version: 7, snapshotCount: 2 },
      closures: [{ sequence: 2, summary: { rejected: 1 } }, { sequence: 1, summary: { approved: 1 } }] } });

    const snapshots = (await pg.query('SELECT f.sequencia,i.decisao,i.favoraveis,i.contrarios FROM gradebook.conselho_fechamento f JOIN gradebook.conselho_fechamento_item i ON i.fechamento_id=f.id WHERE i.aluno_id=1 ORDER BY f.sequencia')).rows;
    expect(snapshots).toEqual([
      { sequencia: 1, decisao: 1, favoraveis: 2, contrarios: 2 },
      { sequencia: 2, decisao: 2, favoraveis: 2, contrarios: 2 },
    ]);
    expect((await pg.query('SELECT count(*)::integer AS count FROM gradebook.conselho_idempotencia')).rows).toEqual([{ count: 7 }]);
    expect((await pg.query('SELECT count(*)::integer AS count FROM gradebook.conselho_decisao_historico')).rows).toEqual([{ count: 1 }]);
  }, 30_000);

  it('serializes concurrent stale writes with CAS and keeps a retry idempotent', async () => {
    const service = createRelationalCouncilV3(database, ACTOR);
    const first = request('reopen', { expectedVersion: 7, idempotencyKey: 'reopen:concurrency:0001', justification: 'Reabertura para teste de concorrência.' });
    expect(await service.execute(first)).toMatchObject({ state: 'ready', workspace: { session: { state: 'open', version: 8 } } });
    expect(await service.execute(request('reopen', { expectedVersion: 7, idempotencyKey: 'reopen:concurrency:0002', justification: 'Comando concorrente obsoleto.' })))
      .toEqual({ contractVersion: 3, state: 'version-conflict', currentVersion: 8 });
    expect(await service.execute(first)).toMatchObject({ state: 'ready', workspace: { session: { state: 'open', version: 8 } } });
  });
});

async function http(body: unknown, role: 'ADMINISTRADOR' | 'PROFESSOR' | null = 'ADMINISTRADOR', overrides: Partial<RuntimeEnv> = {}) {
  const headers = new Headers({ Origin: testEnv.OFFICIAL_ORIGIN, 'Content-Type': 'application/json' });
  if (role) headers.set('Cookie', `${SESSION_COOKIE}=${await seal({ oid: ACTOR, name: 'Synthetic', username: 'synthetic@example.test', roles: [role], exp: Math.floor(Date.now() / 1000) + 600 }, testEnv.SESSION_SECRET)}`);
  const handler = createCouncilWorkspaceRequestHandlerV1({ createWorkspace: () => null });
  const response = await handler(new Request(`${testEnv.OFFICIAL_ORIGIN}/api/gradebook/council-workspace`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }), { ...testEnv, RUNTIME_ENVIRONMENT: 'local', GRADEBOOK_STORAGE_PROVIDER: 'postgres', GRADEBOOK_D1: database, ...overrides });
  if (!response) throw new Error('route-not-found');
  return response;
}

describe('relational Council V3 HTTP boundary', () => {
  it('serves V3 only to the existing persistence administrator with no-store', async () => {
    const body = { contractVersion: 3, operation: 'classes', year: 2026, offset: 0, limit: 100 };
    const response = await http(body);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ contractVersion: 3, state: 'ready', operation: 'classes' });
    expect((await http(body, 'PROFESSOR')).status).toBe(403);
    expect((await http(body, null)).status).toBe(401);
  });

  it('rejects malformed V3 before SQL and preserves the production gate', async () => {
    expect((await http({ contractVersion: 3, operation: 'classes', year: 2025, offset: 0, limit: 100 })).status).toBe(400);
    expect((await http({ contractVersion: 3, operation: 'classes', year: 2026, offset: 0, limit: 100 }, 'ADMINISTRADOR', {
      RUNTIME_ENVIRONMENT: 'production', GRADEBOOK_PRODUCTION_ENABLED: 'false',
    })).status).toBe(503);
  });
});
