import { describe, expect, it } from 'vitest';
import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
  CouncilDecisionRequestV1,
  CouncilStudentReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type {
  AcademicGradeValueV1,
  AnnualFinalDecisionV1,
  AnnualResultV1,
  ComparedGradeValueV1,
  FinalRecoveryV1,
  ResultCoverageV1,
  TermResultV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  createCouncilOfficialProjectionSourceV1,
  type CouncilOfficialProjectionClassSnapshotV1,
  type CouncilOfficialProjectionRecordsSourceV1,
} from '../../../server/gradebook/application/council/council-official-projection-source-v1';
import { createLocalCouncilDecisionStoreV1 } from '../../../server/gradebook/application/council/council-decision-store-v1';
import { createCouncilWorkspaceV1 } from '../../../server/gradebook/application/council/council-workspace-v1';

const year = 'academic-year:council-projection:2026' as AcademicYearId;
const classGroup = 'class-group:council-projection:8a' as ClassGroupId;
const classRef = classGroup as unknown as CouncilClassReferenceV1;
const teacher = 'teacher:council-projection' as TeacherId;
const assignments = [0, 1, 2, 3].map(
  (index) => `assignment:council-projection:${index}` as TeachingAssignmentId,
);
const subjects = [0, 1, 2, 3].map(
  (index) => `subject:council-projection:${index}` as SubjectId,
);
const students = ['direct', 'one', 'two', 'three', 'partial', 'formal'].map(
  (name) => `student:council-projection:${name}` as StudentId,
);
const enrollments = ['direct', 'one', 'two', 'three', 'partial', 'formal'].map(
  (name) => `enrollment:council-projection:${name}` as EnrollmentId,
);

function coverage(state: ResultCoverageV1['state'] = 'complete'): ResultCoverageV1 {
  if (state === 'complete') {
    return {
      state,
      expectedItemCount: 1,
      resolvedItemCount: 1,
      missingItemCount: 0,
      reasons: [],
    };
  }
  if (state === 'partial') {
    return {
      state,
      expectedItemCount: 1,
      resolvedItemCount: 0,
      missingItemCount: 1,
      reasons: ['synthetic-partial'],
    };
  }
  return {
    state,
    expectedItemCount: 1,
    resolvedItemCount: 0,
    missingItemCount: 1,
    reasons: ['synthetic-insufficient'],
  };
}

function grade(
  imported: AcademicGradeValueV1,
  calculated: AcademicGradeValueV1,
): ComparedGradeValueV1 {
  return {
    imported: {
      value: imported,
      evidence: [
        {
          sourceFileId: 'raw-source-must-not-cross',
          sheetName: 'RAW SECRET SHEET',
          cellAddress: 'ZZ999',
        },
      ],
    },
    calculated: { value: calculated },
  } as unknown as ComparedGradeValueV1;
}

function numeric(imported: number, calculated = imported + 30): ComparedGradeValueV1 {
  return grade(
    { state: 'numeric', value: imported },
    { state: 'numeric', value: calculated },
  );
}

function termResult(
  studentIndex: number,
  assignmentIndex: number,
  term: 1 | 2 | 3,
): TermResultV1 {
  const official = 10 + studentIndex + assignmentIndex + term;
  return {
    id: `term-result:council:${studentIndex}:${assignmentIndex}:${term}` as TermResultV1['id'],
    academicYearId: year,
    studentId: students[studentIndex]!,
    enrollmentId: enrollments[studentIndex]!,
    teachingAssignmentId: assignments[assignmentIndex]!,
    term,
    maximum: term === 3 ? 40 : 30,
    quantitative: {
      original: numeric(official - 2),
      parallelRecovery: grade(
        { state: 'not-applicable', reason: 'synthetic' },
        { state: 'numeric', value: 99 },
      ),
      parallelRecoveryApplicability: {
        imported: {
          value: { state: 'not-applicable', reason: 'synthetic' },
          evidence: [{}],
        },
        calculated: { state: 'applicable' },
      } as unknown as TermResultV1['quantitative']['parallelRecoveryApplicability'],
      considered: numeric(official - 1),
    },
    qualitativeOperational: numeric(official - 1),
    officialGrade: numeric(official, 99),
    percentage: numeric(official * 2, 99),
    authorityMode: 'imported-source',
    coverage: coverage(),
    ruleVersion: 'synthetic-2026-v1',
  };
}

