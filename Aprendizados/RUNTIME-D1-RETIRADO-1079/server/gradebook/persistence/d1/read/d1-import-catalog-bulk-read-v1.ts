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

const IMPORT_CATALOG_KINDS = [
  'teacher',
  'class-group',
  'subject',
  'teaching-assignment',
  'student',
  'enrollment',
] as const;
type ImportCatalogKind = (typeof IMPORT_CATALOG_KINDS)[number];
const IMPORT_CATALOG_MAXIMUM_PER_KIND = 1_000;
const IMPORT_CATALOG_MAXIMUM_TOTAL =
  IMPORT_CATALOG_KINDS.length * IMPORT_CATALOG_MAXIMUM_PER_KIND;

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
  getImportCatalogSnapshot(
    context: AcademicPersistenceContextV1,
  ): Promise<readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null>;
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

function nonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
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

function importCatalogKind(value: unknown): value is ImportCatalogKind {
  return IMPORT_CATALOG_KINDS.some((kind) => kind === value);
}

function catalogRecordShape(
  kind: ImportCatalogKind,
  value: Record<string, unknown>,
  context: AcademicPersistenceContextV1,
): boolean {
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  switch (kind) {
    case 'teacher':
      return (
        typeof value.displayName === 'string' &&
        strings(value.sourceNames) &&
        (value.status === 'active' || value.status === 'inactive')
      );
    case 'class-group':
      return (
        value.academicYearId === context.academicYearId &&
        typeof value.code === 'string' &&
        typeof value.grade === 'string' &&
        typeof value.section === 'string' &&
        optionalString(value.shift)
      );
    case 'subject':
      return (
        typeof value.code === 'string' &&
        typeof value.displayName === 'string' &&
        typeof value.shortName === 'string' &&
        (value.status === 'active' || value.status === 'inactive')
      );
    case 'teaching-assignment':
      return (
        value.academicYearId === context.academicYearId &&
        typeof value.teacherId === 'string' &&
        value.teacherId.length > 0 &&
        typeof value.classGroupId === 'string' &&
        value.classGroupId.length > 0 &&
        typeof value.subjectId === 'string' &&
        value.subjectId.length > 0 &&
        optionalString(value.sourceDisciplineIndex) &&
        effectivePeriod(value.effectivePeriod) &&
        (value.confirmationOrigin === 'imported-source' ||
          value.confirmationOrigin === 'user-confirmed' ||
          value.confirmationOrigin === 'administrative')
      );
    case 'student':
      return (
        typeof value.displayName === 'string' &&
        strings(value.sourceNames) &&
        (value.sourceIdentityMarks === undefined || strings(value.sourceIdentityMarks))
      );
    case 'enrollment':
      return (
        value.academicYearId === context.academicYearId &&
        typeof value.studentId === 'string' &&
        value.studentId.length > 0 &&
        typeof value.classGroupId === 'string' &&
        value.classGroupId.length > 0 &&
        effectivePeriod(value.effectivePeriod) &&
        (value.position === 'current' || value.position === 'historical') &&
        (value.sourcePosition === undefined || nonNegative(value.sourcePosition))
      );
  }
}

function normalizedCatalogColumns(
  kind: ImportCatalogKind,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const empty = {
    teacher_ref_kind: null,
    teacher_id: null,
    class_group_ref_kind: null,
    class_group_id: null,
    subject_ref_kind: null,
    subject_id: null,
    student_ref_kind: null,
    student_id: null,
    enrollment_ref_kind: null,
    enrollment_id: null,
    teaching_assignment_ref_kind: null,
    teaching_assignment_id: null,
    term: null,
  };
  switch (kind) {
    case 'teacher':
      return { ...empty, display_code: value.displayName, lifecycle_state: value.status };
    case 'class-group':
      return { ...empty, display_code: value.code, lifecycle_state: null };
    case 'subject':
      return { ...empty, display_code: value.code, lifecycle_state: value.status };
    case 'teaching-assignment':
      return {
        ...empty,
        teacher_ref_kind: 'teacher',
        teacher_id: value.teacherId,
        class_group_ref_kind: 'class-group',
        class_group_id: value.classGroupId,
        subject_ref_kind: 'subject',
        subject_id: value.subjectId,
        display_code: value.sourceDisciplineIndex ?? null,
        lifecycle_state: value.confirmationOrigin,
      };
    case 'student':
      return { ...empty, display_code: value.displayName, lifecycle_state: null };
    case 'enrollment':
      return {
        ...empty,
        class_group_ref_kind: 'class-group',
        class_group_id: value.classGroupId,
        student_ref_kind: 'student',
        student_id: value.studentId,
        display_code:
          value.sourcePosition === undefined ? null : String(value.sourcePosition),
        lifecycle_state: value.position,
      };
  }
}

