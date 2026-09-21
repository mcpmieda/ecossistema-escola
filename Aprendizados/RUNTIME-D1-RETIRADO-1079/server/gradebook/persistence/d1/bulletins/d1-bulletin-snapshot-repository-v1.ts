import {
  freezeBulletinSnapshotV1,
  isBulletinSnapshotCoherentV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
} from '../../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type { StudentId } from '../../../../../shared/gradebook-contracts/entities';
import type {
  BulletinSnapshotAppendResultV1,
  BulletinSnapshotHistoryQueryV1,
  BulletinSnapshotRepositoryV1,
  BulletinSnapshotSeriesKeyV1,
} from '../../../application/bulletins/bulletin-snapshot-repository-v1';
import {
  GradebookD1DurabilityConflictV1,
  runGradebookD1DurabilitySavepointV1,
} from '../durability/d1-durability-transaction-v1';
import type { D1WriteDatabaseV1, D1WriteRunResultV1 } from '../write/d1-write-adapter-v1';

export const D1_BULLETIN_HISTORY_MIN_LIMIT_V1 = 1 as const;
export const D1_BULLETIN_HISTORY_MAX_LIMIT_V1 = 100 as const;

export type D1BulletinHistoryCursorV1 = string & {
  readonly __d1BulletinHistoryCursorV1: true;
};

export interface D1BulletinSnapshotHistoryPageQueryV1 extends BulletinSnapshotHistoryQueryV1 {
  readonly limit: number;
  readonly cursor: D1BulletinHistoryCursorV1 | null;
}

export interface D1BulletinSnapshotHistoryPageV1 {
  readonly items: readonly BulletinSnapshotV1[];
  readonly nextCursor: D1BulletinHistoryCursorV1 | null;
}

export type GradebookD1BulletinSnapshotErrorCodeV1 =
  | 'database-read-failed'
  | 'database-write-failed'
  | 'invalid-page'
  | 'invalid-cursor'
  | 'incompatible-row';

const ERROR_MESSAGES: Record<GradebookD1BulletinSnapshotErrorCodeV1, string> = {
  'database-read-failed': 'Não foi possível consultar os snapshots persistidos.',
  'database-write-failed': 'Não foi possível persistir o snapshot.',
  'invalid-page': 'A página de snapshots solicitada é inválida.',
  'invalid-cursor': 'O cursor de snapshots é inválido.',
  'incompatible-row': 'O snapshot persistido é incompatível.',
};

export class GradebookD1BulletinSnapshotErrorV1 extends Error {
  readonly code: GradebookD1BulletinSnapshotErrorCodeV1;

  constructor(code: GradebookD1BulletinSnapshotErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1BulletinSnapshotErrorV1';
    this.code = code;
  }
}

type SnapshotRowV1 = Record<string, unknown>;

