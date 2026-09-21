import type { RelationalBulletinSnapshotV2 } from '../../../shared/gradebook-contracts/bulletins/relational-bulletin-v2';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresQuerySqlV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { createRelationalBulletinSnapshotRepositoryV2 } from '../../../server/gradebook/persistence/postgres/relational-bulletin-snapshot-v2';

type Row = Record<string, unknown>;
export interface SnapshotSqlCallV2 {
  readonly channel: 'pool' | 'tx';
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

export function snapshotFixtureV2(version = 1): RelationalBulletinSnapshotV2 {
  return {
    snapshotId: '11111111-1111-4111-8111-111111111111',
    snapshotVersion: version,
    dataVersion: `synthetic-data-${String(version)}`,
    emittedAt: '2026-09-21T12:00:00.000Z',
    presentation: { locale: 'pt-BR', dateStyle: 'long' },
    model: {
      contractVersion: 2,
      modelVersion: 2,
      year: 2026,
      period: { kind: 'term', term: 1 },
      detail: 'summary',
      authority: {
        officialValues: 'imported-source',
        calculatedValues: 'descriptive-comparison',
        formalDecision: 'human-recorded-only',
      },
      readAt: '2026-09-21T11:59:00.000Z',
      classGroup: { id: 10, code: 'SYN', name: 'SYNTHETIC CLASS' },
      student: {
        id: 20,
        number: 1,
        name: 'SYNTHETIC STUDENT',
        statusCode: null,
        statusLabel: 'REGULAR',
      },
      subjects: [],
      overall: { calculatedResult: null, formalCouncilDecision: null, visibleResult: null },
      emissionReadiness: { ready: true, reasons: [] },
    },
  };
}

export function appendFixtureV2(version = 1) {
  return {
    seriesKey: 'synthetic-series',
    expectedPreviousVersion: version - 1,
    issuerOid: '22222222-2222-4222-8222-222222222222',
    snapshot: snapshotFixtureV2(version),
  };
}

function storedRow(snapshot: RelationalBulletinSnapshotV2, seriesKey = 'synthetic-series'): Row {
  return {
    snapshot_id: snapshot.snapshotId,
    versao: snapshot.snapshotVersion,
    chave_serie: seriesKey,
    data_version: snapshot.dataVersion,
    emitido_em: snapshot.emittedAt,
    payload_json: JSON.stringify(snapshot),
  };
}

export function snapshotHarnessV2(
  options: {
    readonly initial?: readonly RelationalBulletinSnapshotV2[];
    readonly insertCount?: number;
    readonly insertError?: string;
    readonly revisionFailure?: boolean;
  } = {},
) {
  let stored = (options.initial ?? []).map((snapshot) => storedRow(snapshot));
  let revisions = 0;
  let transactionOpen = false;
  const calls: SnapshotSqlCallV2[] = [];
  const events: string[] = [];
  const client = (channel: 'pool' | 'tx'): GradebookPostgresQuerySqlV1 => ({
    typed: (value, oid) => ({ __typed: value, oid }),
    async unsafe(sql, parameters = []) {
      if (channel === 'pool' && transactionOpen)
        throw new Error('snapshot-query-escaped-transaction');
      calls.push({ channel, sql, parameters });
      const result = (rows: Row[], count = rows.length) => Object.assign(rows, { count });
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('ensure_year_coordination_v1')) {
        return result([]);
      }
      if (sql.includes('record_gradebook_change_v1')) {
        if (options.revisionFailure) throw new Error('synthetic-revision-failed');
        revisions += 1;
        return result([{ reset_version: `synthetic-reset-${String(revisions)}` }]);
      }
      if (sql.startsWith('INSERT INTO gradebook.boletim_snapshot')) {
        if (options.insertError)
          throw Object.assign(new Error('synthetic-insert-failed'), { code: options.insertError });
        const parameter = parameters[12];
        const json =
          typeof parameter === 'object' && parameter !== null && '__typed' in parameter
            ? parameter.__typed
            : parameter;
        if (typeof json !== 'string') throw new Error('synthetic-snapshot-json-missing');
        stored.push(
          storedRow(JSON.parse(json) as RelationalBulletinSnapshotV2, String(parameters[2])),
        );
        return result([], options.insertCount ?? 1);
      }
      if (sql.includes('JOIN gradebook.turma')) {
        return result(
          stored
            .filter((row) => {
              const snapshot = JSON.parse(String(row.payload_json)) as RelationalBulletinSnapshotV2;
              return (
                !sql.includes('b.aluno_id IN') ||
                parameters.slice(2, -1).includes(snapshot.model.student.id)
              );
            })
            .map((row) => {
              const snapshot = JSON.parse(String(row.payload_json)) as RelationalBulletinSnapshotV2;
              return {
                ...row,
                turma_id: snapshot.model.classGroup.id,
                turma_nome: snapshot.model.classGroup.name,
                aluno_id: snapshot.model.student.id,
                aluno_nome: snapshot.model.student.name,
                payload_json: JSON.stringify(snapshot.model.period),
                detalhe: snapshot.model.detail,
              };
            }),
        );
      }
      if (sql.includes('FROM gradebook.boletim_snapshot')) {
        const rows = sql.includes('chave_serie =')
          ? stored
              .filter((row) => row.chave_serie === parameters[0])
              .sort((a, b) => Number(b.versao) - Number(a.versao))
              .slice(0, 1)
          : stored.filter(
              (row) => row.snapshot_id === parameters[0] && row.versao === parameters[1],
            );
        return result(rows);
      }
      throw new Error(`unexpected-snapshot-test-sql: ${sql}`);
    },
  });
  const database = createGradebookPostgresDatabaseFromSqlV1({
    ...client('pool'),
    async begin(operation) {
      events.push('begin');
      const before = [...stored];
      const previousRevisions = revisions;
      transactionOpen = true;
      try {
        const result = await operation(client('tx'));
        events.push('commit');
        return result;
      } catch (cause) {
        stored = before;
        revisions = previousRevisions;
        events.push('rollback');
        throw cause;
      } finally {
        transactionOpen = false;
      }
    },
  });
  return {
    database,
    repository: createRelationalBulletinSnapshotRepositoryV2(database),
    calls,
    events,
    state: () => ({ stored, revisions }),
  };
}
