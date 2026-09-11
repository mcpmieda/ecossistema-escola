import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRelationalBulletinServiceV2 } from '../../../server/gradebook/application/bulletins/relational-bulletin-v2';
import { createRelationalCouncilV3 } from '../../../server/gradebook/application/council/relational-council-v3';
import { replaceGradebookImportDiagnosticsSnapshotV1 } from '../../../server/gradebook/application/import/import-diagnostics-snapshot-v1';
import { createPerformanceAnalysisV3 } from '../../../server/gradebook/application/read-models/performance/performance-analysis-v3';
import { createPerformanceTermComparisonV4 } from '../../../server/gradebook/application/read-models/performance/performance-term-comparison-v4';
import { createRelationalInstitutionalReportsServiceV2 } from '../../../server/gradebook/application/reports/relational-institutional-reports-v2';
import {
  createGradebookPostgresDatabaseV1,
  type GradebookPostgresDatabaseV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { createRelationalBulletinSnapshotRepositoryV2 } from '../../../server/gradebook/persistence/postgres/relational-bulletin-snapshot-v2';
import { createRelationalImportDiagnosticsReadV2 } from '../../../server/gradebook/persistence/postgres/relational-import-diagnostics-read-v2';
import { assertDisposableRecoveryTargetV2 } from '../../../server/gradebook/recovery/logical-backup-recovery-v2';
import type { D1WriteValueV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type {
  RelationalCouncilRequestV3,
  RelationalCouncilResponseV3,
} from '../../../shared/gradebook-contracts/council/relational-council-v3';
import type { GradebookImportDiagnosticsAuditRequestV1 } from '../../../shared/gradebook-contracts/imports/import-diagnostics-v1';

const CONNECTION_STRING = process.env.GRADEBOOK_RECOVERY_DATABASE_URL ?? '';
const integration = CONNECTION_STRING.length > 0 ? describe : describe.skip;
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const DIAGNOSTIC_FILE = 'recovery-rehearsal-662.xlsx';
const DIAGNOSTIC_HASH_A = 'a'.repeat(64);
const DIAGNOSTIC_HASH_B = 'b'.repeat(64);
const COUNCIL_KEY_PREFIX = 'recovery662:contention';
const ALL_STATUSES = [null, 1, 2, 3, 4, 5, 7] as const;

type Row = Record<string, unknown>;

let databaseA: GradebookPostgresDatabaseV1;
let databaseB: GradebookPostgresDatabaseV1;

async function rows(
  database: GradebookPostgresDatabaseV1,
  query: string,
  values: readonly D1WriteValueV1[] = [],
): Promise<readonly Row[]> {
  return (await database.prepare(query).bind(...values).all<Row>()).results;
}

function reports(database: GradebookPostgresDatabaseV1) {
  const bulletins = createRelationalBulletinServiceV2({
    database,
    snapshots: createRelationalBulletinSnapshotRepositoryV2(database),
  });
  return createRelationalInstitutionalReportsServiceV2({
    performanceAnalysis: createPerformanceAnalysisV3(database),
    performanceComparison: createPerformanceTermComparisonV4(database),
    council: createRelationalCouncilV3(database, ACTOR_ID),
    bulletins,
    diagnostics: createRelationalImportDiagnosticsReadV2(database),
  });
}

function diagnosticRequest(
  hash: string,
  marker: 'a' | 'b',
): GradebookImportDiagnosticsAuditRequestV1 {
  return {
    version: 1,
    academicYear: 2026,
    fileName: DIAGNOSTIC_FILE,
    sha256: hash,
    diagnostics: [1, 2].map((index) => ({
      key: `${marker}-${String(index)}`,
      severity: 'warning' as const,
      code: 'source-unavailable' as const,
      message: 'Diagnóstico sintético do ensaio local.',
      recommendedAction: 'Nenhuma ação; massa descartável de contenção.',
      fieldKind: 'file' as const,
    })),
  };
}

async function removeSyntheticDiagnostics(): Promise<void> {
  await databaseA
    .prepare(`DELETE FROM gradebook.importacao_diagnostico
      WHERE arquivo=? OR hash IN (decode(?,'hex'),decode(?,'hex'))`)
    .bind(DIAGNOSTIC_FILE, DIAGNOSTIC_HASH_A, DIAGNOSTIC_HASH_B)
    .run();
}

async function removeSyntheticCouncil(classId: number): Promise<void> {
  await databaseA.transaction(async (transaction) => {
    await transaction
      .prepare('UPDATE gradebook.conselho_sessao SET fechamento_atual_id=NULL WHERE ano=? AND turma_id=?')
      .bind(2026, classId)
      .run();
    await transaction
      .prepare(`DELETE FROM gradebook.conselho_fechamento_item WHERE fechamento_id IN
        (SELECT id FROM gradebook.conselho_fechamento WHERE ano=? AND turma_id=?)`)
      .bind(2026, classId)
      .run();
    for (const relation of [
      'conselho_fechamento',
      'conselho_decisao_comando',
      'conselho_votacao_historico',
      'conselho_votacao',
      'conselho_sessao_historico',
    ]) {
      await transaction
        .prepare(`DELETE FROM gradebook.${relation} WHERE ano=? AND turma_id=?`)
        .bind(2026, classId)
        .run();
    }
    await transaction
      .prepare('DELETE FROM gradebook.conselho_idempotencia WHERE chave LIKE ?')
      .bind(`${COUNCIL_KEY_PREFIX}:%`)
      .run();
    await transaction
      .prepare('DELETE FROM gradebook.conselho_sessao WHERE ano=? AND turma_id=?')
      .bind(2026, classId)
      .run();
  });
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: () => resolvePromise?.() };
}

integration('relational recovery and contention V2 on disposable PostgreSQL', () => {
  beforeAll(async () => {
    assertDisposableRecoveryTargetV2(CONNECTION_STRING);
    databaseA = await createGradebookPostgresDatabaseV1(CONNECTION_STRING, {
      maximumConnections: 2,
      statementTimeoutMilliseconds: 120_000,
      lockTimeoutMilliseconds: 30_000,
    });
    databaseB = await createGradebookPostgresDatabaseV1(CONNECTION_STRING, {
      maximumConnections: 2,
      statementTimeoutMilliseconds: 120_000,
      lockTimeoutMilliseconds: 30_000,
    });
  }, 30_000);

  afterAll(async () => {
    await removeSyntheticDiagnostics().catch(() => undefined);
    await Promise.all([databaseA?.close(), databaseB?.close()]);
  });

  it('serves recovered catalog, T2 versus T1, audit, Council and empty bulletin history', async () => {
    const service = reports(databaseA);
    const catalog = await service.execute(
      { contractVersion: 2, operation: 'catalog', year: 2026 },
      { oid: ACTOR_ID },
    );
    expect(catalog.state).toBe('ready');
    if (catalog.state !== 'ready' || catalog.operation !== 'catalog') {
      throw new Error('recovery-catalog-not-ready');
    }
    expect(catalog.classes.length).toBeGreaterThan(0);
    const classId = catalog.classes[0]!.id;

    const performance = await service.execute(
      {
        contractVersion: 2,
        operation: 'performance',
        family: 'class-results',
        year: 2026,
        classId,
        period: 2,
        lens: 'result',
        referenceTerm: 1,
        statuses: [...ALL_STATUSES],
      },
      { oid: ACTOR_ID },
    );
    expect(performance.state).toBe('ready');

    const audit = await service.execute(
      {
        contractVersion: 2,
        operation: 'audit',
        year: 2026,
        severities: [],
        codes: [],
        classCode: null,
        limit: 5,
        offset: 0,
      },
      { oid: ACTOR_ID },
    );
    expect(audit.state).toBe('ready');

    const council = await service.execute(
      { contractVersion: 2, operation: 'council', year: 2026, classId },
      { oid: ACTOR_ID },
    );
    expect(council.state).toBe('ready');

    const history = await service.execute(
      { contractVersion: 2, operation: 'bulletin-history', year: 2026, classId },
      { oid: ACTOR_ID },
    );
    expect(history.state).toBe('ready');
    if (history.state !== 'ready' || history.operation !== 'bulletin-history') {
      throw new Error('recovery-bulletin-history-not-ready');
    }
    expect(history.report.items).toHaveLength(0);
  }, 120_000);

  it('blocks a competing diagnostic replacement and keeps only one complete last commit', async () => {
    await removeSyntheticDiagnostics();
    const acquired = deferred();
    const release = deferred();
    const sourceKey = `gradebook-import-diagnostics-source:${JSON.stringify([2026, DIAGNOSTIC_FILE])}`;
    const blocker = databaseA.transaction(async (transaction) => {
      await transaction
        .prepare('SELECT pg_advisory_xact_lock(hashtextextended(?, 629)) AS locked')
        .bind(sourceKey)
        .first();
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;

    const waitingWrite = replaceGradebookImportDiagnosticsSnapshotV1(
      databaseB,
      diagnosticRequest(DIAGNOSTIC_HASH_A, 'a'),
    );
    const settlement = await Promise.race([
      waitingWrite.then(() => 'settled', () => 'failed'),
      new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), 100)),
    ]);
    expect(settlement).toBe('waiting');
    release.resolve();
    await blocker;
    await expect(waitingWrite).resolves.toBeGreaterThan(0);

    await Promise.all([
      replaceGradebookImportDiagnosticsSnapshotV1(
        databaseA,
        diagnosticRequest(DIAGNOSTIC_HASH_A, 'a'),
      ),
      replaceGradebookImportDiagnosticsSnapshotV1(
        databaseB,
        diagnosticRequest(DIAGNOSTIC_HASH_B, 'b'),
      ),
    ]);
    const finalRows = await rows(
      databaseA,
      `SELECT chave,encode(hash,'hex') AS hash FROM gradebook.importacao_diagnostico
       WHERE arquivo=? ORDER BY chave`,
      [DIAGNOSTIC_FILE],
    );
    expect(finalRows).toHaveLength(2);
    const markers = new Set(finalRows.map((row) => String(row.chave).slice(0, 1)));
    const hashes = new Set(finalRows.map((row) => row.hash));
    expect(markers.size).toBe(1);
    expect(hashes.size).toBe(1);

    const beforeRollback = finalRows.map((row) => `${String(row.chave)}:${String(row.hash)}`);
    await expect(
      databaseA.transaction(async (transaction) => {
        await transaction
          .prepare('DELETE FROM gradebook.importacao_diagnostico WHERE arquivo=?')
          .bind(DIAGNOSTIC_FILE)
          .run();
        throw new Error('synthetic-recovery-rollback');
      }),
    ).rejects.toThrow('synthetic-recovery-rollback');
    const afterRollback = await rows(
      databaseA,
      `SELECT chave,encode(hash,'hex') AS hash FROM gradebook.importacao_diagnostico
       WHERE arquivo=? ORDER BY chave`,
      [DIAGNOSTIC_FILE],
    );
    expect(afterRollback.map((row) => `${String(row.chave)}:${String(row.hash)}`)).toEqual(
      beforeRollback,
    );
    await removeSyntheticDiagnostics();
  }, 120_000);

  it('serializes stale Council commands with CAS and keeps the winner idempotent', async () => {
    const councilA = createRelationalCouncilV3(databaseA, ACTOR_ID);
    const councilB = createRelationalCouncilV3(databaseB, ACTOR_ID);
    const classes = await councilA.execute({
      contractVersion: 3,
      operation: 'classes',
      year: 2026,
      offset: 0,
      limit: 100,
    });
    if (classes.state !== 'ready' || classes.operation !== 'classes') {
      throw new Error('recovery-council-classes-not-ready');
    }

    let candidate:
      | { readonly classId: number; readonly studentId: number }
      | { readonly classId: number; readonly studentId: null }
      | null = null;
    for (const classGroup of classes.classes) {
      const workspace = await councilA.execute({
        contractVersion: 3,
        operation: 'workspace',
        year: 2026,
        classId: classGroup.id,
      });
      if (workspace.state !== 'ready' || workspace.operation === 'classes') continue;
      const eligible = workspace.workspace.students.find((student) => student.eligibility.eligible);
      if (eligible) {
        candidate = { classId: classGroup.id, studentId: eligible.id };
        break;
      }
      if (candidate === null && workspace.workspace.summary.pending === 0) {
        candidate = { classId: classGroup.id, studentId: null };
      }
    }
    expect(candidate).not.toBeNull();
    if (candidate === null) throw new Error('recovery-council-candidate-missing');
    await removeSyntheticCouncil(candidate.classId);

    const opened = await councilA.execute({
      contractVersion: 3,
      operation: 'open',
      year: 2026,
      classId: candidate.classId,
      expectedVersion: 0,
      idempotencyKey: `${COUNCIL_KEY_PREFIX}:open`,
      justification: 'Abertura sintética do ensaio local.',
    });
    expect(opened.state).toBe('ready');
    if (opened.state !== 'ready' || opened.operation === 'classes') {
      throw new Error('recovery-council-open-not-ready');
    }

    const commands: readonly [RelationalCouncilRequestV3, RelationalCouncilRequestV3] =
      candidate.studentId === null
        ? [
            {
              contractVersion: 3,
              operation: 'close',
              year: 2026,
              classId: candidate.classId,
              expectedVersion: 1,
              idempotencyKey: `${COUNCIL_KEY_PREFIX}:close-a`,
              justification: 'Fechamento concorrente sintético A.',
              reviewReference: opened.workspace.session.reviewReference,
            },
            {
              contractVersion: 3,
              operation: 'close',
              year: 2026,
              classId: candidate.classId,
              expectedVersion: 1,
              idempotencyKey: `${COUNCIL_KEY_PREFIX}:close-b`,
              justification: 'Fechamento concorrente sintético B.',
              reviewReference: opened.workspace.session.reviewReference,
            },
          ]
        : [
            {
              contractVersion: 3,
              operation: 'vote',
              year: 2026,
              classId: candidate.classId,
              studentId: candidate.studentId,
              favoraveis: 2,
              contrarios: 1,
              expectedVersion: 1,
              idempotencyKey: `${COUNCIL_KEY_PREFIX}:vote-a`,
              justification: 'Votação concorrente sintética A.',
            },
            {
              contractVersion: 3,
              operation: 'vote',
              year: 2026,
              classId: candidate.classId,
              studentId: candidate.studentId,
              favoraveis: 1,
              contrarios: 2,
              expectedVersion: 1,
              idempotencyKey: `${COUNCIL_KEY_PREFIX}:vote-b`,
              justification: 'Votação concorrente sintética B.',
            },
          ];

    const settled = await Promise.allSettled([
      councilA.execute(commands[0]),
      councilB.execute(commands[1]),
    ]);
    expect(settled.every((item) => item.status === 'fulfilled')).toBe(true);
    const responses = settled
      .filter((item): item is PromiseFulfilledResult<RelationalCouncilResponseV3> =>
        item.status === 'fulfilled',
      )
      .map((item) => item.value);
    expect(responses.map((response) => response.state).sort()).toEqual([
      'ready',
      'version-conflict',
    ]);
    const winnerIndex = responses.findIndex((response) => response.state === 'ready');
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    const retry = await councilB.execute(commands[winnerIndex]);
    expect(retry.state).toBe('ready');
    if (retry.state !== 'ready' || retry.operation === 'classes') {
      throw new Error('recovery-council-idempotent-retry-failed');
    }
    expect(retry.workspace.session.version).toBe(2);
    await removeSyntheticCouncil(candidate.classId);
  }, 120_000);
});