function fail(code: GradebookD1BulletinSnapshotErrorCodeV1): never {
  throw new GradebookD1BulletinSnapshotErrorV1(code);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function changes(result: D1WriteRunResultV1): number {
  const value = result.meta?.changes ?? result.changes;
  if (
    result.success === false ||
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return fail('database-write-failed');
  }
  return value;
}

function serializeSnapshot(snapshot: BulletinSnapshotV1): string {
  try {
    const payload = JSON.stringify(snapshot);
    return nonEmptyString(payload) ? payload : fail('database-write-failed');
  } catch {
    return fail('database-write-failed');
  }
}

function snapshotFromRow(row: SnapshotRowV1): BulletinSnapshotV1 {
  if (!nonEmptyString(row.payload_json)) return fail('incompatible-row');

  try {
    const snapshot = JSON.parse(row.payload_json) as BulletinSnapshotV1;
    if (
      !isBulletinSnapshotCoherentV1(snapshot) ||
      snapshot.snapshotId !== row.snapshot_id ||
      snapshot.snapshotVersion !== row.version ||
      snapshot.model.academicYearId !== row.academic_year_id ||
      snapshot.model.classGroup.id !== row.class_group_id ||
      snapshot.model.student.id !== row.student_id ||
      snapshot.model.student.enrollmentId !== row.enrollment_id ||
      snapshot.emittedAt !== row.emitted_at
    ) {
      return fail('incompatible-row');
    }
    return freezeBulletinSnapshotV1(snapshot);
  } catch (cause) {
    if (cause instanceof GradebookD1BulletinSnapshotErrorV1) throw cause;
    return fail('incompatible-row');
  }
}

interface HistoryCursorValueV1 {
  readonly emittedAt: string;
  readonly snapshotId: string;
  readonly version: number;
}

function encodeCursor(row: SnapshotRowV1): D1BulletinHistoryCursorV1 {
  if (
    !nonEmptyString(row.emitted_at) ||
    !nonEmptyString(row.snapshot_id) ||
    !positiveInteger(row.version)
  ) {
    return fail('incompatible-row');
  }
  return encodeURIComponent(
    JSON.stringify([row.emitted_at, row.snapshot_id, row.version]),
  ) as D1BulletinHistoryCursorV1;
}

function decodeCursor(cursor: D1BulletinHistoryCursorV1): HistoryCursorValueV1 {
  try {
    const value = JSON.parse(decodeURIComponent(cursor)) as unknown;
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      !nonEmptyString(value[0]) ||
      !nonEmptyString(value[1]) ||
      !positiveInteger(value[2])
    ) {
      return fail('invalid-cursor');
    }
    return { emittedAt: value[0], snapshotId: value[1], version: value[2] };
  } catch (cause) {
    if (cause instanceof GradebookD1BulletinSnapshotErrorV1) throw cause;
    return fail('invalid-cursor');
  }
}

function validPageLimit(limit: number): boolean {
  return (
    Number.isInteger(limit) &&
    limit >= D1_BULLETIN_HISTORY_MIN_LIMIT_V1 &&
    limit <= D1_BULLETIN_HISTORY_MAX_LIMIT_V1
  );
}

export class GradebookD1BulletinSnapshotRepositoryV1 implements BulletinSnapshotRepositoryV1 {
  constructor(private readonly database: D1WriteDatabaseV1) {}

