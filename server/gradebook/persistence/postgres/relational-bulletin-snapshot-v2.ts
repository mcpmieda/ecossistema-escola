import {
  RELATIONAL_BULLETIN_LIMITS_V2,
  relationalBulletinSnapshotSchemaV2,
  type RelationalBulletinHistoryItemV2,
  type RelationalBulletinSnapshotV2,
} from '../../../../shared/gradebook-contracts/bulletins/relational-bulletin-v2';
import type { D1WriteDatabaseV1, D1WriteValueV1 } from '../d1/write/d1-write-adapter-v1';

type Row = Record<string, unknown>;
type TransactionDatabaseV2 = D1WriteDatabaseV1 & {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
};

export type RelationalBulletinSnapshotAppendV2 =
  | { readonly state: 'appended'; readonly snapshot: RelationalBulletinSnapshotV2 }
  | { readonly state: 'version-conflict' };

export interface RelationalBulletinSnapshotRepositoryV2 {
  getLatest(seriesKey: string): Promise<RelationalBulletinSnapshotV2 | null>;
  get(snapshotId: string, snapshotVersion: number): Promise<RelationalBulletinSnapshotV2 | null>;
  append(input: {
    readonly seriesKey: string;
    readonly expectedPreviousVersion: number;
    readonly issuerOid: string;
    readonly snapshot: RelationalBulletinSnapshotV2;
  }): Promise<RelationalBulletinSnapshotAppendV2>;
  history(input: {
    readonly year: 2026;
    readonly classId: number;
    readonly studentIds?: readonly number[];
  }): Promise<readonly RelationalBulletinHistoryItemV2[]>;
}

function asInteger(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('relational-bulletin-snapshot-invalid-row');
  return parsed;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('relational-bulletin-snapshot-invalid-row');
  }
  return value;
}

function snapshotFromRow(row: Row): RelationalBulletinSnapshotV2 {
  const payload = requiredString(row.payload_json);
  const parsed = relationalBulletinSnapshotSchemaV2.safeParse(JSON.parse(payload));
  if (
    !parsed.success ||
    parsed.data.snapshotId !== row.snapshot_id ||
    parsed.data.snapshotVersion !== asInteger(row.versao) ||
    parsed.data.dataVersion !== row.data_version ||
    parsed.data.emittedAt !== row.emitido_em
  ) {
    throw new Error('relational-bulletin-snapshot-invalid-row');
  }
  return Object.freeze(parsed.data);
}

function changes(value: unknown): number {
  const result = value as {
    readonly success?: boolean;
    readonly changes?: number;
    readonly meta?: { readonly changes?: number };
  };
  const count = result.meta?.changes ?? result.changes;
  if (result.success === false || !Number.isInteger(count) || Number(count) < 0) {
    throw new Error('relational-bulletin-snapshot-write-failed');
  }
  return Number(count);
}

async function all(
  database: D1WriteDatabaseV1,
  sql: string,
  values: readonly D1WriteValueV1[] = [],
): Promise<readonly Row[]> {
  return (
    await database
      .prepare(sql)
      .bind(...values)
      .all<Row>()
  ).results;
}

