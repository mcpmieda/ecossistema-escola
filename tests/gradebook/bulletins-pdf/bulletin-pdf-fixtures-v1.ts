import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  SubjectId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type {
  AnnualResultId,
  AssessmentComponentId,
  GradeEntryId,
  ResultCoverageV1,
  TermResultId,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  BULLETIN_AUTHORITY_MODE_V1,
  BULLETIN_CONTRACT_VERSION_V1,
  BULLETIN_MODEL_VERSION_V1,
  type BulletinComparedGradeValueV1,
  type BulletinDataVersionV1,
  type BulletinIssuerIdV1,
  type BulletinModelV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:6a' as ClassGroupId;
const studentId = 'student:synthetic:unicode' as StudentId;
const enrollmentId = 'enrollment:synthetic:unicode' as EnrollmentId;
const subjectId = 'subject:synthetic:math' as SubjectId;
const teachingAssignmentId = 'assignment:synthetic:math' as TeachingAssignmentId;
const termResultId = 'term-result:synthetic:unicode:t1' as TermResultId;
const annualResultId = 'annual-result:synthetic:unicode' as AnnualResultId;
const assessmentComponentId = 'assessment:synthetic:written' as AssessmentComponentId;
const gradeEntryId = 'grade-entry:synthetic:written' as GradeEntryId;

export const completeCoverageV1 = {
  state: 'complete',
  expectedItemCount: 2,
  resolvedItemCount: 2,
  missingItemCount: 0,
  reasons: [],
} satisfies ResultCoverageV1;

export const insufficientCoverageV1 = {
  state: 'insufficient-data',
  expectedItemCount: 2,
  resolvedItemCount: 1,
  missingItemCount: 1,
  reasons: ['synthetic-missing-result'],
} satisfies ResultCoverageV1;

export function gradePairV1(
  imported: BulletinComparedGradeValueV1['imported'],
  calculated: BulletinComparedGradeValueV1['calculated'] = imported,
): BulletinComparedGradeValueV1 {
  return { imported, calculated };
}

export const statefulGradePairV1 = gradePairV1(
  { state: 'official-zero', value: 0, sourceMarker: 0.1 },
  { state: 'legacy-zero', value: 0 },
);

export const absentInsufficientPairV1 = gradePairV1(
  { state: 'absent' },
  { state: 'insufficient-data', reason: 'synthetic-unresolved' },
);

export const notApplicablePairV1 = gradePairV1(
  { state: 'not-applicable', reason: 'synthetic-not-applicable' },
  { state: 'not-applicable', reason: 'synthetic-not-applicable' },
);

function identityBase() {
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    academicYearId,
    period: { kind: 'term', term: 1 } as const,
    student: {
      id: studentId,
      enrollmentId,
      displayName: 'Álvaro José Çã — София',
    },
    classGroup: {
      id: classGroupId,
      code: '6º A',
    },
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
  } as const;
}

const subject = {
  id: subjectId,
  teachingAssignmentId,
  displayName: 'Matemática — Álgebra e Razão',
} as const;

function annualResult() {
  return {
    kind: 'annual' as const,
    annualResultId,
    originalTotal: gradePairV1({ state: 'numeric', value: 24 }),
    postRecoveryTotal: gradePairV1({ state: 'numeric', value: 26 }),
    academicState: {
      imported: 'eligible-for-council' as const,
      calculated: 'approved-after-recovery' as const,
    },
    finalDecision: {
      status: 'recorded' as const,
      outcome: 'approved' as const,
      basis: 'class-council' as const,
      resultingState: 'approved-by-council' as const,
      decidedAt: '2026-09-01T18:00:00.000Z',
      reference: 'synthetic-council-reference',
    },
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    coverage: completeCoverageV1,
  };
}

function compositionTerm() {
  return {
    termResultId,
    term: 1 as const,
    quantitative: {
      original: gradePairV1({ state: 'numeric', value: 3.5 }),
      parallelRecovery: absentInsufficientPairV1,
      parallelRecoveryApplicability: {
        imported: { state: 'not-applicable' as const, reason: 'synthetic-threshold-not-met' },
        calculated: { state: 'insufficient-data' as const, reason: 'synthetic-applicability-unresolved' },
      },
      considered: gradePairV1({ state: 'numeric', value: 3.5 }, { state: 'numeric', value: 3.7 }),
    },
    qualitativeOperational: gradePairV1({ state: 'numeric', value: 4.5 }),
    officialGrade: statefulGradePairV1,
    percentage: notApplicablePairV1,
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    coverage: insufficientCoverageV1,
  };
}

export function syntheticBulletinModelV1(): BulletinModelV1 {
  return {
    ...identityBase(),
    modelKind: 'synthetic',
    subjects: [
      {
        subject,
        result: {
          kind: 'term',
          termResultId,
          term: 1,
          officialGrade: statefulGradePairV1,
          percentage: absentInsufficientPairV1,
          authorityMode: BULLETIN_AUTHORITY_MODE_V1,
          coverage: insufficientCoverageV1,
        },
      },
    ],
  };
}

export function compositionBulletinModelV1(): BulletinModelV1 {
  return {
    ...identityBase(),
    modelKind: 'composition',
    subjects: [
      {
        subject,
        terms: [compositionTerm()],
        annualResult: annualResult(),
      },
    ],
  };
}

export function detailedBulletinModelV1(): BulletinModelV1 {
  return {
    ...identityBase(),
    modelKind: 'detailed',
    subjects: [
      {
        subject,
        terms: [
          {
            ...compositionTerm(),
            assessments: [
              {
                assessmentComponentId,
                gradeEntryId,
                type: 'written',
                name: 'Avaliação — Funções e proporções',
                applicability: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
                value: notApplicablePairV1,
                authorityMode: BULLETIN_AUTHORITY_MODE_V1,
              },
            ],
          },
        ],
        annualResult: annualResult(),
      },
    ],
  };
}

export function bulletinSnapshotFixtureV1(
  model: BulletinModelV1 = compositionBulletinModelV1(),
  snapshotVersion = 3,
): BulletinSnapshotV1 {
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    snapshotId: 'bulletin-snapshot:synthetic:unicode' as BulletinSnapshotIdV1,
    snapshotVersion,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    dataVersion: 'data:synthetic:pdf:v1' as BulletinDataVersionV1,
    emittedAt: '2026-09-01T18:30:00.000Z',
    issuerId: 'issuer:synthetic:server' as BulletinIssuerIdV1,
    presentation: { locale: 'pt-BR', dateStyle: 'long' },
    model,
  };
}