  private async safelyRead<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1BulletinSnapshotErrorV1) throw cause;
      return fail('database-read-failed');
    }
  }

  async getLatest(seriesKey: BulletinSnapshotSeriesKeyV1): Promise<BulletinSnapshotV1 | null> {
    return this.safelyRead(async () => {
      const row = await this.database
        .prepare(
          `SELECT v.snapshot_id, v.version, v.academic_year_id, v.class_group_id,
                  v.student_id, v.enrollment_id, v.emitted_at, v.payload_json
             FROM bulletin_snapshot_streams AS s
             JOIN bulletin_snapshot_versions AS v
               ON v.series_key = s.series_key AND v.version = s.current_version
            WHERE s.series_key = ?`,
        )
        .bind(seriesKey)
        .first<SnapshotRowV1>();
      return row === null ? null : snapshotFromRow(row);
    });
  }

  async getHistorical(
    snapshotId: BulletinSnapshotIdV1,
    snapshotVersion: number,
  ): Promise<BulletinSnapshotV1 | null> {
    if (!positiveInteger(snapshotVersion)) return null;
    return this.safelyRead(async () => {
      const row = await this.database
        .prepare(
          `SELECT snapshot_id, version, academic_year_id, class_group_id,
                  student_id, enrollment_id, emitted_at, payload_json
             FROM bulletin_snapshot_versions
            WHERE snapshot_id = ? AND version = ?`,
        )
        .bind(snapshotId, snapshotVersion)
        .first<SnapshotRowV1>();
      return row === null ? null : snapshotFromRow(row);
    });
  }

  async append(
    seriesKey: BulletinSnapshotSeriesKeyV1,
    candidate: BulletinSnapshotV1,
    expectedPreviousVersion: number,
  ): Promise<BulletinSnapshotAppendResultV1> {
    if (!isBulletinSnapshotCoherentV1(candidate)) {
      return { status: 'incoherent-snapshot' };
    }
    if (!Number.isInteger(expectedPreviousVersion) || expectedPreviousVersion < 0) {
      return { status: 'version-conflict' };
    }

    const payload = serializeSnapshot(candidate);
    try {
      return await runGradebookD1DurabilitySavepointV1(this.database, async (database) => {
        const current = await database
          .prepare(
            `SELECT current_version, snapshot_id, academic_year_id, class_group_id,
                    student_id, enrollment_id
               FROM bulletin_snapshot_streams
              WHERE series_key = ?`,
          )
          .bind(seriesKey)
          .first<SnapshotRowV1>();

        if (current === null) {
          if (expectedPreviousVersion !== 0 || candidate.snapshotVersion !== 1) {
            return { status: 'version-conflict' } as const;
          }
          const inserted = changes(
            await database
              .prepare(
                `INSERT OR IGNORE INTO bulletin_snapshot_streams (
                   series_key, academic_year_id, snapshot_id, current_version,
                   class_group_id, student_id, enrollment_id, created_at
                 ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
              )
              .bind(
                seriesKey,
                candidate.model.academicYearId,
                candidate.snapshotId,
                candidate.model.classGroup.id,
                candidate.model.student.id,
                candidate.model.student.enrollmentId,
                candidate.emittedAt,
              )
              .run(),
          );
          if (inserted !== 1) return { status: 'version-conflict' } as const;
        } else {
          if (
            current.current_version !== expectedPreviousVersion ||
            candidate.snapshotVersion !== expectedPreviousVersion + 1 ||
            current.snapshot_id !== candidate.snapshotId ||
            current.academic_year_id !== candidate.model.academicYearId ||
            current.class_group_id !== candidate.model.classGroup.id ||
            current.student_id !== candidate.model.student.id ||
            current.enrollment_id !== candidate.model.student.enrollmentId
          ) {
            return { status: 'version-conflict' } as const;
          }
          const advanced = changes(
            await database
              .prepare(
                `UPDATE bulletin_snapshot_streams
                    SET current_version = ?
                  WHERE series_key = ? AND current_version = ?`,
              )
              .bind(candidate.snapshotVersion, seriesKey, expectedPreviousVersion)
              .run(),
          );
          if (advanced !== 1) return { status: 'version-conflict' } as const;
        }

        const appended = changes(
          await database
            .prepare(
              `INSERT INTO bulletin_snapshot_versions (
                 series_key, academic_year_id, snapshot_id, version, previous_version,
                 class_group_id, student_id, enrollment_id, emitted_at, payload_json
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              seriesKey,
              candidate.model.academicYearId,
              candidate.snapshotId,
              candidate.snapshotVersion,
              expectedPreviousVersion === 0 ? null : expectedPreviousVersion,
              candidate.model.classGroup.id,
              candidate.model.student.id,
              candidate.model.student.enrollmentId,
              candidate.emittedAt,
              payload,
            )
            .run(),
        );
        if (appended !== 1) return fail('database-write-failed');
        return {
          status: 'appended',
          snapshot: snapshotFromRow({
            snapshot_id: candidate.snapshotId,
            version: candidate.snapshotVersion,
            academic_year_id: candidate.model.academicYearId,
            class_group_id: candidate.model.classGroup.id,
            student_id: candidate.model.student.id,
            enrollment_id: candidate.model.student.enrollmentId,
            emitted_at: candidate.emittedAt,
            payload_json: payload,
          }),
        } as const;
      });
    } catch (cause) {
      if (cause instanceof GradebookD1DurabilityConflictV1) {
        return { status: 'version-conflict' };
      }
      if (cause instanceof GradebookD1BulletinSnapshotErrorV1) throw cause;
      return fail('database-write-failed');
    }
  }

  async listHistory(query: BulletinSnapshotHistoryQueryV1): Promise<readonly BulletinSnapshotV1[]> {
    const studentIds =
      query.studentIds === undefined ? null : [...new Set<StudentId>(query.studentIds)];
    if (studentIds !== null && studentIds.length > D1_BULLETIN_HISTORY_MAX_LIMIT_V1) {
      return fail('invalid-page');
    }
    if (studentIds?.length === 0) return [];
    return this.safelyRead(async () => {
      const predicates = ['academic_year_id = ?', 'class_group_id = ?'];
      const values: string[] = [query.academicYearId, query.classGroupId];
      if (studentIds !== null) {
        predicates.push(`student_id IN (${studentIds.map(() => '?').join(', ')})`);
        values.push(...studentIds);
      }
      const result = await this.database
        .prepare(
          `SELECT snapshot_id, version, academic_year_id, class_group_id,
                  student_id, enrollment_id, emitted_at, payload_json
             FROM bulletin_snapshot_versions
            WHERE ${predicates.join(' AND ')}
            ORDER BY emitted_at DESC, snapshot_id, version DESC`,
        )
        .bind(...values)
        .all<SnapshotRowV1>();
      if (!Array.isArray(result.results)) return fail('database-read-failed');
      return result.results.map(snapshotFromRow);
    });
  }

  async listHistoryPage(
    query: D1BulletinSnapshotHistoryPageQueryV1,
  ): Promise<D1BulletinSnapshotHistoryPageV1> {
    if (!validPageLimit(query.limit)) return fail('invalid-page');
    const studentIds =
      query.studentIds === undefined ? null : [...new Set<StudentId>(query.studentIds)];
    if (studentIds !== null && studentIds.length > D1_BULLETIN_HISTORY_MAX_LIMIT_V1) {
      return fail('invalid-page');
    }
    if (studentIds?.length === 0) return { items: [], nextCursor: null };
    const cursor = query.cursor === null ? null : decodeCursor(query.cursor);

    return this.safelyRead(async () => {
      const predicates = ['academic_year_id = ?', 'class_group_id = ?'];
      const values: (string | number | null)[] = [query.academicYearId, query.classGroupId];
      if (studentIds !== null) {
        predicates.push(`student_id IN (${studentIds.map(() => '?').join(', ')})`);
        values.push(...studentIds);
      }
      if (cursor !== null) {
        predicates.push(
          `(emitted_at < ?
            OR (emitted_at = ? AND snapshot_id > ?)
            OR (emitted_at = ? AND snapshot_id = ? AND version < ?))`,
        );
        values.push(
          cursor.emittedAt,
          cursor.emittedAt,
          cursor.snapshotId,
          cursor.emittedAt,
          cursor.snapshotId,
          cursor.version,
        );
      }
      values.push(query.limit + 1);

      const result = await this.database
        .prepare(
          `SELECT snapshot_id, version, academic_year_id, class_group_id,
                  student_id, enrollment_id, emitted_at, payload_json
             FROM bulletin_snapshot_versions
            WHERE ${predicates.join(' AND ')}
            ORDER BY emitted_at DESC, snapshot_id, version DESC
            LIMIT ?`,
        )
        .bind(...values)
        .all<SnapshotRowV1>();
      if (!Array.isArray(result.results)) return fail('database-read-failed');
      const hasMore = result.results.length > query.limit;
      const pageRows = result.results.slice(0, query.limit);
      return {
        items: pageRows.map(snapshotFromRow),
        nextCursor:
          hasMore && pageRows.length > 0
            ? encodeCursor(pageRows[pageRows.length - 1] as SnapshotRowV1)
            : null,
      };
    });
  }
}

export function createGradebookD1BulletinSnapshotRepositoryV1(
  database: D1WriteDatabaseV1,
): GradebookD1BulletinSnapshotRepositoryV1 {
  return new GradebookD1BulletinSnapshotRepositoryV1(database);
}