function normalizedCatalogColumnsMatch(
  row: Row,
  kind: ImportCatalogKind,
  value: Record<string, unknown>,
): boolean {
  const expected = normalizedCatalogColumns(kind, value);
  return Object.entries(expected).every(([key, expectedValue]) => row[key] === expectedValue);
}

function importCatalogRecord(
  row: Row,
  context: AcademicPersistenceContextV1,
): VersionedRecordV1<AcademicEntityRecordV1> {
  const currentVersion = positive(row.current_version);
  const persistedVersion = positive(row.persisted_version);
  if (currentVersion !== persistedVersion) return fail('broken-reference');
  if (row.academic_year_id !== context.academicYearId || !importCatalogKind(row.entity_kind)) {
    return fail('incompatible-row');
  }
  const entityId = string(row.entity_id);
  const parsed = parse(row.payload_json);
  if (parsed.kind !== row.entity_kind || !object(parsed.value) || parsed.value.id !== entityId) {
    return fail('incompatible-row');
  }
  if (
    !catalogRecordShape(row.entity_kind, parsed.value, context) ||
    !normalizedCatalogColumnsMatch(row, row.entity_kind, parsed.value)
  ) {
    return fail('incompatible-row');
  }
  return {
    value: parsed as unknown as AcademicEntityRecordV1,
    version: persistedVersion,
    recordedAt: string(row.recorded_at),
  };
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

  async getImportCatalogSnapshot(
    context: AcademicPersistenceContextV1,
  ): Promise<readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null> {
    if (typeof context.academicYearId !== 'string' || context.academicYearId.length === 0) {
      return fail('incompatible-row');
    }
    let rows: readonly Row[];
    try {
      const result = await this.database
        .prepare(
          `SELECT
             s.academic_year_id,
             s.entity_kind,
             s.entity_id,
             s.current_version,
             v.version AS persisted_version,
             v.teacher_ref_kind,
             v.teacher_id,
             v.class_group_ref_kind,
             v.class_group_id,
             v.subject_ref_kind,
             v.subject_id,
             v.student_ref_kind,
             v.student_id,
             v.enrollment_ref_kind,
             v.enrollment_id,
             v.teaching_assignment_ref_kind,
             v.teaching_assignment_id,
             v.term,
             v.display_code,
             v.lifecycle_state,
             v.payload_json,
             v.recorded_at
           FROM academic_entity_streams s
           LEFT JOIN academic_entity_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.entity_kind = s.entity_kind
            AND v.entity_id = s.entity_id
            AND v.version = s.current_version
           WHERE s.academic_year_id = ?
             AND s.entity_kind IN (
               'teacher', 'class-group', 'subject', 'teaching-assignment', 'student', 'enrollment'
             )
           ORDER BY s.entity_kind, s.entity_id
           LIMIT ?`,
        )
        .bind(context.academicYearId, IMPORT_CATALOG_MAXIMUM_TOTAL + 1)
        .all<Row>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof GradebookD1ReadErrorV1) throw cause;
      return fail('database-read-failed');
    }

    if (rows.length > IMPORT_CATALOG_MAXIMUM_TOTAL) return null;
    const counts = new Map<ImportCatalogKind, number>();
    const records: VersionedRecordV1<AcademicEntityRecordV1>[] = [];
    for (const row of rows) {
      if (!importCatalogKind(row.entity_kind)) return fail('incompatible-row');
      const count = (counts.get(row.entity_kind) ?? 0) + 1;
      if (count > IMPORT_CATALOG_MAXIMUM_PER_KIND) return null;
      counts.set(row.entity_kind, count);
      records.push(importCatalogRecord(row, context));
    }
    return records;
  }

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