function annualResult(
  studentIndex: number,
  assignmentIndex: number,
  failedCount: number,
  finalDecision: AnnualFinalDecisionV1 = { status: 'pending' },
): AnnualResultV1 {
  const failed = assignmentIndex < failedCount;
  const imported = failed ? 50 : 70;
  return {
    id: `annual-result:council:${studentIndex}:${assignmentIndex}` as AnnualResultV1['id'],
    academicYearId: year,
    studentId: students[studentIndex]!,
    enrollmentId: enrollments[studentIndex]!,
    teachingAssignmentId: assignments[assignmentIndex]!,
    originalTotal: numeric(imported, failed ? 100 : 10),
    postRecoveryTotal: numeric(imported, failed ? 100 : 10),
    academicState: {
      imported: failed ? 'not-eligible-for-council' : 'approved-direct',
      calculated: failed ? 'approved-direct' : 'not-eligible-for-council',
    },
    finalDecision,
    authorityMode: 'imported-source',
    coverage: studentIndex === 4 && assignmentIndex === 0 ? coverage('partial') : coverage(),
    ruleVersion: 'synthetic-2026-v1',
  };
}

function recovery(
  studentIndex: number,
  assignmentIndex: number,
  recoveredTerm: 1 | 2 | 3,
  recoveryGrade: number,
): FinalRecoveryV1 {
  return {
    id: `final-recovery:council:${studentIndex}:${assignmentIndex}:${recoveredTerm}` as FinalRecoveryV1['id'],
    academicYearId: year,
    studentId: students[studentIndex]!,
    enrollmentId: enrollments[studentIndex]!,
    teachingAssignmentId: assignments[assignmentIndex]!,
    recoveredTerm,
    originalTermGrade: numeric(20),
    applicability: {
      imported: { value: { state: 'applicable' }, evidence: [{}] },
      calculated: { state: 'not-applicable', reason: 'calculated-must-not-control' },
    } as unknown as FinalRecoveryV1['applicability'],
    recoveryGrade: numeric(recoveryGrade, 99),
    replacementTermGrade: numeric(88, 1),
    authorityMode: 'imported-source',
    coverage: coverage(),
    ruleVersion: 'synthetic-2026-v1',
  };
}

function snapshot(): CouncilOfficialProjectionClassSnapshotV1 {
  const recordedDecision: Extract<AnnualFinalDecisionV1, { status: 'recorded' }> = {
    status: 'recorded',
    outcome: 'approved',
    basis: 'class-council',
    resultingState: 'approved-by-council',
    decidedAt: '2026-12-20T12:00:00.000Z',
    reference: 'external-council-decision:synthetic',
  };
  const failedCounts = [0, 1, 2, 3, 0, 1];
  return {
    academicYearId: year,
    academicYearProfile: 2026,
    classGroup: {
      id: classGroup,
      academicYearId: year,
      code: '8A',
      grade: '8',
      section: 'A',
    },
    enrollments: students.map((studentId, index) => ({
      student: {
        id: studentId,
        displayName: `Estudante Sintético ${index + 1}`,
        sourceNames: [],
      },
      enrollment: {
        id: enrollments[index]!,
        academicYearId: year,
        studentId,
        classGroupId: classGroup,
        effectivePeriod: {},
        position: 'current',
        sourcePosition: index + 1,
      },
    })),
    assignments: assignments.map((assignmentId, index) => ({
      teachingAssignment: {
        id: assignmentId,
        academicYearId: year,
        teacherId: teacher,
        classGroupId: classGroup,
        subjectId: subjects[index]!,
        effectivePeriod: {},
        confirmationOrigin: 'imported-source',
      },
      subject: {
        id: subjects[index]!,
        code: `S${index + 1}`,
        displayName: `Componente Sintético ${index + 1}`,
        shortName: `S${index + 1}`,
        status: 'active',
      },
    })),
    termResults: students.flatMap((_studentId, studentIndex) =>
      assignments.flatMap((_assignmentId, assignmentIndex) =>
        ([1, 2, 3] as const).map((term) => termResult(studentIndex, assignmentIndex, term)),
      ),
    ),
    finalRecoveries: [
      recovery(0, 0, 1, 44),
      recovery(1, 0, 1, 33),
      recovery(1, 0, 2, 55),
    ],
    annualResults: students.flatMap((_studentId, studentIndex) =>
      assignments.map((_assignmentId, assignmentIndex) =>
        annualResult(
          studentIndex,
          assignmentIndex,
          failedCounts[studentIndex]!,
          studentIndex === 5 ? recordedDecision : { status: 'pending' },
        ),
      ),
    ),
  };
}

