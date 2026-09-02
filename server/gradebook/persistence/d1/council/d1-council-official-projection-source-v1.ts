import type { CouncilClassReferenceV1 } from '../../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type {
  AcademicYearId,
  ClassGroupV1,
  EnrollmentV1,
  StudentV1,
  SubjectV1,
  TeachingAssignmentV1,
} from '../../../../../shared/gradebook-contracts/entities';
import type {
  AnnualResultV1,
  FinalRecoveryV1,
  TermResultV1,
} from '../../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  createCouncilOfficialProjectionSourceV1,
  type CouncilOfficialProjectionClassSnapshotV1,
  type CouncilOfficialProjectionRecordsSourceV1,
} from '../../../application/council/council-official-projection-source-v1';
import type { CouncilWorkspaceSourceV1 } from '../../../application/council/council-workspace-source-v1';
import type { D1ReadDatabaseV1 } from '../read/d1-read-adapter-v1';

type Row = Record<string, unknown>;

export type GradebookD1CouncilProjectionErrorCodeV1 =
  | 'database-read-failed'
  | 'invalid-json'
  | 'incompatible-row';

const MESSAGES: Record<GradebookD1CouncilProjectionErrorCodeV1, string> = {
  'database-read-failed': 'Não foi possível consultar a fonte física do Conselho.',
  'invalid-json': 'A fonte física do Conselho contém JSON inválido.',
  'incompatible-row': 'A fonte física do Conselho contém dados incompatíveis.',
};

export class GradebookD1CouncilProjectionErrorV1 extends Error {
  readonly code: GradebookD1CouncilProjectionErrorCodeV1;

  constructor(code: GradebookD1CouncilProjectionErrorCodeV1) {
    super(MESSAGES[code]);
    this.name = 'GradebookD1CouncilProjectionErrorV1';
    this.code = code;
  }
}

function fail(code: GradebookD1CouncilProjectionErrorCodeV1): never {
  throw new GradebookD1CouncilProjectionErrorV1(code);
}

function object(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function payload(value: unknown): Row {
  if (typeof value !== 'string') return fail('incompatible-row');
  try {
    const parsed: unknown = JSON.parse(value);
    if (!object(parsed)) return fail('incompatible-row');
    return parsed;
  } catch (error) {
    if (error instanceof GradebookD1CouncilProjectionErrorV1) throw error;
    return fail('invalid-json');
  }
}

function entity<Value>(row: Row, kind: string, academicYearId: AcademicYearId): Value {
  const parsed = payload(row.payload_json);
  if (
    parsed.kind !== kind ||
    !object(parsed.value) ||
    ('academicYearId' in parsed.value && parsed.value.academicYearId !== academicYearId)
  ) {
    return fail('incompatible-row');
  }
  return parsed.value as Value;
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return fail('incompatible-row');
  return value;
}

function term(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) return fail('incompatible-row');
  return value;
}

function record<Value extends TermResultV1 | FinalRecoveryV1 | AnnualResultV1>(
  row: Row,
  kind: 'term-result' | 'final-recovery' | 'annual-result',
  academicYearId: AcademicYearId,
): Value {
  const parsed = payload(row.payload_json);
  if (parsed.kind !== kind || row.record_kind !== kind || !object(parsed.value)) {
    return fail('incompatible-row');
  }
  const value = parsed.value as unknown as Value;
  if (
    value.id !== row.record_id ||
    value.academicYearId !== academicYearId ||
    value.studentId !== row.student_id ||
    value.enrollmentId !== row.enrollment_id ||
    value.teachingAssignmentId !== row.teaching_assignment_id ||
    value.authorityMode !== row.authority_mode
  ) {
    return fail('incompatible-row');
  }
  if (kind === 'term-result') {
    if ((value as TermResultV1).term !== term(row.term)) return fail('incompatible-row');
  } else if (kind === 'final-recovery') {
    if ((value as FinalRecoveryV1).recoveredTerm !== term(row.term)) {
      return fail('incompatible-row');
    }
  } else if (row.term !== null) {
    return fail('incompatible-row');
  }
  nonEmptyString(value.ruleVersion);
  return value;
}

