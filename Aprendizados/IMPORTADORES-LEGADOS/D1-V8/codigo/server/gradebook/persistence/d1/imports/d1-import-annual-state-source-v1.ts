import type {
  AcademicYearId,
  ClassGroupId,
  TeachingAssignmentV1,
} from '../../../../../shared/gradebook-contracts/entities';
import type { AnnualResultV1 } from '../../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AnnualCurriculumPageV1,
  AnnualCurriculumSourceV1,
} from '../../../application/import/academic-result-projection-v1';
import type { D1ReadDatabaseV1 } from '../read/d1-read-adapter-v1';

type Row = Record<string, unknown>;

const MAX_ANNUAL_BULK_CLASS_GROUPS_V1 = 64;
const MAX_ANNUAL_YEAR_PREFETCH_RESULTS_V1 = 2_000;

export type GradebookD1ImportAnnualStateErrorCodeV1 =
  | 'database-read-failed'
  | 'invalid-json'
  | 'incompatible-row';

export class GradebookD1ImportAnnualStateErrorV1 extends Error {
  readonly code: GradebookD1ImportAnnualStateErrorCodeV1;

  constructor(code: GradebookD1ImportAnnualStateErrorCodeV1) {
    super('A leitura anual da importação está indisponível.');
    this.name = 'GradebookD1ImportAnnualStateErrorV1';
    this.code = code;
  }
}

function fail(code: GradebookD1ImportAnnualStateErrorCodeV1): never {
  throw new GradebookD1ImportAnnualStateErrorV1(code);
}

