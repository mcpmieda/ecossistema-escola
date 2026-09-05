import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  GradebookD1ReadErrorV1,
  type D1ReadDatabaseV1,
} from './d1-read-adapter-v1';

type Row = Record<string, unknown>;

type EnrollmentRecord = VersionedRecordV1<
  Extract<AcademicEntityRecordV1, { readonly kind: 'enrollment' }>
>;
type StudentRecord = VersionedRecordV1<
  Extract<AcademicEntityRecordV1, { readonly kind: 'student' }>
>;

export interface GradebookImportRosterLookupV1 {
  readonly classGroupId: string;
  readonly sourcePosition: number;
}

export type GradebookImportRosterMatchV1 =
  | { readonly state: 'missing' }
  | { readonly state: 'ambiguous' }
  | {
      readonly state: 'ready';
      readonly enrollment: EnrollmentRecord;
      readonly student: StudentRecord;
    };

export interface GradebookD1ImportCatalogBulkReadV1 {
  getImportRosterMany(
    context: AcademicPersistenceContextV1,
    requested: readonly GradebookImportRosterLookupV1[],
  ): Promise<readonly GradebookImportRosterMatchV1[]>;
}

function fail(
  code: 'database-read-failed' | 'invalid-json' | 'incompatible-row' | 'broken-reference',
): never {
  throw new GradebookD1ReadErrorV1(code);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function string(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : fail('incompatible-row');
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fail('incompatible-row');
}

function index(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= maximum) {
    return fail('incompatible-row');
  }
  return value;
}

function parse(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return fail('incompatible-row');
  try {
    const parsed: unknown = JSON.parse(value);
    return object(parsed) ? parsed : fail('incompatible-row');
  } catch (cause) {
    if (cause instanceof GradebookD1ReadErrorV1) throw cause;
    return fail('invalid-json');
  }
}

function strings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function effectivePeriod(value: unknown): boolean {
  return (
    object(value) &&
    (value.startsOn === undefined || typeof value.startsOn === 'string') &&
    (value.endsOn === undefined || typeof value.endsOn === 'string')
  );
}

function enrollmentRecord(
  row: Row,
  context: AcademicPersistenceContextV1,
  requested: GradebookImportRosterLookupV1,
): EnrollmentRecord {
  const currentVersion = positive(row.current_version);
  const persistedVersion = positive(row.persisted_version);
  if (currentVersion !== persistedVersion) return fail('broken-reference');
  const entityId = string(row.entity_id);
  const studentId = string(row.student_id);
  if (
    row.class_group_id !== requested.classGroupId ||
    row.display_code !== String(requested.sourcePosition) ||
    row.lifecycle_state !== 'current'
  ) {
    return fail('incompatible-row');
  }
  const parsed = parse(row.payload_json);
  if (parsed.kind !== 'enrollment' || !object(parsed.value)) return fail('incompatible-row');
  const value = parsed.value;
  if (
    value.id !== entityId ||
    value.academicYearId !== context.academicYearId ||
    value.studentId !== studentId ||
    value.classGroupId !== requested.classGroupId ||
    value.position !== 'current' ||
    value.sourcePosition !== requested.sourcePosition ||
    !effectivePeriod(value.effectivePeriod)
  ) {
    return fail('incompatible-row');
  }
  return {
    value: parsed as unknown as Extract<AcademicEntityRecordV1, { readonly kind: 'enrollment' }>,
    version: persistedVersion,
    recordedAt: string(row.recorded_at),
  };
}

function studentRecord(
  row: Row,
  context: AcademicPersistenceContextV1,
  expectedId: string,
): StudentRecord {
  const currentVersion = positive(row.current_version);
  const persistedVersion = positive(row.persisted_version);
  if (currentVersion !== persistedVersion || row.entity_id !== expectedId) return fail('broken-reference');
  const parsed = parse(row.payload_json);
  if (parsed.kind !== 'student' || !object(parsed.value)) return fail('incompatible-row');
  const value = parsed.value;
  if (
    value.id !== expectedId ||
    typeof value.displayName !== 'string' ||
    !strings(value.sourceNames) ||
    (value.sourceIdentityMarks !== undefined && !strings(value.sourceIdentityMarks))
  ) {
    return fail('incompatible-row');
  }
  // Students are institution-wide entities and intentionally do not carry academicYearId.
  void context;
  return {
    value: parsed as unknown as Extract<AcademicEntityRecordV1, { readonly kind: 'student' }>,
    version: persistedVersion,
    recordedAt: string(row.recorded_at),
  };
}

function serialize(value: unknown): string {
  try {
    const result = JSON.stringify(value);
    return typeof result === 'string' && result.length > 0 ? result : fail('incompatible-row');
  } catch (cause) {
    if (cause instanceof GradebookD1ReadErrorV1) throw cause;
    return fail('incompatible-row');
  }
}

