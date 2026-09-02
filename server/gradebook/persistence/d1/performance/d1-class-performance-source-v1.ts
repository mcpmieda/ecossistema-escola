import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentV1,
  StudentStatusEventV1,
  StudentV1,
  SubjectV1,
  TeachingAssignmentV1,
} from '../../../../../shared/gradebook-contracts/entities';
import {
  PERFORMANCE_AUTHORITY_MODE_V1,
  comparePerformanceComponentColumnsV1,
} from '../../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import type {
  PerformanceComparedApplicabilityV1,
  PerformanceComparedGradeValueV1,
  PerformancePeriodV1,
  PerformanceValueComparisonV1,
} from '../../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import type {
  AcademicGradeValueV1,
  ApplicabilityV1,
  GradeEntryV1,
  ResultCoverageV1,
  TermResultV1,
} from '../../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AcademicRecordV1,
  PersistedAssessmentComponentV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  ClassPerformanceSourceV1,
  PerformanceCellDetailSourceRequestV1,
  PerformanceCellDetailSourceV1,
  PerformanceMatrixSourceCellV1,
  PerformanceMatrixSourceRequestV1,
  PerformanceMatrixSourceSnapshotV1,
  PerformanceStudentDetailSourceRequestV1,
  PerformanceStudentDetailSourceV1,
} from '../../../application/read-models/performance/class-performance-read-model-v1';
import type { D1ReadDatabaseV1 } from '../read/d1-read-adapter-v1';

type Row = Record<string, unknown>;

export type GradebookD1PerformanceSourceErrorCodeV1 =
  'database-read-failed' | 'invalid-json' | 'incompatible-row';

const MESSAGES: Record<GradebookD1PerformanceSourceErrorCodeV1, string> = {
  'database-read-failed': 'Não foi possível consultar a fonte física de Desempenho.',
  'invalid-json': 'A fonte física de Desempenho contém JSON inválido.',
  'incompatible-row': 'A fonte física de Desempenho contém dados incompatíveis.',
};

export class GradebookD1PerformanceSourceErrorV1 extends Error {
  readonly code: GradebookD1PerformanceSourceErrorCodeV1;

  constructor(code: GradebookD1PerformanceSourceErrorCodeV1) {
    super(MESSAGES[code]);
    this.name = 'GradebookD1PerformanceSourceErrorV1';
    this.code = code;
  }
}

function fail(code: GradebookD1PerformanceSourceErrorCodeV1): never {
  throw new GradebookD1PerformanceSourceErrorV1(code);
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
  } catch (cause) {
    if (cause instanceof GradebookD1PerformanceSourceErrorV1) throw cause;
    return fail('invalid-json');
  }
}

function entity<Value>(row: Row, kind: string, year: AcademicYearId): Value {
  const parsed = payload(row.payload_json);
  if (
    !object(parsed.value) ||
    parsed.kind !== kind ||
    ('academicYearId' in parsed.value && parsed.value.academicYearId !== year)
  ) {
    return fail('incompatible-row');
  }
  return parsed.value as Value;
}

function record(row: Row, year: AcademicYearId): AcademicRecordV1 {
  const parsed = payload(row.payload_json);
  if (
    !object(parsed.value) ||
    parsed.kind !== row.record_kind ||
    parsed.value.academicYearId !== year
  ) {
    return fail('incompatible-row');
  }
  if (
    row.authority_mode !== PERFORMANCE_AUTHORITY_MODE_V1 ||
    parsed.value.authorityMode !== row.authority_mode
  )
    return fail('incompatible-row');
  return parsed as unknown as AcademicRecordV1;
}

function compared(value: {
  readonly imported: { readonly value: AcademicGradeValueV1 };
  readonly calculated: { readonly value: AcademicGradeValueV1 };
}): PerformanceComparedGradeValueV1 {
  return { imported: value.imported.value, calculated: value.calculated.value };
}

function applicability(value: {
  readonly imported: { readonly value: ApplicabilityV1 };
  readonly calculated: ApplicabilityV1;
}): PerformanceComparedApplicabilityV1 {
  return { imported: value.imported.value, calculated: value.calculated };
}

