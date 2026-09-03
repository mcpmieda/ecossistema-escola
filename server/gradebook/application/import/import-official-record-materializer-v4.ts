import type {
  AcademicTermV1,
  AnnualResultId,
  AnnualResultV1,
  FinalRecoveryId,
  ImportedGradeValueV1,
  ResultCoverageV1,
  TermResultId,
  TermResultV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  EnrollmentV1,
  TeachingAssignmentV1,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  GradebookImportPersistenceRequestV4,
  GradebookImportRecoverySheetObservationV4,
  GradebookImportTermSheetObservationV4,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import type { SourceCellProvenanceV1 } from '../../../../shared/gradebook-contracts/source/source-contract-v1';
import type {
  AcademicRecordV1,
  AcademicPersistenceContextV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import {
  NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
  composeNativeTermResult,
} from '../../../../src/gradebook-domain/calculations/term/compose-native-term-result';
import { NATIVE_TERM_OUTCOME_PROFILE_2026_V1 } from '../../../../src/gradebook-domain/calculations/term-result/compose-native-term-outcome';
import {
  NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
  resolveNativeFinalRecovery,
  type NativeFinalRecoveryOutcomeV1,
} from '../../../../src/gradebook-domain/calculations/final-recovery/resolve-native-final-recovery';
import { NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1 } from '../../../../src/gradebook-domain/calculations/annual-result/resolve-native-annual-outcome';
import {
  loadOfficialAnnualCurriculumV1,
  materializeImportedRecoveryApplicabilityV1,
  projectImportedAnnualResultsV1,
  projectImportedFinalRecoveryV1,
  projectImportedTermResultV1,
  resolveImportedAnnualOriginalTotalV1,
  resolveImportedPostRecoveryTotalV1,
  type CalculatedAnnualComponentV1,
  type ImportedAnnualComponentV1,
} from './academic-result-projection-v1';
import { materializeGradebookImportResultCellObservationV4 } from './result-cell-observation-v4';
import type { GradebookImportAnnualStateSourceV1 } from '../../persistence/d1/imports/d1-import-annual-state-source-v1';

export type GradebookImportOfficialRecordV4 = Exclude<
  AcademicRecordV1,
  { readonly kind: 'grade-entry' }
>;

export type GradebookImportOfficialRecordMaterializationV4 =
  | { readonly status: 'ready'; readonly records: readonly GradebookImportOfficialRecordV4[] }
  | {
      readonly status: 'review-required';
      readonly reason: 'incompatible-reference' | 'invalid-academic-shape';
    };

interface GroupV4 {
  readonly assignment: TeachingAssignmentV1;
  readonly enrollment: EnrollmentV1;
  readonly studentId: EnrollmentV1['studentId'];
  readonly termSheets: Map<AcademicTermV1, {
    readonly sheet: GradebookImportTermSheetObservationV4;
    readonly student: GradebookImportTermSheetObservationV4['students'][number];
  }>;
  recovery: {
    readonly sheet: GradebookImportRecoverySheetObservationV4;
    readonly student: GradebookImportRecoverySheetObservationV4['students'][number];
  } | null;
  readonly termResults: Map<AcademicTermV1, TermResultV1>;
  importedFinalOutcome: NativeFinalRecoveryOutcomeV1 | null;
  calculatedFinalOutcome: NativeFinalRecoveryOutcomeV1 | null;
  annualImportedComponent: ImportedAnnualComponentV1 | null;
  annualCalculatedComponent: CalculatedAnnualComponentV1 | null;
}

class ReviewRequiredV4 extends Error {
  constructor(readonly reason: 'incompatible-reference' | 'invalid-academic-shape') {
    super(reason);
    this.name = 'ReviewRequiredV4';
  }
}

function review(reason: ReviewRequiredV4['reason']): never {
  throw new ReviewRequiredV4(reason);
}

async function opaqueId(prefix: string, value: readonly (string | number)[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${prefix}:${hexadecimal.slice(0, 32)}`;
}

function provenance(
  request: GradebookImportPersistenceRequestV4,
  sheetName: string,
  row: number,
  column: string,
): SourceCellProvenanceV1 {
  return {
    fileName: request.manifest.fileName,
    fileSha256: request.manifest.sha256,
    sheetName,
    cellAddress: `${column}${row}`,
  };
}

function materializedCell(input: {
  readonly request: GradebookImportPersistenceRequestV4;
  readonly sheetName: string;
  readonly row: number;
  readonly column: string;
  readonly maximumValue: number;
  readonly observation: Parameters<typeof materializeGradebookImportResultCellObservationV4>[0]['observation'];
}): ImportedGradeValueV1 {
  const result = materializeGradebookImportResultCellObservationV4({
    observation: input.observation,
    provenance: provenance(input.request, input.sheetName, input.row, input.column),
    maximumValue: input.maximumValue,
  });
  if (result.status !== 'ready') return review('invalid-academic-shape');
  return result.imported;
}

function present(value: ImportedGradeValueV1 | null): ImportedGradeValueV1 | null {
  return value?.value.state === 'absent' ? null : value;
}

function insufficient(reason: string) {
  return { state: 'insufficient-data', reason } as const;
}

function completeAnnualComponentCoverage(): ResultCoverageV1 {
  return {
    state: 'complete',
    expectedItemCount: 2,
    resolvedItemCount: 2,
    missingItemCount: 0,
    reasons: [],
  };
}

function termMaximums(term: AcademicTermV1) {
  return composeNativeTermResult(
    {
      term,
      quantitativeConsidered: { state: 'absent' },
      qualitativeOperational: { state: 'absent' },
    },
    NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
  ).maximums;
}

function groupKey(assignmentId: string, studentId: string, enrollmentId: string): string {
  return JSON.stringify([assignmentId, studentId, enrollmentId]);
}

async function validateAndGroup(
  request: GradebookImportPersistenceRequestV4,
  unitOfWork: PersistenceUnitOfWorkV2,
): Promise<Map<string, GroupV4>> {
  const context = {
    academicYearId: request.confirmedContext.academicYearId,
  } satisfies AcademicPersistenceContextV1;
  const year = await unitOfWork.entities.get(context, {
    kind: 'academic-year',
    id: context.academicYearId,
  });
  if (!year || year.value.kind !== 'academic-year') return review('incompatible-reference');

  const assignments = new Map<string, TeachingAssignmentV1>();
  for (const assignmentId of [...new Set(request.sheets.map((sheet) => sheet.teachingAssignmentId))]) {
    const record = await unitOfWork.entities.get(context, {
      kind: 'teaching-assignment',
      id: assignmentId,
    });
    if (
      !record ||
      record.value.kind !== 'teaching-assignment' ||
      record.value.value.academicYearId !== context.academicYearId
    ) {
      return review('incompatible-reference');
    }
    assignments.set(assignmentId, record.value.value);
  }

  const studentIds = new Set<string>();
  const enrollmentIds = new Set<string>();
  for (const sheet of request.sheets) {
    for (const observed of sheet.students) {
      studentIds.add(observed.confirmedStudent.studentId);
      enrollmentIds.add(observed.confirmedStudent.enrollmentId);
    }
  }
  const studentRecords = await Promise.all(
    [...studentIds].map(async (id) => [id, await unitOfWork.entities.get(context, { kind: 'student', id: id as never })] as const),
  );
  const enrollmentRecords = await Promise.all(
    [...enrollmentIds].map(async (id) => [id, await unitOfWork.entities.get(context, { kind: 'enrollment', id: id as never })] as const),
  );
  const students = new Map(studentRecords);
  const enrollments = new Map(enrollmentRecords);
  const groups = new Map<string, GroupV4>();

  for (const sheet of request.sheets) {
    const assignment = assignments.get(sheet.teachingAssignmentId);
    if (!assignment) return review('incompatible-reference');
    for (const observed of sheet.students) {
      const studentRecord = students.get(observed.confirmedStudent.studentId);
      const enrollmentRecord = enrollments.get(observed.confirmedStudent.enrollmentId);
      if (
        !studentRecord ||
        studentRecord.value.kind !== 'student' ||
        !enrollmentRecord ||
        enrollmentRecord.value.kind !== 'enrollment'
      ) {
        return review('incompatible-reference');
      }
      const enrollment = enrollmentRecord.value.value;
      if (
        enrollment.academicYearId !== context.academicYearId ||
        enrollment.studentId !== observed.confirmedStudent.studentId ||
        enrollment.classGroupId !== assignment.classGroupId
      ) {
        return review('incompatible-reference');
      }
      const key = groupKey(assignment.id, enrollment.studentId, enrollment.id);
      const group = groups.get(key) ?? {
        assignment,
        enrollment,
        studentId: enrollment.studentId,
        termSheets: new Map(),
        recovery: null,
        termResults: new Map(),
        importedFinalOutcome: null,
        calculatedFinalOutcome: null,
        annualImportedComponent: null,
        annualCalculatedComponent: null,
      } satisfies GroupV4;
      if (sheet.kind === 'term') {
        if (group.termSheets.has(sheet.term)) return review('invalid-academic-shape');
        group.termSheets.set(sheet.term, { sheet, student: observed });
      } else {
        if (group.recovery !== null) return review('invalid-academic-shape');
        group.recovery = { sheet, student: observed };
      }
      groups.set(key, group);
    }
  }
  return groups;
}

async function materializeTermResults(
  request: GradebookImportPersistenceRequestV4,
  groups: Map<string, GroupV4>,
  records: GradebookImportOfficialRecordV4[],
): Promise<void> {
  for (const group of groups.values()) {
    for (const [term, observed] of group.termSheets) {
      const maximums = termMaximums(term);
      const row = observed.student.sourceRow;
      const aggregates = observed.student.aggregates;
      const quantitativeTotal = materializedCell({
        request,
        sheetName: observed.sheet.sourceSheetName,
        row,
        column: 'T',
        maximumValue: maximums.quantitative,
        observation: aggregates.quantitativeTotal,
      });
      const parallelAssessment = materializedCell({
        request,
        sheetName: observed.sheet.sourceSheetName,
        row,
        column: 'Z',
        maximumValue: maximums.quantitative,
        observation: aggregates.parallelAssessment,
      });
      const qualitativeTotal = materializedCell({
        request,
        sheetName: observed.sheet.sourceSheetName,
        row,
        column: 'AK',
        maximumValue: maximums.qualitative,
        observation: aggregates.qualitativeTotal,
      });
      const officialTermGrade = materializedCell({
        request,
        sheetName: observed.sheet.sourceSheetName,
        row,
        column: 'AM',
        maximumValue: maximums.term,
        observation: aggregates.officialTermGrade,
      });
      const id = (await opaqueId('term-result:v1', [
        request.confirmedContext.academicYearId,
        group.studentId,
        group.enrollment.id,
        group.assignment.id,
        term,
      ])) as TermResultId;
      const projection = projectImportedTermResultV1(
        {
          id,
          academicYearId: request.confirmedContext.academicYearId,
          studentId: group.studentId,
          enrollmentId: group.enrollment.id,
          teachingAssignmentId: group.assignment.id,
          term,
          quantitativeTotal,
          parallelAssessment,
          qualitativeTotal,
          officialTermGrade,
          calculatedInput: {
            term,
            quantitativeOriginal: quantitativeTotal.value,
            parallelRecovery: parallelAssessment.value,
            qualitativeOperational: qualitativeTotal.value,
          },
        },
        NATIVE_TERM_OUTCOME_PROFILE_2026_V1,
      );
      group.termResults.set(term, projection.record);
      records.push({ kind: 'term-result', value: projection.record });
    }
  }
}

function termGrade(group: GroupV4, term: AcademicTermV1, side: 'imported' | 'calculated') {
  const result = group.termResults.get(term);
  return result?.officialGrade[side].value ?? insufficient(`term-${term}-result-unavailable`);
}

async function materializeFinalRecovery(
  request: GradebookImportPersistenceRequestV4,
  groups: Map<string, GroupV4>,
  records: GradebookImportOfficialRecordV4[],
): Promise<void> {
  const terms = [1, 2, 3] as const;
  for (const group of groups.values()) {
    const calculatedOriginalTermGrades = {
      1: termGrade(group, 1, 'calculated'),
      2: termGrade(group, 2, 'calculated'),
      3: termGrade(group, 3, 'calculated'),
    };
    if (group.recovery === null) {
      const absentRecovery = { 1: { state: 'absent' }, 2: { state: 'absent' }, 3: { state: 'absent' } } as const;
      group.importedFinalOutcome = resolveNativeFinalRecovery(
        {
          originalTermGrades: {
            1: termGrade(group, 1, 'imported'),
            2: termGrade(group, 2, 'imported'),
            3: termGrade(group, 3, 'imported'),
          },
          recoveryGrades: absentRecovery,
        },
        NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
      );
      group.calculatedFinalOutcome = resolveNativeFinalRecovery(
        { originalTermGrades: calculatedOriginalTermGrades, recoveryGrades: absentRecovery },
        NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
      );
      continue;
    }

    const { sheet, student } = group.recovery;
    const row = student.sourceRow;
    const values = student.recovery;
    const maximums = NATIVE_TERM_COMPOSITION_PROFILE_2026_V1.termMaximums;
    const originalTermGrades = {
      1: materializedCell({ request, sheetName: sheet.sourceSheetName, row, column: 'X', maximumValue: maximums[1], observation: values.originalTrimester1 }),
      2: materializedCell({ request, sheetName: sheet.sourceSheetName, row, column: 'Y', maximumValue: maximums[2], observation: values.originalTrimester2 }),
      3: materializedCell({ request, sheetName: sheet.sourceSheetName, row, column: 'AA', maximumValue: maximums[3], observation: values.originalTrimester3 }),
    } as const;
    const recoveryGrades = {
      1: materializedCell({ request, sheetName: sheet.sourceSheetName, row, column: 'R', maximumValue: maximums[1], observation: values.trimester1 }),
      2: materializedCell({ request, sheetName: sheet.sourceSheetName, row, column: 'S', maximumValue: maximums[2], observation: values.trimester2 }),
      3: materializedCell({ request, sheetName: sheet.sourceSheetName, row, column: 'T', maximumValue: maximums[3], observation: values.trimester3 }),
    } as const;
    const applicability = {
      1: materializeImportedRecoveryApplicabilityV1({
        observation: values.applicabilityTrimester1,
        provenance: provenance(request, sheet.sourceSheetName, row, 'AC'),
      }),
      2: materializeImportedRecoveryApplicabilityV1({
        observation: values.applicabilityTrimester2,
        provenance: provenance(request, sheet.sourceSheetName, row, 'AD'),
      }),
      3: materializeImportedRecoveryApplicabilityV1({
        observation: values.applicabilityTrimester3,
        provenance: provenance(request, sheet.sourceSheetName, row, 'AE'),
      }),
    } as const;
    if (terms.some((term) => applicability[term].state !== 'ready'))
      return review('invalid-academic-shape');
    const ids = {
      1: (await opaqueId('final-recovery:v1', [request.confirmedContext.academicYearId, group.studentId, group.enrollment.id, group.assignment.id, 1])) as FinalRecoveryId,
      2: (await opaqueId('final-recovery:v1', [request.confirmedContext.academicYearId, group.studentId, group.enrollment.id, group.assignment.id, 2])) as FinalRecoveryId,
      3: (await opaqueId('final-recovery:v1', [request.confirmedContext.academicYearId, group.studentId, group.enrollment.id, group.assignment.id, 3])) as FinalRecoveryId,
    };
    const projection = projectImportedFinalRecoveryV1(
      {
        ids,
        academicYearId: request.confirmedContext.academicYearId,
        studentId: group.studentId,
        enrollmentId: group.enrollment.id,
        teachingAssignmentId: group.assignment.id,
        originalTermGrades,
        applicability: {
          1: applicability[1].value,
          2: applicability[2].value,
          3: applicability[3].value,
        },
        recoveryGrades,
        calculatedInput: {
          originalTermGrades: calculatedOriginalTermGrades,
          recoveryGrades: {
            1: recoveryGrades[1].value,
            2: recoveryGrades[2].value,
            3: recoveryGrades[3].value,
          },
        },
      },
      NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
    );
    group.importedFinalOutcome = projection.importedOutcome;
    group.calculatedFinalOutcome = projection.calculatedOutcome;
    for (const value of projection.records) records.push({ kind: 'final-recovery', value });
  }
}

async function materializeAnnualComponents(
  request: GradebookImportPersistenceRequestV4,
  groups: Map<string, GroupV4>,
): Promise<void> {
  for (const group of groups.values()) {
    const importedFinal = group.importedFinalOutcome;
    const calculatedFinal = group.calculatedFinalOutcome;
    if (!importedFinal || !calculatedFinal) continue;
    const term3 = group.termSheets.get(3);
    const t3Annual = term3
      ? materializedCell({
          request,
          sheetName: term3.sheet.sourceSheetName,
          row: term3.student.sourceRow,
          column: 'AN',
          maximumValue: 100,
          observation: term3.student.aggregates.annualAccumulatedTotal,
        })
      : null;
    const recovery = group.recovery;
    const recoveryOriginal = recovery
      ? materializedCell({
          request,
          sheetName: recovery.sheet.sourceSheetName,
          row: recovery.student.sourceRow,
          column: 'AB',
          maximumValue: 100,
          observation: recovery.student.recovery.originalAnnual,
        })
      : null;
    const original = resolveImportedAnnualOriginalTotalV1({
      term3AnnualAccumulatedTotal: present(t3Annual),
      recoveryOriginalAnnual: present(recoveryOriginal),
    });
    if (original.state === 'review-required') return review('invalid-academic-shape');
    if (original.state !== 'resolved') continue;
    const recoveryTotal = recovery
      ? materializedCell({
          request,
          sheetName: recovery.sheet.sourceSheetName,
          row: recovery.student.sourceRow,
          column: 'U',
          maximumValue: 100,
          observation: recovery.student.recovery.totalAfterRecovery,
        })
      : null;
    const applicabilityEvidence =
      group.recovery === null
        ? original.value.evidence
        : ([
            ...materializeImportedRecoveryApplicabilityV1({
              observation: group.recovery.student.recovery.applicabilityTrimester1,
              provenance: provenance(request, group.recovery.sheet.sourceSheetName, group.recovery.student.sourceRow, 'AC'),
            }).state === 'ready'
              ? materializeImportedRecoveryApplicabilityV1({
                  observation: group.recovery.student.recovery.applicabilityTrimester1,
                  provenance: provenance(request, group.recovery.sheet.sourceSheetName, group.recovery.student.sourceRow, 'AC'),
                }).value.evidence
              : [],
          ] as unknown as ImportedGradeValueV1['evidence']);
    const postRecovery = resolveImportedPostRecoveryTotalV1({
      recoveryTotalAfterRecovery: present(recoveryTotal),
      originalTotal: original.value,
      applicabilityEvidence,
      importedFinalRecoveryOutcome: importedFinal,
    });
    if (postRecovery.state !== 'resolved') continue;
    group.annualImportedComponent = {
      id: (await opaqueId('annual-result:v1', [
        request.confirmedContext.academicYearId,
        group.studentId,
        group.enrollment.id,
        group.assignment.id,
      ])) as AnnualResultId,
      teachingAssignmentId: group.assignment.id,
      originalTotal: original.value,
      postRecoveryTotal: postRecovery.value,
      coverage: completeAnnualComponentCoverage(),
    };
    group.annualCalculatedComponent = {
      teachingAssignmentId: group.assignment.id,
      originalTotal: calculatedFinal.originalTotal,
      postRecoveryTotal: calculatedFinal.postRecoveryTotal,
      coverage: calculatedFinal.coverage,
    };
  }
}

function existingImportedComponent(value: AnnualResultV1): ImportedAnnualComponentV1 {
  return {
    id: value.id,
    teachingAssignmentId: value.teachingAssignmentId,
    originalTotal: value.originalTotal.imported,
    postRecoveryTotal: value.postRecoveryTotal.imported,
    coverage: value.coverage,
  };
}

function existingCalculatedComponent(value: AnnualResultV1): CalculatedAnnualComponentV1 {
  return {
    teachingAssignmentId: value.teachingAssignmentId,
    originalTotal: value.originalTotal.calculated.value,
    postRecoveryTotal: value.postRecoveryTotal.calculated.value,
    coverage: value.coverage,
  };
}

async function materializeAnnualResults(
  request: GradebookImportPersistenceRequestV4,
  groups: Map<string, GroupV4>,
  annualStateSource: GradebookImportAnnualStateSourceV1,
  records: GradebookImportOfficialRecordV4[],
): Promise<void> {
  const classIds = [...new Set([...groups.values()].map((group) => group.assignment.classGroupId))];
  for (const classGroupId of classIds) {
    const classGroups = [...groups.values()].filter(
      (group) => group.assignment.classGroupId === classGroupId,
    );
    const representative = classGroups.find((group) => group.enrollment.position === 'current');
    if (!representative) continue;
    let curriculum: readonly TeachingAssignmentV1[];
    try {
      curriculum = await loadOfficialAnnualCurriculumV1(annualStateSource, representative.enrollment);
    } catch {
      return review('invalid-academic-shape');
    }
    const existing = await annualStateSource.loadCurrentAnnualResultsForClass({
      academicYearId: request.confirmedContext.academicYearId,
      classGroupId,
    });
    const students = new Map<string, GroupV4[]>();
    for (const group of classGroups) {
      if (group.enrollment.position !== 'current') continue;
      const list = students.get(group.enrollment.id) ?? [];
      list.push(group);
      students.set(group.enrollment.id, list);
    }
    for (const studentGroups of students.values()) {
      const first = studentGroups[0]!;
      const replacedAssignmentIds = new Set(studentGroups.map((group) => group.assignment.id));
      const existingForStudent = existing.filter(
        (value) =>
          value.studentId === first.studentId &&
          value.enrollmentId === first.enrollment.id &&
          !replacedAssignmentIds.has(value.teachingAssignmentId),
      );
      const importedComponents = [
        ...existingForStudent.map(existingImportedComponent),
        ...studentGroups.flatMap((group) =>
          group.annualImportedComponent ? [group.annualImportedComponent] : [],
        ),
      ];
      const calculatedComponents = [
        ...existingForStudent.map(existingCalculatedComponent),
        ...studentGroups.flatMap((group) =>
          group.annualCalculatedComponent ? [group.annualCalculatedComponent] : [],
        ),
      ];
      const projection = projectImportedAnnualResultsV1(
        {
          academicYearId: request.confirmedContext.academicYearId,
          studentId: first.studentId,
          enrollmentId: first.enrollment.id,
          curriculum,
          importedComponents,
          calculatedComponents,
        },
        NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1,
      );
      for (const value of projection.records) records.push({ kind: 'annual-result', value });
    }
  }
}

export async function materializeGradebookImportOfficialRecordsV4(input: {
  readonly request: GradebookImportPersistenceRequestV4;
  readonly unitOfWork: PersistenceUnitOfWorkV2;
  readonly annualStateSource: GradebookImportAnnualStateSourceV1;
}): Promise<GradebookImportOfficialRecordMaterializationV4> {
  try {
    const groups = await validateAndGroup(input.request, input.unitOfWork);
    const records: GradebookImportOfficialRecordV4[] = [];
    await materializeTermResults(input.request, groups, records);
    await materializeFinalRecovery(input.request, groups, records);
    await materializeAnnualComponents(input.request, groups);
    await materializeAnnualResults(input.request, groups, input.annualStateSource, records);
    return { status: 'ready', records };
  } catch (cause) {
    if (cause instanceof ReviewRequiredV4) {
      return { status: 'review-required', reason: cause.reason };
    }
    throw cause;
  }
}