export function createRelationalBulletinSnapshotRepositoryV2(
  database: D1WriteDatabaseV1,
): RelationalBulletinSnapshotRepositoryV2 {
  const transactional = database as TransactionDatabaseV2;
  if (typeof transactional.transaction !== 'function') {
    throw new Error('relational-bulletin-postgres-required');
  }

  return {
    async getLatest(seriesKey) {
      const row = await database
        .prepare(
          `SELECT snapshot_id, versao, data_version, emitido_em,
                snapshot_json AS payload_json
           FROM gradebook.boletim_snapshot
          WHERE chave_serie = ?
          ORDER BY versao DESC
          LIMIT 1`,
        )
        .bind(seriesKey)
        .first<Row>();
      return row === null ? null : snapshotFromRow(row);
    },

    async get(snapshotId, snapshotVersion) {
      const row = await database
        .prepare(
          `SELECT snapshot_id, versao, data_version, emitido_em,
                snapshot_json AS payload_json
           FROM gradebook.boletim_snapshot
          WHERE snapshot_id = ? AND versao = ?`,
        )
        .bind(snapshotId, snapshotVersion)
        .first<Row>();
      return row === null ? null : snapshotFromRow(row);
    },

    async append(input) {
      const parsed = relationalBulletinSnapshotSchemaV2.safeParse(input.snapshot);
      if (
        !parsed.success ||
        !Number.isInteger(input.expectedPreviousVersion) ||
        input.expectedPreviousVersion < 0
      ) {
        throw new Error('relational-bulletin-snapshot-invalid-input');
      }
      try {
        return await transactional.transaction(async (tx) => {
          const current = await tx
            .prepare(
              `SELECT snapshot_id, versao
               FROM gradebook.boletim_snapshot
              WHERE chave_serie = ?
              ORDER BY versao DESC
              LIMIT 1`,
            )
            .bind(input.seriesKey)
            .first<Row>();
          const currentVersion = current === null ? 0 : asInteger(current.versao);
          if (
            currentVersion !== input.expectedPreviousVersion ||
            input.snapshot.snapshotVersion !== currentVersion + 1 ||
            (current !== null && current.snapshot_id !== input.snapshot.snapshotId)
          ) {
            return { state: 'version-conflict' } as const;
          }
          const model = input.snapshot.model;
          const inserted = changes(
            await tx
              .prepare(
                `INSERT INTO gradebook.boletim_snapshot (
               snapshot_id, versao, chave_serie, ano, turma_id, aluno_id,
               emitido_em, emitido_por_oid, data_version, periodo_json,
               detalhe, apresentacao_json, snapshot_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                input.snapshot.snapshotId,
                input.snapshot.snapshotVersion,
                input.seriesKey,
                model.year,
                model.classGroup.id,
                model.student.id,
                input.snapshot.emittedAt,
                input.issuerOid,
                input.snapshot.dataVersion,
                JSON.stringify(model.period),
                model.detail,
                JSON.stringify(input.snapshot.presentation),
                JSON.stringify(input.snapshot),
              )
              .run(),
          );
          if (inserted !== 1) throw new Error('relational-bulletin-snapshot-write-failed');
          return { state: 'appended', snapshot: input.snapshot } as const;
        });
      } catch (cause) {
        if (
          cause !== null &&
          typeof cause === 'object' &&
          'code' in cause &&
          cause.code === '23505'
        ) {
          return { state: 'version-conflict' };
        }
        throw cause;
      }
    },

    async history(input) {
      const uniqueStudents = input.studentIds === undefined ? null : [...new Set(input.studentIds)];
      if (
        uniqueStudents !== null &&
        uniqueStudents.length > RELATIONAL_BULLETIN_LIMITS_V2.batchStudents
      ) {
        throw new Error('relational-bulletin-history-too-large');
      }
      if (uniqueStudents?.length === 0) return [];
      const predicates = ['b.ano = ?', 'b.turma_id = ?'];
      const values: D1WriteValueV1[] = [input.year, input.classId];
      if (uniqueStudents !== null) {
        predicates.push(`b.aluno_id IN (${uniqueStudents.map(() => '?').join(', ')})`);
        values.push(...uniqueStudents);
      }
      values.push(RELATIONAL_BULLETIN_LIMITS_V2.historyItems);
      const rows = await all(
        database,
        `SELECT b.snapshot_id, b.versao, b.data_version, b.emitido_em,
                b.turma_id, t.nome AS turma_nome, b.aluno_id, a.nome AS aluno_nome,
                b.periodo_json AS payload_json, b.detalhe
           FROM gradebook.boletim_snapshot b
           JOIN gradebook.turma t ON t.id = b.turma_id AND t.ano = b.ano
           JOIN gradebook.aluno a ON a.id = b.aluno_id AND a.ano = b.ano
          WHERE ${predicates.join(' AND ')}
          ORDER BY b.emitido_em DESC, b.snapshot_id, b.versao DESC
          LIMIT ?`,
        values,
      );
      return rows.map((row) => {
        const period = JSON.parse(requiredString(row.payload_json));
        return {
          snapshotId: requiredString(row.snapshot_id),
          snapshotVersion: asInteger(row.versao),
          dataVersion: requiredString(row.data_version),
          emittedAt: requiredString(row.emitido_em),
          classId: asInteger(row.turma_id),
          className: requiredString(row.turma_nome),
          studentId: asInteger(row.aluno_id),
          studentName: requiredString(row.aluno_nome),
          period,
          detail: requiredString(row.detalhe),
        } as RelationalBulletinHistoryItemV2;
      });
    },
  };
}