const absentCompared: PerformanceComparedGradeValueV1 = {
  imported: { state: 'absent' },
  calculated: { state: 'absent' },
};
const insufficientApplicability: PerformanceComparedApplicabilityV1 = {
  imported: { state: 'insufficient-data', reason: 'official-result-absent' },
  calculated: { state: 'insufficient-data', reason: 'official-result-absent' },
};
const missingCoverage: ResultCoverageV1 = {
  state: 'insufficient-data',
  expectedItemCount: 1,
  resolvedItemCount: 0,
  missingItemCount: 1,
  reasons: ['official-result-absent'],
};
const unavailableProjectionCoverage: ResultCoverageV1 = {
  state: 'insufficient-data',
  expectedItemCount: 1,
  resolvedItemCount: 0,
  missingItemCount: 1,
  reasons: ['official-projection-unavailable'],
};

function aggregateCoverage(cells: readonly PerformanceMatrixSourceCellV1[]): ResultCoverageV1 {
  const expectedItemCount = cells.reduce(
    (total, cell) => total + cell.coverage.expectedItemCount,
    0,
  );
  const resolvedItemCount = cells.reduce(
    (total, cell) => total + cell.coverage.resolvedItemCount,
    0,
  );
  const missingItemCount = cells.reduce((total, cell) => total + cell.coverage.missingItemCount, 0);
  const reasons = [...new Set(cells.flatMap((cell) => cell.coverage.reasons))].sort();
  const state =
    expectedItemCount === 0
      ? 'not-applicable'
      : resolvedItemCount === 0
        ? 'insufficient-data'
        : missingItemCount === 0
          ? 'complete'
          : 'partial';
  return { state, expectedItemCount, resolvedItemCount, missingItemCount, reasons };
}

function compareRows(
  left: {
    readonly sourcePosition: number | null;
    readonly displayName: string;
    readonly studentId: string;
  },
  right: {
    readonly sourcePosition: number | null;
    readonly displayName: string;
    readonly studentId: string;
  },
): number {
  const position =
    left.sourcePosition === right.sourcePosition
      ? 0
      : left.sourcePosition === null
        ? 1
        : right.sourcePosition === null
          ? -1
          : left.sourcePosition - right.sourcePosition;
  if (position !== 0) return position;
  if (left.displayName !== right.displayName) return left.displayName < right.displayName ? -1 : 1;
  return left.studentId === right.studentId ? 0 : left.studentId < right.studentId ? -1 : 1;
}

interface Materialized {
  readonly enrollments: readonly EnrollmentV1[];
  readonly students: ReadonlyMap<string, StudentV1>;
  readonly histories: ReadonlyMap<string, readonly StudentStatusEventV1[]>;
  readonly assignments: readonly TeachingAssignmentV1[];
  readonly subjects: ReadonlyMap<string, SubjectV1>;
  readonly components: readonly PersistedAssessmentComponentV1[];
  readonly records: readonly AcademicRecordV1[];
}

function detailKey(kind: 'student' | 'cell', values: readonly string[]): string {
  return JSON.stringify([1, kind, ...values]);
}

function decodeDetail(
  value: string,
  kind: 'student' | 'cell',
  size: number,
): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== size + 2 ||
      parsed[0] !== 1 ||
      parsed[1] !== kind ||
      !parsed.slice(2).every((item) => typeof item === 'string' && item.length > 0)
    )
      return null;
    return parsed.slice(2) as string[];
  } catch {
    return null;
  }
}

function periodRecord(
  records: readonly AcademicRecordV1[],
  studentId: string,
  assignmentId: string,
  period: PerformancePeriodV1,
  mode: 'regular' | 'recovery',
): AcademicRecordV1 | null {
  return (
    records.find((item) => {
      const value = item.value;
      if (
        value.studentId !== studentId ||
        !('teachingAssignmentId' in value) ||
        value.teachingAssignmentId !== assignmentId
      )
        return false;
      if (period.kind === 'annual') return item.kind === 'annual-result';
      return mode === 'regular'
        ? item.kind === 'term-result' && item.value.term === period.term
        : item.kind === 'final-recovery' && item.value.recoveredTerm === period.term;
    }) ?? null
  );
}

