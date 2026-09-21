import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { D1ReadDatabaseV1 } from './d1-read-adapter-v1';

type Row = Record<string, unknown>;

export interface GradebookD1StudentStatusBulkReadV1 {
  readonly getStudentStatusEventsMany: (
    context: AcademicPersistenceContextV1,
    ids: readonly string[],
  ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
}

function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('student-status-bulk-row-invalid');
  }
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('student-status-bulk-row-invalid');
  }
  return value;
}

export function createGradebookD1StudentStatusBulkReadV1(
  database: D1ReadDatabaseV1,
): GradebookD1StudentStatusBulkReadV1 {
  return {
    async getStudentStatusEventsMany(context, ids) {
      if (ids.length === 0) return [];
      if (new Set(ids).size !== ids.length || ids.some((id) => id.length === 0)) {
        throw new TypeError('student-status-bulk-request-invalid');
      }
      const result = await database
        .prepare(
          `WITH requested AS (
             SELECT CAST(key AS INTEGER) AS request_index, CAST(value AS TEXT) AS entity_id
             FROM json_each(?)
           )
           SELECT requested.request_index, requested.entity_id,
                  s.current_version, v.version AS persisted_version,
                  v.payload_json, v.recorded_at
           FROM requested
           LEFT JOIN academic_entity_streams s
             ON s.academic_year_id = ?
            AND s.entity_kind = 'student-status-event'
            AND s.entity_id = requested.entity_id
           LEFT JOIN academic_entity_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.entity_kind = s.entity_kind
            AND v.entity_id = s.entity_id
            AND v.version = s.current_version
           ORDER BY requested.request_index`,
        )
        .bind(JSON.stringify(ids), context.academicYearId)
        .all<Row>();
      if (result.results.length !== ids.length) throw new Error('student-status-bulk-row-invalid');
      return result.results.map((row, index) => {
        if (row.request_index !== index || row.entity_id !== ids[index]) {
          throw new Error('student-status-bulk-row-invalid');
        }
        if (row.current_version === null) return null;
        const currentVersion = positive(row.current_version);
        if (positive(row.persisted_version) !== currentVersion) {
          throw new Error('student-status-bulk-broken-reference');
        }
        const payload = JSON.parse(text(row.payload_json)) as AcademicEntityRecordV1;
        if (
          payload.kind !== 'student-status-event' ||
          payload.value.id !== ids[index] ||
          payload.value.academicYearId !== context.academicYearId
        ) {
          throw new Error('student-status-bulk-row-invalid');
        }
        return {
          value: payload,
          version: currentVersion,
          recordedAt: text(row.recorded_at),
        };
      });
    },
  };
}