function recordsSource(value: CouncilOfficialProjectionClassSnapshotV1): CouncilOfficialProjectionRecordsSourceV1 {
  return {
    async loadClass(academicYearId, requestedClass) {
      return academicYearId === year && requestedClass === classRef ? value : null;
    },
  };
}

function queueRequest(limit = 100) {
  return {
    operation: 'queue' as const,
    contractVersion: 1 as const,
    academicYearId: year,
    classReference: classRef,
    page: { limit, cursor: null },
  };
}

function studentRequest(reference: CouncilStudentReferenceV1) {
  return {
    operation: 'student' as const,
    contractVersion: 1 as const,
    academicYearId: year,
    classReference: classRef,
    studentReference: reference,
  };
}

describe('projeção anual oficial do Conselho V1', () => {
  it('resolve em lote vários alunos/componentes nos estados 0, 1, 2, 3+ e cobertura insuficiente', async () => {
    const source = createCouncilOfficialProjectionSourceV1(recordsSource(snapshot()));
    const page = await source.listQueue(queueRequest());
    expect(page.items).toHaveLength(6);
    expect(
      page.items.slice(0, 5).map((item) => ({
        queueState: item.calculated.queueState,
        failed: item.calculated.failedComponentCount,
        coverage: item.calculated.coverage.state,
      })),
    ).toEqual([
      { queueState: 'follows-official-annual-result', failed: 0, coverage: 'complete' },
      { queueState: 'eligible-for-council', failed: 1, coverage: 'complete' },
      { queueState: 'eligible-for-council', failed: 2, coverage: 'complete' },
      { queueState: 'not-eligible-for-council', failed: 3, coverage: 'complete' },
      { queueState: 'insufficient-data', failed: null, coverage: 'partial' },
    ]);
    expect(page.items[0]?.calculated.reason).toBe('no-not-approved-components');
    expect(page.items[1]?.calculated.reason).toBe(
      '1-not-approved-component-within-council-limit-2',
    );
  });

  it('ignora integralmente alterações apenas no lado calculated da autoridade oficial', async () => {
    const base = snapshot();
    const changed: CouncilOfficialProjectionClassSnapshotV1 = {
      ...base,
      annualResults: base.annualResults.map((record) => ({
        ...record,
        originalTotal: {
          ...record.originalTotal,
          calculated: { value: { state: 'numeric', value: 0 } },
        },
        postRecoveryTotal: {
          ...record.postRecoveryTotal,
          calculated: { value: { state: 'numeric', value: 100 } },
        },
        academicState: { ...record.academicState, calculated: 'special-status' },
      })),
    };
    const before = await createCouncilOfficialProjectionSourceV1(
      recordsSource(base),
    ).listQueue(queueRequest());
    const after = await createCouncilOfficialProjectionSourceV1(
      recordsSource(changed),
    ).listQueue(queueRequest());
    expect(after.items.map((item) => item.calculated)).toEqual(
      before.items.map((item) => item.calculated),
    );
  });

  it('projeta T1/T2/T3 e REC somente de imported, sem raw evidence nem replacementTermGrade', async () => {
    const source = createCouncilOfficialProjectionSourceV1(recordsSource(snapshot()));
    const detail = await source.getStudent(
      studentRequest(enrollments[0] as unknown as CouncilStudentReferenceV1),
    );
    const first = detail!.annualView[0]!;
    expect(first.periods.map((period) => period.period)).toEqual(['T1', 'T2', 'T3', 'REC']);
    expect(first.periods.slice(0, 3).map((period) => period.value)).toEqual([
      { state: 'numeric', value: 11 },
      { state: 'numeric', value: 12 },
      { state: 'numeric', value: 13 },
    ]);
    expect(first.periods[3]).toMatchObject({
      value: { state: 'numeric', value: 44 },
      coverage: { state: 'complete' },
    });
    expect(detail!.annualView[1]?.periods[3]).toMatchObject({
      value: { state: 'not-applicable' },
      coverage: { state: 'not-applicable' },
      evidence: [],
    });
    expect(first.annualState).toBe('approved-direct');
    expect(first.annualCoverage).toEqual(snapshot().annualResults[0]?.coverage);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toMatch(/RAW SECRET SHEET|ZZ999|raw-source-must-not-cross/u);
    expect(serialized).not.toContain('replacementTermGrade');
    expect(JSON.stringify(detail!.annualView)).not.toContain('calculated');
    expect(first.periods[0].evidence[0]?.reference).toContain('council-official-record:v1');
  });

  it('falha fechada quando a REC é múltipla/ambígua e nunca escolhe uma nota', async () => {
    const source = createCouncilOfficialProjectionSourceV1(recordsSource(snapshot()));
    const detail = await source.getStudent(
      studentRequest(enrollments[1] as unknown as CouncilStudentReferenceV1),
    );
    expect(detail!.annualView[0]?.periods[3]).toEqual({
      period: 'REC',
      value: { state: 'insufficient-data', reason: 'final-recovery-ambiguous' },
      coverage: {
        state: 'insufficient-data',
        expectedItemCount: 1,
        resolvedItemCount: 0,
        missingItemCount: 1,
        reasons: ['final-recovery-ambiguous'],
      },
      evidence: [],
    });
  });

  it('rejeita authorityMode incompatível por aluno sem usar o lado calculated', async () => {
    const base = snapshot();
    const incompatible: CouncilOfficialProjectionClassSnapshotV1 = {
      ...base,
      annualResults: base.annualResults.map((record, index) =>
        index === 0 ? { ...record, authorityMode: 'native-engine' } : record,
      ),
    };
    const page = await createCouncilOfficialProjectionSourceV1(
      recordsSource(incompatible),
    ).listQueue(queueRequest());
    expect(page.items[0]?.calculated).toMatchObject({
      queueState: 'insufficient-data',
      officialAnnualState: 'insufficient-data',
      failedComponentCount: null,
      coverage: { state: 'insufficient-data' },
    });
  });

  it('preserva decisão formal preexistente e impede uma segunda decisão concorrente', async () => {
    const source = createCouncilOfficialProjectionSourceV1(recordsSource(snapshot()));
    const formalReference = enrollments[5] as unknown as CouncilStudentReferenceV1;
    const detail = await source.getStudent(studentRequest(formalReference));
    expect(detail?.calculated).toMatchObject({
      queueState: 'follows-official-annual-result',
      officialAnnualState: 'approved-by-council',
      reason: 'formal-decision-recorded',
    });

    const workspace = createCouncilWorkspaceV1({
      source,
      decisions: createLocalCouncilDecisionStoreV1(),
      server: {
        isAuthorized: () => true,
        decisionIdentity: () => ({
          actorReference: 'actor:synthetic' as CouncilActorReferenceV1,
          decidedAt: '2026-12-21T10:00:00.000Z',
        }),
      },
    });
    const request: CouncilDecisionRequestV1 = {
      operation: 'decision',
      contractVersion: 1,
      academicYearId: year,
      classReference: classRef,
      studentReference: formalReference,
      expectedVersion: 0,
      decision: { outcome: 'approved', resultingState: 'approved-by-council' },
      justification: 'Justificativa sintética que não deve ser gravada.',
    };
    expect(await workspace.decide(request)).toEqual({
      contractVersion: 1,
      outcome: 'decision-unavailable',
      currentVersion: null,
    });
  });

  it('falha fechada diante de decisão formal parcial/conflitante', async () => {
    const base = snapshot();
    const mixed: CouncilOfficialProjectionClassSnapshotV1 = {
      ...base,
      annualResults: base.annualResults.map((record) =>
        record.studentId === students[5] && record.teachingAssignmentId === assignments[0]
          ? { ...record, finalDecision: { status: 'pending' } }
          : record,
      ),
    };
    const page = await createCouncilOfficialProjectionSourceV1(
      recordsSource(mixed),
    ).listQueue(queueRequest());
    expect(page.items[5]?.calculated).toMatchObject({
      queueState: 'insufficient-data',
      officialAnnualState: 'insufficient-data',
      reason: 'formal-decision-inconsistent',
    });
  });

  it('mantém referências/paginação opacas e isolamento de ano/turma', async () => {
    const source = createCouncilOfficialProjectionSourceV1(recordsSource(snapshot()));
    const first = await source.listQueue(queueRequest(2));
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toMatch(/^council-official:v1:/u);
    const second = await source.listQueue({
      ...queueRequest(2),
      page: { limit: 2, cursor: first.nextCursor },
    });
    expect(second.items[0]?.studentReference).not.toBe(first.items[0]?.studentReference);
    expect(
      await source.listQueue({
        ...queueRequest(),
        academicYearId: 'academic-year:council-projection:2027' as AcademicYearId,
      }),
    ).toEqual({ items: [], nextCursor: null });
    expect(
      await source.listQueue({
        ...queueRequest(),
        classReference: 'class-group:council-projection:other' as CouncilClassReferenceV1,
      }),
    ).toEqual({ items: [], nextCursor: null });
  });
});