export class GradebookD1ImportCatalogBulkReaderV1 implements GradebookD1ImportCatalogBulkReadV1 {
  constructor(private readonly database: D1ReadDatabaseV1) {}

  async getImportRosterMany(
    context: AcademicPersistenceContextV1,
    requested: readonly GradebookImportRosterLookupV1[],
  ): Promise<readonly GradebookImportRosterMatchV1[]> {
    if (requested.length === 0) return [];
    if (
      requested.length > 64 ||
      requested.some(
        (value) =>
          value.classGroupId.length === 0 ||
          !Number.isInteger(value.sourcePosition) ||
          value.sourcePosition < 1,
      )
    ) {
      return fail('incompatible-row');
    }
    const requestJson = serialize(
      requested.map((value) => ({
        classGroupId: value.classGroupId,
        sourcePosition: value.sourcePosition,
      })),
    );

    let rows: readonly Row[];
    try {
      const result = await this.database
        .prepare(
          `WITH requested AS (
             SELECT CAST(key AS INTEGER) AS request_index,
                    json_extract(value, '$.classGroupId') AS class_group_id,
                    CAST(json_extract(value, '$.sourcePosition') AS INTEGER) AS source_position
             FROM json_each(?)
           ),
           current_enrollments AS (
             SELECT s.academic_year_id, s.entity_id, s.current_version,
                    v.version AS persisted_version,
                    v.class_group_id, v.student_id, v.display_code, v.lifecycle_state,
                    v.payload_json, v.recorded_at
             FROM academic_entity_streams s
             INNER JOIN academic_entity_versions v
               ON v.academic_year_id = s.academic_year_id
              AND v.entity_kind = s.entity_kind
              AND v.entity_id = s.entity_id
              AND v.version = s.current_version
             WHERE s.academic_year_id = ? AND s.entity_kind = 'enrollment'
           )
           SELECT requested.request_index,
                  current_enrollments.entity_id,
                  current_enrollments.current_version,
                  current_enrollments.persisted_version,
                  current_enrollments.class_group_id,
                  current_enrollments.student_id,
                  current_enrollments.display_code,
                  current_enrollments.lifecycle_state,
                  current_enrollments.payload_json,
                  current_enrollments.recorded_at,
                  student_streams.entity_id AS student_entity_id,
                  student_streams.current_version AS student_current_version,
                  student_versions.version AS student_persisted_version,
                  student_versions.payload_json AS student_payload_json,
                  student_versions.recorded_at AS student_recorded_at
           FROM requested
           LEFT JOIN current_enrollments
             ON current_enrollments.class_group_id = requested.class_group_id
            AND current_enrollments.display_code = CAST(requested.source_position AS TEXT)
            AND current_enrollments.lifecycle_state = 'current'
           LEFT JOIN academic_entity_streams student_streams
             ON student_streams.academic_year_id = current_enrollments.academic_year_id
            AND student_streams.entity_kind = 'student'
            AND student_streams.entity_id = current_enrollments.student_id
           LEFT JOIN academic_entity_versions student_versions
             ON student_versions.academic_year_id = student_streams.academic_year_id
            AND student_versions.entity_kind = student_streams.entity_kind
            AND student_versions.entity_id = student_streams.entity_id
            AND student_versions.version = student_streams.current_version
           ORDER BY requested.request_index, current_enrollments.entity_id`,
        )
        .bind(requestJson, context.academicYearId)
        .all<Row>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof GradebookD1ReadErrorV1) throw cause;
      return fail('database-read-failed');
    }

    const enrollmentGroups = Array.from(
      { length: requested.length },
      () => [] as { readonly enrollment: EnrollmentRecord; readonly row: Row }[],
    );
    for (const row of rows) {
      const requestIndex = index(row.request_index, requested.length);
      if (row.entity_id === null) continue;
      enrollmentGroups[requestIndex]!.push({
        enrollment: enrollmentRecord(row, context, requested[requestIndex]!),
        row,
      });
    }

    return enrollmentGroups.map((group): GradebookImportRosterMatchV1 => {
      if (group.length === 0) return { state: 'missing' };
      if (group.length > 1) return { state: 'ambiguous' };
      const { enrollment, row } = group[0]!;
      if (row.student_entity_id === null || row.student_persisted_version === null) {
        return fail('broken-reference');
      }
      const student = studentRecord(
        {
          entity_id: row.student_entity_id,
          current_version: row.student_current_version,
          persisted_version: row.student_persisted_version,
          payload_json: row.student_payload_json,
          recorded_at: row.student_recorded_at,
        },
        context,
        enrollment.value.value.studentId,
      );
      return { state: 'ready', enrollment, student };
    });
  }
}

export function createGradebookD1ImportCatalogBulkReadV1(
  database: D1ReadDatabaseV1,
): GradebookD1ImportCatalogBulkReadV1 {
  return new GradebookD1ImportCatalogBulkReaderV1(database);
}