function object(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function payload(row: Row): Row {
  if (typeof row.payload_json !== 'string') return fail('incompatible-row');
  try {
    const value: unknown = JSON.parse(row.payload_json);
    return object(value) ? value : fail('incompatible-row');
  } catch (cause) {
    if (cause instanceof GradebookD1ImportAnnualStateErrorV1) throw cause;
    return fail('invalid-json');
  }
}

function assignment(
  row: Row,
  academicYearId: AcademicYearId,
  classGroupId: ClassGroupId,
): TeachingAssignmentV1 {
  const parsed = payload(row);
  if (
    parsed.kind !== 'teaching-assignment' ||
    !object(parsed.value) ||
    parsed.value.academicYearId !== academicYearId ||
    parsed.value.classGroupId !== classGroupId ||
    typeof parsed.value.id !== 'string' ||
    parsed.value.id.trim().length === 0
  ) {
    return fail('incompatible-row');
  }
  return parsed.value as unknown as TeachingAssignmentV1;
}

function annualResult(row: Row, academicYearId: AcademicYearId): AnnualResultV1 {
  const parsed = payload(row);
  if (
    parsed.kind !== 'annual-result' ||
    !object(parsed.value) ||
    parsed.value.academicYearId !== academicYearId ||
    parsed.value.authorityMode !== 'imported-source'
  ) {
    return fail('incompatible-row');
  }
  return parsed.value as unknown as AnnualResultV1;
}

export interface GradebookImportAnnualStateSourceV1 extends AnnualCurriculumSourceV1 {
  loadCurrentAnnualResultsForClass(input: {
    readonly academicYearId: AcademicYearId;
    readonly classGroupId: ClassGroupId;
  }): Promise<readonly AnnualResultV1[]>;
  loadCurrentAnnualResultsForClasses?(input: {
    readonly academicYearId: AcademicYearId;
    readonly classGroupIds: readonly ClassGroupId[];
  }): Promise<ReadonlyMap<ClassGroupId, readonly AnnualResultV1[]>>;
  loadCurrentAnnualResultsForYear?(input: {
    readonly academicYearId: AcademicYearId;
  }): Promise<ReadonlyMap<ClassGroupId, readonly AnnualResultV1[]> | null>;
}

export class GradebookD1ImportAnnualStateSourceV1 implements GradebookImportAnnualStateSourceV1 {
  constructor(private readonly database: D1ReadDatabaseV1) {}

  private async all(query: string, ...values: (string | number | null)[]): Promise<readonly Row[]> {
    try {
      return (
        await this.database
          .prepare(query)
          .bind(...values)
          .all<Row>()
      ).results;
    } catch (cause) {
      if (cause instanceof GradebookD1ImportAnnualStateErrorV1) throw cause;
      return fail('database-read-failed');
    }
  }

  async listAssignments(input: {
    readonly academicYearId: AcademicYearId;
    readonly classGroupId: ClassGroupId;
    readonly limit: 100;
    readonly cursor: string | null;
  }): Promise<AnnualCurriculumPageV1> {
    const rows = await this.all(
      `SELECT a.entity_id, a.payload_json
         FROM academic_entity_streams s
         JOIN academic_entity_versions a
           ON a.academic_year_id=s.academic_year_id
          AND a.entity_kind=s.entity_kind
          AND a.entity_id=s.entity_id
          AND a.version=s.current_version
        WHERE s.academic_year_id=?
          AND s.entity_kind='teaching-assignment'
          AND a.class_group_id=?
          AND (? IS NULL OR a.entity_id > ?)
        ORDER BY a.entity_id
        LIMIT ?`,
      input.academicYearId,
      input.classGroupId,
      input.cursor,
      input.cursor,
      input.limit + 1,
    );
    const pageRows = rows.slice(0, input.limit);
    const items = pageRows.map((row) =>
      assignment(row, input.academicYearId, input.classGroupId),
    );
    const nextCursor =
      rows.length > input.limit
        ? ((pageRows.at(-1)?.entity_id as string | undefined) ?? null)
        : null;
    if (nextCursor !== null && nextCursor.trim().length === 0) return fail('incompatible-row');
    return { items, nextCursor };
  }

  async loadCurrentAnnualResultsForYear(input: {
    readonly academicYearId: AcademicYearId;
  }): Promise<ReadonlyMap<ClassGroupId, readonly AnnualResultV1[]> | null> {
    const rows = await this.all(
      `SELECT e.class_group_id, rv.payload_json
         FROM academic_record_streams rs
         JOIN academic_record_versions rv
           ON rv.academic_year_id=rs.academic_year_id
          AND rv.record_kind=rs.record_kind
          AND rv.stream_key=rs.stream_key
          AND rv.version=rs.current_version
         JOIN academic_entity_versions e
           ON e.academic_year_id=rs.academic_year_id
          AND e.entity_kind='enrollment'
          AND e.entity_id=rs.enrollment_id
         JOIN academic_entity_streams es
           ON es.academic_year_id=e.academic_year_id
          AND es.entity_kind=e.entity_kind
          AND es.entity_id=e.entity_id
          AND es.current_version=e.version
        WHERE rs.academic_year_id=?
          AND rs.record_kind='annual-result'
        ORDER BY e.class_group_id, rs.student_id, rs.teaching_assignment_id
        LIMIT ?`,
      input.academicYearId,
      MAX_ANNUAL_YEAR_PREFETCH_RESULTS_V1 + 1,
    );
    if (rows.length > MAX_ANNUAL_YEAR_PREFETCH_RESULTS_V1) return null;

    const grouped = new Map<ClassGroupId, AnnualResultV1[]>();
    for (const row of rows) {
      if (typeof row.class_group_id !== 'string' || row.class_group_id.trim().length === 0) {
        return fail('incompatible-row');
      }
      const classGroupId = row.class_group_id as ClassGroupId;
      const values = grouped.get(classGroupId) ?? [];
      values.push(annualResult(row, input.academicYearId));
      grouped.set(classGroupId, values);
    }
    return grouped;
  }

  async loadCurrentAnnualResultsForClasses(input: {
    readonly academicYearId: AcademicYearId;
    readonly classGroupIds: readonly ClassGroupId[];
  }): Promise<ReadonlyMap<ClassGroupId, readonly AnnualResultV1[]>> {
    const classGroupIds = [...new Set(input.classGroupIds)];
    if (classGroupIds.length === 0) return new Map();
    if (
      classGroupIds.length > MAX_ANNUAL_BULK_CLASS_GROUPS_V1 ||
      classGroupIds.some((classGroupId) => classGroupId.trim().length === 0)
    ) {
      return fail('incompatible-row');
    }

    let requestedJson: string;
    try {
      requestedJson = JSON.stringify(classGroupIds);
    } catch {
      return fail('incompatible-row');
    }

    const rows = await this.all(
      `WITH requested AS (
         SELECT CAST(value AS TEXT) AS class_group_id
           FROM json_each(?)
       )
       SELECT e.class_group_id, rv.payload_json
         FROM academic_record_streams rs
         JOIN academic_record_versions rv
           ON rv.academic_year_id=rs.academic_year_id
          AND rv.record_kind=rs.record_kind
          AND rv.stream_key=rs.stream_key
          AND rv.version=rs.current_version
         JOIN academic_entity_versions e
           ON e.academic_year_id=rs.academic_year_id
          AND e.entity_kind='enrollment'
          AND e.entity_id=rs.enrollment_id
         JOIN academic_entity_streams es
           ON es.academic_year_id=e.academic_year_id
          AND es.entity_kind=e.entity_kind
          AND es.entity_id=e.entity_id
          AND es.current_version=e.version
         JOIN requested
           ON requested.class_group_id=e.class_group_id
        WHERE rs.academic_year_id=?
          AND rs.record_kind='annual-result'
        ORDER BY e.class_group_id, rs.student_id, rs.teaching_assignment_id`,
      requestedJson,
      input.academicYearId,
    );

    const requested = new Set<string>(classGroupIds);
    const grouped = new Map<ClassGroupId, AnnualResultV1[]>(
      classGroupIds.map((classGroupId) => [classGroupId, []]),
    );
    for (const row of rows) {
      if (typeof row.class_group_id !== 'string' || !requested.has(row.class_group_id)) {
        return fail('incompatible-row');
      }
      const classGroupId = row.class_group_id as ClassGroupId;
      grouped.get(classGroupId)!.push(annualResult(row, input.academicYearId));
    }
    return grouped;
  }

  async loadCurrentAnnualResultsForClass(input: {
    readonly academicYearId: AcademicYearId;
    readonly classGroupId: ClassGroupId;
  }): Promise<readonly AnnualResultV1[]> {
    const grouped = await this.loadCurrentAnnualResultsForClasses({
      academicYearId: input.academicYearId,
      classGroupIds: [input.classGroupId],
    });
    return grouped.get(input.classGroupId) ?? [];
  }
}

export function createGradebookD1ImportAnnualStateSourceV1(
  database: D1ReadDatabaseV1,
): GradebookImportAnnualStateSourceV1 {
  return new GradebookD1ImportAnnualStateSourceV1(database);
}
