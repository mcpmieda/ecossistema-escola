import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  EnrollmentV1,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
  TeachingAssignmentV1,
} from '../../../shared/gradebook-contracts/entities';
import type {
  AcademicGradeValueV1,
  AnnualResultId,
  FinalRecoveryId,
  ImportedApplicabilityV1,
  ImportedGradeValueV1,
  ResultCoverageV1,
  SourceEvidenceSetV1,
  TermResultId,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import type { SourceCellEvidenceV1 } from '../../../shared/gradebook-contracts/source/source-contract-v1';
import {
  loadOfficialAnnualCurriculumV1,
  materializeImportedRecoveryApplicabilityV1,
  projectImportedAnnualResultsV1,
  projectImportedFinalRecoveryV1,
  projectImportedTermResultV1,
  resolveImportedAnnualOriginalTotalV1,
  resolveImportedPostRecoveryTotalV1,
  type AnnualCurriculumSourceV1,
} from '../../../server/gradebook/application/import/academic-result-projection-v1';
import { NATIVE_TERM_OUTCOME_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/term-result/compose-native-term-outcome';
import { NATIVE_FINAL_RECOVERY_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/final-recovery/resolve-native-final-recovery';
import { NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/annual-result/resolve-native-annual-outcome';

const academicYearId = 'academic-year:synthetic' as AcademicYearId;
const studentId = 'student:synthetic' as StudentId;
const enrollmentId = 'enrollment:synthetic' as EnrollmentId;
const classGroupId = 'class:synthetic' as ClassGroupId;
const assignment1 = 'assignment:mathematics' as TeachingAssignmentId;
const assignment2 = 'assignment:science' as TeachingAssignmentId;

function evidence(cellAddress: string, rawValue = 1): SourceEvidenceSetV1 {
  const item: SourceCellEvidenceV1 =
    rawValue === 0
      ? {
          provenance: {
            fileName: 'fixture-sintetica.xlsx',
            fileSha256: 'a'.repeat(64),
            sheetName: 'GUIA-SINTETICA',
            cellAddress,
          },
          classification: 'manual-legacy-zero',
          rawValue: 0,
        }
      : {
          provenance: {
            fileName: 'fixture-sintetica.xlsx',
            fileSha256: 'a'.repeat(64),
            sheetName: 'GUIA-SINTETICA',
            cellAddress,
          },
          classification: 'manual-positive-number',
          rawValue,
        };
  return [item];
}

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function imported(value: number, cellAddress: string): ImportedGradeValueV1 {
  return { value: numeric(value), evidence: evidence(cellAddress, value) };
}

function applicability(
  state: 'applicable' | 'not-applicable' | 'insufficient-data',
  cellAddress: string,
): ImportedApplicabilityV1 {
  const raw = state === 'applicable' ? 1 : 0;
  return {
    value:
      state === 'applicable'
        ? { state }
        : state === 'not-applicable'
          ? { state, reason: 'synthetic explicit zero' }
          : { state, reason: 'synthetic unresolved flag' },
    evidence: evidence(cellAddress, raw),
  };
}

const completeCoverage: ResultCoverageV1 = {
  state: 'complete',
  expectedItemCount: 2,
  resolvedItemCount: 2,
  missingItemCount: 0,
  reasons: [],
};

function assignment(id: TeachingAssignmentId, subject: string): TeachingAssignmentV1 {
  return {
    id,
    academicYearId,
    teacherId: 'teacher:synthetic' as TeacherId,
    classGroupId,
    subjectId: `subject:${subject}` as SubjectId,
    effectivePeriod: {},
    confirmationOrigin: 'administrative',
  };
}

describe('projeções de resultados importados V1', () => {
  it('materializes direct and formula-cached 0/1 REC evidence and keeps every other result under review', () => {
    const provenance = {
      fileName: 'fixture-sintetica.xlsx',
      fileSha256: 'a'.repeat(64),
      sheetName: 'REC-SINTETICA',
      cellAddress: 'AC5',
    };
    expect(
      materializeImportedRecoveryApplicabilityV1({
        observation: { classification: 'numeric', rawValue: 0 },
        provenance,
      }),
    ).toMatchObject({
      state: 'ready',
      value: {
        value: { state: 'not-applicable' },
        evidence: [{ provenance, classification: 'not-applicable', rawValue: 0 }],
      },
    });
    expect(
      materializeImportedRecoveryApplicabilityV1({
        observation: { classification: 'unrecognized', rawValue: false },
        provenance,
      }),
    ).toMatchObject({ state: 'review-required', applicability: { state: 'insufficient-data' } });
    expect(
      materializeImportedRecoveryApplicabilityV1({
        observation: {
          classification: 'formula',
          rawValue: 0,
          formula: 'SYNTHETIC_ZERO()',
          cachedValue: 0,
        },
        provenance,
      }),
    ).toEqual({
      state: 'ready',
      value: {
        value: {
          state: 'not-applicable',
          reason: 'source REC formula result is explicitly numeric zero',
        },
        evidence: [
          {
            provenance,
            classification: 'formula-zero',
            rawValue: 0,
            formula: 'SYNTHETIC_ZERO()',
            cachedValue: 0,
          },
        ],
      },
    });
    expect(
      materializeImportedRecoveryApplicabilityV1({
        observation: {
          classification: 'formula',
          rawValue: 1,
          formula: 'SYNTHETIC_ONE()',
          cachedValue: 1,
        },
        provenance,
      }),
    ).toEqual({
      state: 'ready',
      value: {
        value: { state: 'applicable' },
        evidence: [
          {
            provenance,
            classification: 'formula-nonzero',
            rawValue: 1,
            formula: 'SYNTHETIC_ONE()',
            cachedValue: 1,
          },
        ],
      },
    });
    for (const cachedValue of [null, 2, -1]) {
      expect(
        materializeImportedRecoveryApplicabilityV1({
          observation: {
            classification: 'formula',
            rawValue: cachedValue,
            formula: 'SYNTHETIC_UNSUPPORTED()',
            cachedValue,
          },
          provenance,
        }),
      ).toMatchObject({ state: 'review-required', applicability: { state: 'insufficient-data' } });
    }
  });

  it('projects imported T/Z/AK and calculated details through independent term-core executions while AM stays direct', () => {
    const projected = projectImportedTermResultV1(
      {
        id: 'term-result:synthetic' as TermResultId,
        academicYearId,
        studentId,
        enrollmentId,
        teachingAssignmentId: assignment1,
        term: 1,
        quantitativeTotal: imported(5, 'T5'),
        parallelAssessment: imported(7, 'Z5'),
        qualitativeTotal: imported(8, 'AK5'),
        officialTermGrade: imported(19, 'AM5'),
        calculatedInput: {
          term: 1,
          quantitativeOriginal: numeric(10),
          parallelRecovery: { state: 'absent' },
          qualitativeOperational: numeric(3),
        },
      },
      NATIVE_TERM_OUTCOME_PROFILE_2026_V1,
    );

    expect(projected.record.maximum).toBe(30);
    expect(projected.record.quantitative.considered.imported.value).toEqual(numeric(7));
    expect(projected.record.quantitative.considered.calculated.value).toEqual(numeric(10));
    expect(projected.record.officialGrade.imported.value).toEqual(numeric(19));
    expect(projected.record.officialGrade.calculated.value).not.toEqual(numeric(19));
    expect(projected.record.percentage.imported.value).not.toEqual(
      projected.record.percentage.calculated.value,
    );
    expect(
      projected.record.percentage.imported.evidence.map((item) => item.provenance.cellAddress),
    ).toEqual(['T5', 'Z5', 'AK5']);
    expect(projected.record.authorityMode).toBe('imported-source');
    expect(projected.record.officialGrade.imported.evidence[0].provenance.cellAddress).toBe('AM5');
  });

  it('runs imported X/Y/AA + AC/AD/AE + R/S/T and calculated native inputs through the same final resolver independently', () => {
    const projected = projectImportedFinalRecoveryV1(
      {
        ids: {
          1: 'final:1' as FinalRecoveryId,
          2: 'final:2' as FinalRecoveryId,
          3: 'final:3' as FinalRecoveryId,
        },
        academicYearId,
        studentId,
        enrollmentId,
        teachingAssignmentId: assignment1,
        originalTermGrades: {
          1: imported(10, 'X5'),
          2: imported(20, 'Y5'),
          3: imported(25, 'AA5'),
        },
        applicability: {
          1: applicability('not-applicable', 'AC5'),
          2: applicability('not-applicable', 'AD5'),
          3: applicability('not-applicable', 'AE5'),
        },
        recoveryGrades: {
          1: imported(12, 'R5'),
          2: { value: { state: 'absent' }, evidence: evidence('S5') },
          3: { value: { state: 'absent' }, evidence: evidence('T5') },
        },
        calculatedInput: {
          originalTermGrades: { 1: numeric(10), 2: numeric(20), 3: numeric(25) },
          recoveryGrades: {
            1: numeric(12),
            2: { state: 'absent' },
            3: { state: 'absent' },
          },
        },
      },
      NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
    );

    expect(projected.importedOutcome.terms[1].applicability.state).toBe('not-applicable');
    expect(projected.calculatedOutcome.terms[1].applicability.state).toBe('applicable');
    expect(projected.records[0].replacementTermGrade.imported.value).toEqual(numeric(10));
    expect(projected.records[0].replacementTermGrade.calculated.value).toEqual(numeric(12));
    expect(projected.importedOutcome.annualApplicability.state).toBe('not-applicable');
    expect(projected.calculatedOutcome.annualApplicability.state).toBe('applicable');
    expect(projected.records.every((record) => record.authorityMode === 'imported-source')).toBe(
      true,
    );
    expect(projected.importedOutcome.annualMaximum).toBe(100);
    expect(projected.importedOutcome.annualApplicabilityCutoff).toBe(60);
  });

  it('reconciles only T3-AN and REC-AB as final annual-original candidates', () => {
    const equal = resolveImportedAnnualOriginalTotalV1({
      term3AnnualAccumulatedTotal: imported(53, 'AN5'),
      recoveryOriginalAnnual: imported(53, 'AB5'),
    });
    expect(equal).toMatchObject({ state: 'resolved', source: 'term-3-an-and-recovery-ab' });
    if (equal.state === 'resolved') expect(equal.value.evidence).toHaveLength(2);

    expect(
      resolveImportedAnnualOriginalTotalV1({
        term3AnnualAccumulatedTotal: imported(52, 'AN5'),
        recoveryOriginalAnnual: imported(53, 'AB5'),
      }),
    ).toEqual({ state: 'review-required', reason: 'term-3-an-and-recovery-ab-diverge' });
    expect(
      resolveImportedAnnualOriginalTotalV1({
        term3AnnualAccumulatedTotal: imported(53, 'AN5'),
        recoveryOriginalAnnual: null,
      }),
    ).toMatchObject({ state: 'resolved', source: 'term-3-an' });
    expect(
      resolveImportedAnnualOriginalTotalV1({
        term3AnnualAccumulatedTotal: null,
        recoveryOriginalAnnual: imported(53, 'AB5'),
      }),
    ).toMatchObject({ state: 'resolved', source: 'recovery-ab' });
    expect(
      resolveImportedAnnualOriginalTotalV1({
        term3AnnualAccumulatedTotal: null,
        recoveryOriginalAnnual: null,
      }),
    ).toEqual({
      state: 'insufficient-data',
      reason: 'final-annual-original-total-unavailable',
    });
    expect(
      resolveImportedAnnualOriginalTotalV1({
        term3AnnualAccumulatedTotal: {
          value: { state: 'insufficient-data', reason: 'invalid AN' },
          evidence: evidence('AN5'),
        },
        recoveryOriginalAnnual: imported(53, 'AB5'),
      }).state,
    ).toBe('insufficient-data');
  });

  it('uses U directly and only derives a missing U when the official resolver proves recovery not applicable', () => {
    const base = projectImportedFinalRecoveryV1(
      {
        ids: {
          1: 'final:u1' as FinalRecoveryId,
          2: 'final:u2' as FinalRecoveryId,
          3: 'final:u3' as FinalRecoveryId,
        },
        academicYearId,
        studentId,
        enrollmentId,
        teachingAssignmentId: assignment1,
        originalTermGrades: {
          1: imported(20, 'X5'),
          2: imported(20, 'Y5'),
          3: imported(25, 'AA5'),
        },
        applicability: {
          1: applicability('not-applicable', 'AC5'),
          2: applicability('not-applicable', 'AD5'),
          3: applicability('not-applicable', 'AE5'),
        },
        recoveryGrades: {
          1: { value: { state: 'absent' }, evidence: evidence('R5') },
          2: { value: { state: 'absent' }, evidence: evidence('S5') },
          3: { value: { state: 'absent' }, evidence: evidence('T5') },
        },
        calculatedInput: {
          originalTermGrades: { 1: numeric(20), 2: numeric(20), 3: numeric(25) },
          recoveryGrades: {
            1: { state: 'absent' },
            2: { state: 'absent' },
            3: { state: 'absent' },
          },
        },
      },
      NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
    );
    const original = imported(65, 'AB5');
    expect(
      resolveImportedPostRecoveryTotalV1({
        recoveryTotalAfterRecovery: imported(70, 'U5'),
        originalTotal: original,
        applicabilityEvidence: evidence('AC5'),
        importedFinalRecoveryOutcome: base.importedOutcome,
      }),
    ).toMatchObject({ state: 'resolved', source: 'recovery-u', value: { value: numeric(70) } });
    expect(
      resolveImportedPostRecoveryTotalV1({
        recoveryTotalAfterRecovery: null,
        originalTotal: original,
        applicabilityEvidence: evidence('AC5'),
        importedFinalRecoveryOutcome: base.importedOutcome,
      }),
    ).toMatchObject({
      state: 'resolved',
      source: 'official-resolver-not-applicable',
      value: { value: numeric(65) },
    });

    const unresolvedOutcome = {
      ...base.importedOutcome,
      annualApplicability: {
        state: 'insufficient-data',
        reason: 'synthetic missing flag',
      } as const,
    };
    expect(
      resolveImportedPostRecoveryTotalV1({
        recoveryTotalAfterRecovery: null,
        originalTotal: original,
        applicabilityEvidence: evidence('AC5'),
        importedFinalRecoveryOutcome: unresolvedOutcome,
      }).state,
    ).toBe('insufficient-data');
    expect(
      resolveImportedPostRecoveryTotalV1({
        recoveryTotalAfterRecovery: {
          value: { state: 'insufficient-data', reason: 'invalid U' },
          evidence: evidence('U5'),
        },
        originalTotal: original,
        applicabilityEvidence: evidence('AC5'),
        importedFinalRecoveryOutcome: base.importedOutcome,
      }).state,
    ).toBe('insufficient-data');
  });

  it('loads the complete official curriculum in bounded pages, including assignments absent from the request', async () => {
    const pages: string[] = [];
    const source: AnnualCurriculumSourceV1 = {
      async listAssignments(input) {
        pages.push(`${input.limit}:${input.cursor ?? 'first'}`);
        return input.cursor === null
          ? { items: [assignment(assignment1, 'mathematics')], nextCursor: 'page-2' }
          : { items: [assignment(assignment2, 'science')], nextCursor: null };
      },
    };
    const enrollment: EnrollmentV1 = {
      id: enrollmentId,
      academicYearId,
      studentId,
      classGroupId,
      effectivePeriod: {},
      position: 'current',
    };
    const curriculum = await loadOfficialAnnualCurriculumV1(source, enrollment);
    expect(curriculum.map((value) => value.id)).toEqual([assignment1, assignment2]);
    expect(pages).toEqual(['100:first', '100:page-2']);
  });

  it('computes imported and calculated annual states independently and blocks incomplete official curriculum coverage', () => {
    const curriculum = [assignment(assignment1, 'mathematics'), assignment(assignment2, 'science')];
    const oneComponent = projectImportedAnnualResultsV1(
      {
        academicYearId,
        studentId,
        enrollmentId,
        curriculum,
        importedComponents: [
          {
            id: 'annual:mathematics' as AnnualResultId,
            teachingAssignmentId: assignment1,
            originalTotal: imported(70, 'AB5'),
            postRecoveryTotal: imported(70, 'U5'),
            coverage: completeCoverage,
          },
        ],
        calculatedComponents: [
          {
            teachingAssignmentId: assignment1,
            originalTotal: numeric(50),
            postRecoveryTotal: numeric(50),
            coverage: completeCoverage,
          },
        ],
      },
      NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1,
    );
    expect(oneComponent.councilRelease).toBe('blocked-incomplete-coverage');
    expect(oneComponent.importedOutcome.calculatedAcademicState).toBe('insufficient-data');

    const complete = projectImportedAnnualResultsV1(
      {
        academicYearId,
        studentId,
        enrollmentId,
        curriculum,
        importedComponents: [
          {
            id: 'annual:mathematics' as AnnualResultId,
            teachingAssignmentId: assignment1,
            originalTotal: imported(70, 'AB5'),
            postRecoveryTotal: imported(70, 'U5'),
            coverage: completeCoverage,
          },
          {
            id: 'annual:science' as AnnualResultId,
            teachingAssignmentId: assignment2,
            originalTotal: imported(70, 'AB6'),
            postRecoveryTotal: imported(70, 'U6'),
            coverage: completeCoverage,
          },
        ],
        calculatedComponents: [
          {
            teachingAssignmentId: assignment1,
            originalTotal: numeric(50),
            postRecoveryTotal: numeric(50),
            coverage: completeCoverage,
          },
          {
            teachingAssignmentId: assignment2,
            originalTotal: numeric(70),
            postRecoveryTotal: numeric(70),
            coverage: completeCoverage,
          },
        ],
      },
      NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1,
    );
    expect(complete.councilRelease).toBe('ready');
    expect(complete.importedOutcome.calculatedAcademicState).toBe('approved-direct');
    expect(complete.calculatedOutcome.calculatedAcademicState).toBe('eligible-for-council');
    expect(complete.records).toHaveLength(2);
    expect(complete.records[0]!.academicState).toEqual({
      imported: 'approved-direct',
      calculated: 'eligible-for-council',
    });
    expect(complete.records.every((record) => record.finalDecision.status === 'pending')).toBe(
      true,
    );
  });
});