export class GradebookD1CouncilOfficialProjectionRecordsSourceV1
  implements CouncilOfficialProjectionRecordsSourceV1
{
  constructor(private readonly database: D1ReadDatabaseV1) {}

  private async all(query: string, ...values: readonly string[]): Promise<readonly Row[]> {
    try {
      return (
        await this.database
          .prepare(query)
          .bind(...values)
          .all<Row>()
      ).results;
    } catch (error) {
      if (error instanceof GradebookD1CouncilProjectionErrorV1) throw error;
      return fail('database-read-failed');
    }
  }

  async loadClass(
    academicYearId: AcademicYearId,
    requestedClassReference: CouncilClassReferenceV1,
  ): Promise<CouncilOfficialProjectionClassSnapshotV1 | null> {
    const classGroupId = requestedClassReference as unknown as string;
    const [classRows, enrollmentRows, assignmentRows, termRows, recoveryRows, annualRows] =
      await Promise.all([
        this.all(
          `SELECT v.payload_json, academic_year.year AS academic_year
           FROM academic_entity_streams s
           JOIN academic_years academic_year
             ON academic_year.academic_year_id = s.academic_year_id
           JOIN academic_entity_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.entity_kind = s.entity_kind
            AND v.entity_id = s.entity_id
            AND v.version = s.current_version
           WHERE s.academic_year_id = ?
             AND s.entity_kind = 'class-group'
             AND s.entity_id = ?
             AND academic_year.year = 2026`,
          academicYearId,
          classGroupId,
        ),
        this.all(
          `SELECT e.payload_json, student.payload_json AS student_payload_json
           FROM academic_entity_streams enrollment_stream
           JOIN academic_entity_versions e
             ON e.academic_year_id = enrollment_stream.academic_year_id
            AND e.entity_kind = enrollment_stream.entity_kind
            AND e.entity_id = enrollment_stream.entity_id
            AND e.version = enrollment_stream.current_version
           JOIN academic_entity_streams student_stream
             ON student_stream.academic_year_id = e.academic_year_id
            AND student_stream.entity_kind = 'student'
            AND student_stream.entity_id = e.student_id
           JOIN academic_entity_versions student
             ON student.academic_year_id = student_stream.academic_year_id
            AND student.entity_kind = student_stream.entity_kind
            AND student.entity_id = student_stream.entity_id
            AND student.version = student_stream.current_version
           WHERE enrollment_stream.academic_year_id = ?
             AND enrollment_stream.entity_kind = 'enrollment'
             AND e.class_group_id = ?`,
          academicYearId,
          classGroupId,
        ),
        this.all(
          `SELECT assignment.payload_json, subject.payload_json AS subject_payload_json
           FROM academic_entity_streams assignment_stream
           JOIN academic_entity_versions assignment
             ON assignment.academic_year_id = assignment_stream.academic_year_id
            AND assignment.entity_kind = assignment_stream.entity_kind
            AND assignment.entity_id = assignment_stream.entity_id
            AND assignment.version = assignment_stream.current_version
           JOIN academic_entity_streams subject_stream
             ON subject_stream.academic_year_id = assignment.academic_year_id
            AND subject_stream.entity_kind = 'subject'
            AND subject_stream.entity_id = assignment.subject_id
           JOIN academic_entity_versions subject
             ON subject.academic_year_id = subject_stream.academic_year_id
            AND subject.entity_kind = subject_stream.entity_kind
            AND subject.entity_id = subject_stream.entity_id
            AND subject.version = subject_stream.current_version
           WHERE assignment_stream.academic_year_id = ?
             AND assignment_stream.entity_kind = 'teaching-assignment'
             AND assignment.class_group_id = ?`,
          academicYearId,
          classGroupId,
        ),
        this.all(
          `SELECT rs.record_kind, rs.student_id, rs.enrollment_id,
                  rs.teaching_assignment_id, rs.term, rv.record_id,
                  rv.authority_mode, rv.payload_json
           FROM academic_record_streams rs
           JOIN academic_record_versions rv
             ON rv.academic_year_id = rs.academic_year_id
            AND rv.record_kind = rs.record_kind
            AND rv.stream_key = rs.stream_key
            AND rv.version = rs.current_version
           JOIN academic_entity_streams enrollment_stream
             ON enrollment_stream.academic_year_id = rs.academic_year_id
            AND enrollment_stream.entity_kind = 'enrollment'
            AND enrollment_stream.entity_id = rs.enrollment_id
           JOIN academic_entity_versions enrollment
             ON enrollment.academic_year_id = enrollment_stream.academic_year_id
            AND enrollment.entity_kind = enrollment_stream.entity_kind
            AND enrollment.entity_id = enrollment_stream.entity_id
            AND enrollment.version = enrollment_stream.current_version
           WHERE rs.academic_year_id = ?
             AND rs.record_kind = 'term-result'
             AND enrollment.class_group_id = ?`,
          academicYearId,
          classGroupId,
        ),
        this.all(
          `SELECT rs.record_kind, rs.student_id, rs.enrollment_id,
                  rs.teaching_assignment_id, rs.term, rv.record_id,
                  rv.authority_mode, rv.payload_json
           FROM academic_record_streams rs
           JOIN academic_record_versions rv
             ON rv.academic_year_id = rs.academic_year_id
            AND rv.record_kind = rs.record_kind
            AND rv.stream_key = rs.stream_key
            AND rv.version = rs.current_version
           JOIN academic_entity_streams enrollment_stream
             ON enrollment_stream.academic_year_id = rs.academic_year_id
            AND enrollment_stream.entity_kind = 'enrollment'
            AND enrollment_stream.entity_id = rs.enrollment_id
           JOIN academic_entity_versions enrollment
             ON enrollment.academic_year_id = enrollment_stream.academic_year_id
            AND enrollment.entity_kind = enrollment_stream.entity_kind
            AND enrollment.entity_id = enrollment_stream.entity_id
            AND enrollment.version = enrollment_stream.current_version
           WHERE rs.academic_year_id = ?
             AND rs.record_kind = 'final-recovery'
             AND enrollment.class_group_id = ?`,
          academicYearId,
          classGroupId,
        ),
        this.all(
          `SELECT rs.record_kind, rs.student_id, rs.enrollment_id,
                  rs.teaching_assignment_id, rs.term, rv.record_id,
                  rv.authority_mode, rv.payload_json
           FROM academic_record_streams rs
           JOIN academic_record_versions rv
             ON rv.academic_year_id = rs.academic_year_id
            AND rv.record_kind = rs.record_kind
            AND rv.stream_key = rs.stream_key
            AND rv.version = rs.current_version
           JOIN academic_entity_streams enrollment_stream
             ON enrollment_stream.academic_year_id = rs.academic_year_id
            AND enrollment_stream.entity_kind = 'enrollment'
            AND enrollment_stream.entity_id = rs.enrollment_id
           JOIN academic_entity_versions enrollment
             ON enrollment.academic_year_id = enrollment_stream.academic_year_id
            AND enrollment.entity_kind = enrollment_stream.entity_kind
            AND enrollment.entity_id = enrollment_stream.entity_id
            AND enrollment.version = enrollment_stream.current_version
           WHERE rs.academic_year_id = ?
             AND rs.record_kind = 'annual-result'
             AND enrollment.class_group_id = ?`,
          academicYearId,
          classGroupId,
        ),
      ]);

    if (classRows.length === 0) return null;
    if (classRows.length !== 1) return fail('incompatible-row');
    const classGroup = entity<ClassGroupV1>(classRows[0]!, 'class-group', academicYearId);
    if (classGroup.id !== classGroupId || classRows[0]!.academic_year !== 2026) {
      return fail('incompatible-row');
    }

    return {
      academicYearId,
      academicYearProfile: 2026,
      classGroup,
      enrollments: enrollmentRows.map((row) => ({
        enrollment: entity<EnrollmentV1>(row, 'enrollment', academicYearId),
        student: entity<StudentV1>(
          { payload_json: row.student_payload_json },
          'student',
          academicYearId,
        ),
      })),
      assignments: assignmentRows.map((row) => ({
        teachingAssignment: entity<TeachingAssignmentV1>(
          row,
          'teaching-assignment',
          academicYearId,
        ),
        subject: entity<SubjectV1>(
          { payload_json: row.subject_payload_json },
          'subject',
          academicYearId,
        ),
      })),
      termResults: termRows.map((row) =>
        record<TermResultV1>(row, 'term-result', academicYearId),
      ),
      finalRecoveries: recoveryRows.map((row) =>
        record<FinalRecoveryV1>(row, 'final-recovery', academicYearId),
      ),
      annualResults: annualRows.map((row) =>
        record<AnnualResultV1>(row, 'annual-result', academicYearId),
      ),
    };
  }
}

export function createGradebookD1CouncilOfficialProjectionSourceV1(
  database: D1ReadDatabaseV1,
): CouncilWorkspaceSourceV1 {
  return createCouncilOfficialProjectionSourceV1(
    new GradebookD1CouncilOfficialProjectionRecordsSourceV1(database),
  );
}