function comparisonFor(
  referencePeriod: PerformancePeriodV1 | null,
): PerformanceValueComparisonV1 | null {
  if (referencePeriod === null) return null;
  return {
    state: 'not-comparable',
    referencePeriod,
    reason: 'comparison-semantics-not-integrated',
  };
}

function projection(
  request: PerformanceMatrixSourceRequestV1,
  materialized: Materialized,
  studentId: string,
  enrollmentId: string,
  assignment: TeachingAssignmentV1,
): PerformanceMatrixSourceCellV1 {
  const isResultLens = request.lens === 'result';
  const current = isResultLens
    ? periodRecord(materialized.records, studentId, assignment.id, request.period, request.mode)
    : null;
  const requestedTerm = request.period.kind === 'term' ? request.period.term : null;
  const termResult =
    requestedTerm !== null
      ? (materialized.records.find(
          (item): item is { readonly kind: 'term-result'; readonly value: TermResultV1 } =>
            item.kind === 'term-result' &&
            item.value.studentId === studentId &&
            item.value.teachingAssignmentId === assignment.id &&
            item.value.term === requestedTerm,
        ) ?? null)
      : null;
  const coverage = isResultLens
    ? current?.kind === 'term-result' ||
      current?.kind === 'final-recovery' ||
      current?.kind === 'annual-result'
      ? current.value.coverage
      : missingCoverage
    : requestedTerm === null
      ? unavailableProjectionCoverage
      : (termResult?.value.coverage ?? missingCoverage);
  const comparison = comparisonFor(request.comparisonPeriod);
  const projectionUnavailable = !isResultLens && requestedTerm === null;
  const projectedRecordAbsent = isResultLens ? current === null : termResult === null;
  const signals = [
    ...(projectionUnavailable
      ? [
          {
            code: 'official-projection-unavailable',
            explanation: 'A projeção oficial solicitada ainda não está disponível.',
            source: 'official-result' as const,
            detail: 'cell' as const,
          },
        ]
      : projectedRecordAbsent
        ? [
            {
              code: 'official-result-absent',
              explanation: 'Não há resultado oficial para esta célula.',
              source: 'official-result' as const,
              detail: 'cell' as const,
            },
          ]
        : []),
    ...(coverage.state === 'complete'
      ? []
      : [
          {
            code: `coverage-${coverage.state}`,
            explanation: 'A cobertura oficial da célula não está completa.',
            source: 'coverage' as const,
            detail: 'cell' as const,
          },
        ]),
    ...(comparison?.state === 'not-comparable'
      ? [
          {
            code: 'not-comparable',
            explanation: comparison.reason,
            source: 'comparison' as const,
            detail: 'cell' as const,
          },
        ]
      : []),
  ];
  const base = {
    teachingAssignmentId: assignment.id,
    authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
    coverage,
    comparison,
    signals,
    detailKey: detailKey('cell', [studentId, enrollmentId, assignment.id]),
  } as const;

  if (request.lens === 'result') {
    if (request.period.kind === 'annual') {
      const value = current?.kind === 'annual-result' ? current.value : null;
      return {
        ...base,
        lens: 'result',
        projection: {
          source: 'annual-result',
          originalTotal: value ? compared(value.originalTotal) : absentCompared,
          postRecoveryTotal: value ? compared(value.postRecoveryTotal) : absentCompared,
          academicState: value?.academicState ?? {
            imported: 'insufficient-data',
            calculated: 'insufficient-data',
          },
        },
      };
    }
    if (request.mode === 'recovery') {
      const value = current?.kind === 'final-recovery' ? current.value : null;
      return {
        ...base,
        lens: 'result',
        projection: {
          source: 'final-recovery',
          originalTermGrade: value ? compared(value.originalTermGrade) : absentCompared,
          applicability: value ? applicability(value.applicability) : insufficientApplicability,
          recoveryGrade: value ? compared(value.recoveryGrade) : absentCompared,
          replacementTermGrade: value ? compared(value.replacementTermGrade) : absentCompared,
        },
      };
    }
    const value = current?.kind === 'term-result' ? current.value : null;
    return {
      ...base,
      lens: 'result',
      projection: {
        source: 'term-result',
        officialGrade: value ? compared(value.officialGrade) : absentCompared,
        percentage: value ? compared(value.percentage) : absentCompared,
      },
    };
  }
  if (request.lens === 'quantitative') {
    const value = termResult?.value.quantitative;
    return {
      ...base,
      lens: 'quantitative',
      projection: {
        original: value ? compared(value.original) : absentCompared,
        parallelRecovery: value ? compared(value.parallelRecovery) : absentCompared,
        parallelRecoveryApplicability: value
          ? applicability(value.parallelRecoveryApplicability)
          : insufficientApplicability,
        considered: value ? compared(value.considered) : absentCompared,
      },
    };
  }
  if (request.lens === 'qualitative') {
    return {
      ...base,
      lens: 'qualitative',
      projection: {
        operational: termResult
          ? compared(termResult.value.qualitativeOperational)
          : absentCompared,
      },
    };
  }
  const components =
    requestedTerm === null
      ? []
      : materialized.components.filter(
          (item) => item.teachingAssignmentId === assignment.id && item.term === requestedTerm,
        );
  const entries = new Map(
    materialized.records
      .filter(
        (item): item is { readonly kind: 'grade-entry'; readonly value: GradeEntryV1 } =>
          item.kind === 'grade-entry' && item.value.studentId === studentId,
      )
      .map((item) => [item.value.assessmentComponentId, item.value]),
  );
  return {
    ...base,
    lens: 'assessments',
    projection: {
      items: components
        .map((component) => ({
          assessmentComponentId: component.id,
          name: component.name,
          type: component.type,
          order: component.order,
          maximum: component.maximum,
          applicability: component.applicability,
          value: entries.has(component.id)
            ? compared(entries.get(component.id)!.value)
            : absentCompared,
        }))
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.assessmentComponentId.localeCompare(right.assessmentComponentId),
        ),
    },
  };
}

export class GradebookD1ClassPerformanceSourceV1 implements ClassPerformanceSourceV1 {
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
      if (cause instanceof GradebookD1PerformanceSourceErrorV1) throw cause;
      return fail('database-read-failed');
    }
  }

  private async materialize(
    year: AcademicYearId,
    classGroupId: ClassGroupId,
  ): Promise<Materialized | null> {
    const [classes, enrollmentRows, historyRows, assignmentRows, componentRows, recordRows] =
      await Promise.all([
        this.all(
          `SELECT v.payload_json FROM academic_entity_streams s JOIN academic_entity_versions v ON v.academic_year_id=s.academic_year_id AND v.entity_kind=s.entity_kind AND v.entity_id=s.entity_id AND v.version=s.current_version WHERE s.academic_year_id=? AND s.entity_kind='class-group' AND s.entity_id=?`,
          year,
          classGroupId,
        ),
        this.all(
          `SELECT e.payload_json, s.payload_json AS student_payload_json FROM academic_entity_streams es JOIN academic_entity_versions e ON e.academic_year_id=es.academic_year_id AND e.entity_kind=es.entity_kind AND e.entity_id=es.entity_id AND e.version=es.current_version LEFT JOIN academic_entity_streams ss ON ss.academic_year_id=e.academic_year_id AND ss.entity_kind='student' AND ss.entity_id=e.student_id LEFT JOIN academic_entity_versions s ON s.academic_year_id=ss.academic_year_id AND s.entity_kind=ss.entity_kind AND s.entity_id=ss.entity_id AND s.version=ss.current_version WHERE es.academic_year_id=? AND es.entity_kind='enrollment' AND e.class_group_id=?`,
          year,
          classGroupId,
        ),
        this.all(
          `SELECT v.payload_json FROM academic_entity_streams s JOIN academic_entity_versions v ON v.academic_year_id=s.academic_year_id AND v.entity_kind=s.entity_kind AND v.entity_id=s.entity_id AND v.version=s.current_version JOIN academic_entity_versions e ON e.academic_year_id=v.academic_year_id AND e.entity_kind='enrollment' AND e.entity_id=v.enrollment_id JOIN academic_entity_streams es ON es.academic_year_id=e.academic_year_id AND es.entity_kind=e.entity_kind AND es.entity_id=e.entity_id AND es.current_version=e.version WHERE s.academic_year_id=? AND s.entity_kind='student-status-event' AND e.class_group_id=?`,
          year,
          classGroupId,
        ),
        this.all(
          `SELECT a.payload_json, sub.payload_json AS subject_payload_json FROM academic_entity_streams s JOIN academic_entity_versions a ON a.academic_year_id=s.academic_year_id AND a.entity_kind=s.entity_kind AND a.entity_id=s.entity_id AND a.version=s.current_version JOIN academic_entity_streams ss ON ss.academic_year_id=a.academic_year_id AND ss.entity_kind='subject' AND ss.entity_id=a.subject_id JOIN academic_entity_versions sub ON sub.academic_year_id=ss.academic_year_id AND sub.entity_kind=ss.entity_kind AND sub.entity_id=ss.entity_id AND sub.version=ss.current_version WHERE s.academic_year_id=? AND s.entity_kind='teaching-assignment' AND a.class_group_id=?`,
          year,
          classGroupId,
        ),
        this.all(
          `SELECT c.payload_json FROM academic_entity_streams s JOIN academic_entity_versions c ON c.academic_year_id=s.academic_year_id AND c.entity_kind=s.entity_kind AND c.entity_id=s.entity_id AND c.version=s.current_version JOIN academic_entity_versions a ON a.academic_year_id=c.academic_year_id AND a.entity_kind='teaching-assignment' AND a.entity_id=c.teaching_assignment_id JOIN academic_entity_streams ass ON ass.academic_year_id=a.academic_year_id AND ass.entity_kind=a.entity_kind AND ass.entity_id=a.entity_id AND ass.current_version=a.version WHERE s.academic_year_id=? AND s.entity_kind='assessment-component' AND a.class_group_id=?`,
          year,
          classGroupId,
        ),
        this.all(
          `SELECT rs.record_kind, rv.authority_mode, rv.payload_json FROM academic_record_streams rs JOIN academic_record_versions rv ON rv.academic_year_id=rs.academic_year_id AND rv.record_kind=rs.record_kind AND rv.stream_key=rs.stream_key AND rv.version=rs.current_version JOIN academic_entity_versions e ON e.academic_year_id=rs.academic_year_id AND e.entity_kind='enrollment' AND e.entity_id=rs.enrollment_id JOIN academic_entity_streams es ON es.academic_year_id=e.academic_year_id AND es.entity_kind=e.entity_kind AND es.entity_id=e.entity_id AND es.current_version=e.version WHERE rs.academic_year_id=? AND e.class_group_id=?`,
          year,
          classGroupId,
        ),
      ]);
    if (classes.length === 0) return null;
    if (classes.length !== 1) return fail('incompatible-row');
    entity(classes[0]!, 'class-group', year);
    const students = new Map<string, StudentV1>();
    const enrollments = enrollmentRows.map((row) => {
      const enrollment = entity<EnrollmentV1>(row, 'enrollment', year);
      if (enrollment.classGroupId !== classGroupId) return fail('incompatible-row');
      if (row.student_payload_json !== null && row.student_payload_json !== undefined) {
        const student = entity<StudentV1>(
          { payload_json: row.student_payload_json },
          'student',
          year,
        );
        if (student.id !== enrollment.studentId || students.has(student.id))
          return fail('incompatible-row');
        students.set(student.id, student);
      }
      return enrollment;
    });
    const histories = new Map<string, StudentStatusEventV1[]>();
    for (const row of historyRows) {
      const event = entity<StudentStatusEventV1>(row, 'student-status-event', year);
      const items = histories.get(event.enrollmentId) ?? [];
      items.push(event);
      histories.set(event.enrollmentId, items);
    }
    for (const items of histories.values())
      items.sort(
        (left, right) =>
          (left.occurredOn ?? '\uffff').localeCompare(right.occurredOn ?? '\uffff') ||
          left.id.localeCompare(right.id),
      );
    const subjects = new Map<string, SubjectV1>();
    const assignments = assignmentRows.map((row) => {
      const assignment = entity<TeachingAssignmentV1>(row, 'teaching-assignment', year);
      const subject = entity<SubjectV1>(
        { payload_json: row.subject_payload_json },
        'subject',
        year,
      );
      if (assignment.classGroupId !== classGroupId || assignment.subjectId !== subject.id)
        return fail('incompatible-row');
      if (!subjects.has(subject.id)) subjects.set(subject.id, subject);
      return assignment;
    });
    return {
      enrollments,
      students,
      histories,
      assignments,
      subjects,
      components: componentRows.map((row) =>
        entity<PersistedAssessmentComponentV1>(row, 'assessment-component', year),
      ),
      records: recordRows.map((row) => record(row, year)),
    };
  }

  async loadMatrix(
    request: PerformanceMatrixSourceRequestV1,
  ): Promise<PerformanceMatrixSourceSnapshotV1 | null> {
    const data = await this.materialize(request.academicYearId, request.classGroupId);
    if (data === null) return null;
    const columns = data.assignments
      .map((assignment) => {
        const subject = data.subjects.get(assignment.subjectId);
        if (!subject) return fail('incompatible-row');
        return {
          teachingAssignmentId: assignment.id,
          subjectId: subject.id,
          code: subject.code,
          displayName: subject.displayName,
        };
      })
      .sort(comparePerformanceComponentColumnsV1);
    const rows = data.enrollments
      .map((enrollment) => {
        const student = data.students.get(enrollment.studentId);
        const history = data.histories.get(enrollment.id) ?? [];
        const latest = history.at(-1);
        return {
          sourcePosition: enrollment.sourcePosition ?? null,
          studentId: enrollment.studentId,
          displayName: student?.displayName ?? enrollment.studentId,
          situation: latest
            ? { state: 'known' as const, value: latest.status }
            : { state: 'absent' as const },
          detailKey: detailKey('student', [enrollment.studentId, enrollment.id]),
          cells: data.assignments.map((assignment) =>
            projection(request, data, enrollment.studentId, enrollment.id, assignment),
          ),
        };
      })
      .sort(compareRows);
    return {
      ...request,
      authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
      coverage: aggregateCoverage(rows.flatMap((row) => row.cells)),
      columns,
      rows,
    };
  }

  async loadStudentDetail(
    request: PerformanceStudentDetailSourceRequestV1,
  ): Promise<PerformanceStudentDetailSourceV1 | null> {
    const decoded = decodeDetail(request.detailKey, 'student', 2);
    if (!decoded) return null;
    const data = await this.materialize(request.academicYearId, request.classGroupId);
    if (data === null) return null;
    const [studentId, enrollmentId] = decoded;
    const enrollment = data.enrollments.find(
      (item) => item.id === enrollmentId && item.studentId === studentId,
    );
    return enrollment
      ? {
          ...request,
          student: data.students.get(studentId!) ?? null,
          enrollment,
          statusHistory: data.histories.get(enrollment.id) ?? [],
        }
      : null;
  }

  async loadCellDetail(
    request: PerformanceCellDetailSourceRequestV1,
  ): Promise<PerformanceCellDetailSourceV1 | null> {
    const decoded = decodeDetail(request.detailKey, 'cell', 3);
    if (!decoded) return null;
    const data = await this.materialize(request.academicYearId, request.classGroupId);
    if (data === null) return null;
    const [studentId, enrollmentId, assignmentId] = decoded;
    const enrollment = data.enrollments.find(
      (item) => item.id === enrollmentId && item.studentId === studentId,
    );
    const assignment = data.assignments.find((item) => item.id === assignmentId);
    if (!enrollment || !assignment) return null;
    const componentIds = new Set(
      data.components
        .filter((item) => item.teachingAssignmentId === assignment.id)
        .map((item) => item.id),
    );
    const officialRecords = data.records.filter(
      (item) =>
        item.value.studentId === studentId &&
        ('teachingAssignmentId' in item.value
          ? item.value.teachingAssignmentId === assignmentId
          : componentIds.has(item.value.assessmentComponentId)),
    );
    return {
      ...request,
      studentId: enrollment.studentId,
      cell: projection(request, data, enrollment.studentId, enrollment.id, assignment),
      officialRecords,
    };
  }
}

export function createGradebookD1ClassPerformanceSourceV1(
  database: D1ReadDatabaseV1,
): ClassPerformanceSourceV1 {
  return new GradebookD1ClassPerformanceSourceV1(database);
}
