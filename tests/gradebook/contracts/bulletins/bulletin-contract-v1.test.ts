import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  SubjectId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  AnnualResultId,
  AssessmentComponentId,
  GradeEntryId,
  ResultCoverageV1,
  TermResultId,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  BULLETIN_AUTHORITY_MODE_V1,
  BULLETIN_CONTRACT_V1,
  BULLETIN_CONTRACT_VERSION_V1,
  BULLETIN_MODEL_KINDS_V1,
  BULLETIN_MODEL_VERSION_V1,
  freezeBulletinSnapshotV1,
  inspectBulletinBatchEmissionRequestV1,
  inspectBulletinEmissionRequestV1,
  inspectBulletinReprintRequestV1,
  isBulletinArtifactPayloadSafeV1,
  isBulletinSnapshotCoherentV1,
  type BulletinAnnualResultV1,
  type BulletinBatchEmissionRequestV1,
  type BulletinBatchEmissionResultV1,
  type BulletinComparedGradeValueV1,
  type BulletinCompositionSubjectV1,
  type BulletinDataVersionV1,
  type BulletinDetailedSubjectV1,
  type BulletinEmissionRequestV1,
  type BulletinEmissionResultV1,
  type BulletinIssuerIdV1,
  type BulletinModelV1,
  type BulletinPdfInputV1,
  type BulletinPreviewInputV1,
  type BulletinReprintRequestV1,
  type BulletinReprintResultV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
  type BulletinSyntheticSubjectV1,
  type BulletinTermCompositionV1,
  type BulletinTermSummaryV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:6a' as ClassGroupId;
const studentId = 'student:synthetic:a' as StudentId;
const enrollmentId = 'enrollment:synthetic:a' as EnrollmentId;
const subjectId = 'subject:synthetic:math' as SubjectId;
const teachingAssignmentId = 'assignment:synthetic:math' as TeachingAssignmentId;
const termResultId = 'term-result:synthetic:a:1' as TermResultId;
const annualResultId = 'annual-result:synthetic:a' as AnnualResultId;
const assessmentComponentId = 'assessment:synthetic:written' as AssessmentComponentId;
const gradeEntryId = 'grade-entry:synthetic:written' as GradeEntryId;
const issuerId = 'issuer:synthetic:server' as BulletinIssuerIdV1;

const completeCoverage = {
  state: 'complete',
  expectedItemCount: 1,
  resolvedItemCount: 1,
  missingItemCount: 0,
  reasons: [],
} satisfies ResultCoverageV1;

const insufficientCoverage = {
  state: 'insufficient-data',
  expectedItemCount: 2,
  resolvedItemCount: 1,
  missingItemCount: 1,
  reasons: ['synthetic-missing-result'],
} satisfies ResultCoverageV1;

function numericPair(value: number): BulletinComparedGradeValueV1 {
  return {
    imported: { state: 'numeric', value },
    calculated: { state: 'numeric', value },
  };
}

const absentPair = {
  imported: { state: 'absent' },
  calculated: { state: 'absent' },
} satisfies BulletinComparedGradeValueV1;

const notApplicablePair = {
  imported: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
  calculated: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
} satisfies BulletinComparedGradeValueV1;

const student = {
  id: studentId,
  enrollmentId,
  displayName: 'Aluno Sintético A',
} as const;

const classGroup = {
  id: classGroupId,
  code: '6A',
} as const;

const subject = {
  id: subjectId,
  teachingAssignmentId,
  displayName: 'Componente Sintético A',
} as const;

function termSummary(value = 8): BulletinTermSummaryV1 {
  return {
    kind: 'term',
    termResultId,
    term: 1,
    officialGrade: numericPair(value),
    percentage: numericPair(80),
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    coverage: completeCoverage,
  };
}

function annualResult(value = 24): BulletinAnnualResultV1 {
  return {
    kind: 'annual',
    annualResultId,
    originalTotal: numericPair(value),
    postRecoveryTotal: numericPair(value),
    academicState: {
      imported: 'in-progress',
      calculated: 'in-progress',
    },
    finalDecision: { status: 'pending' },
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    coverage: completeCoverage,
  };
}

function termComposition(value = 8): BulletinTermCompositionV1 {
  return {
    termResultId,
    term: 1,
    quantitative: {
      original: numericPair(3.6),
      parallelRecovery: absentPair,
      parallelRecoveryApplicability: {
        imported: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
        calculated: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
      },
      considered: numericPair(3.6),
    },
    qualitativeOperational: numericPair(4.4),
    officialGrade: numericPair(value),
    percentage: numericPair(80),
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    coverage: completeCoverage,
  };
}

function syntheticModel(value = 8): BulletinModelV1 {
  const subjects = [
    {
      subject,
      result: termSummary(value),
    } satisfies BulletinSyntheticSubjectV1,
  ];

  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    modelKind: 'synthetic',
    academicYearId,
    period: { kind: 'term', term: 1 },
    student,
    classGroup,
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    subjects,
  };
}

function compositionModel(value = 8): BulletinModelV1 {
  const subjects = [
    {
      subject,
      terms: [termComposition(value)],
      annualResult: annualResult(),
    } satisfies BulletinCompositionSubjectV1,
  ];

  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    modelKind: 'composition',
    academicYearId,
    period: { kind: 'term', term: 1 },
    student,
    classGroup,
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    subjects,
  };
}

function detailedModel(value = 8): BulletinModelV1 {
  const subjects = [
    {
      subject,
      terms: [
        {
          ...termComposition(value),
          assessments: [
            {
              assessmentComponentId,
              gradeEntryId,
              type: 'written',
              name: 'Avaliação Sintética A',
              applicability: { state: 'applicable' },
              value: numericPair(3.6),
              authorityMode: BULLETIN_AUTHORITY_MODE_V1,
            },
            {
              assessmentComponentId: 'assessment:synthetic:na' as AssessmentComponentId,
              gradeEntryId: 'grade-entry:synthetic:na' as GradeEntryId,
              type: 'qualitative-activity',
              name: 'Atividade Sintética Não Aplicável',
              applicability: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
              value: notApplicablePair,
              authorityMode: BULLETIN_AUTHORITY_MODE_V1,
            },
          ],
        },
      ],
      annualResult: annualResult(),
    } satisfies BulletinDetailedSubjectV1,
  ];

  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    modelKind: 'detailed',
    academicYearId,
    period: { kind: 'term', term: 1 },
    student,
    classGroup,
    authorityMode: BULLETIN_AUTHORITY_MODE_V1,
    subjects,
  };
}

function emissionRequest(
  overrides: Partial<BulletinEmissionRequestV1> = {},
): BulletinEmissionRequestV1 {
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    academicYearId,
    period: { kind: 'term', term: 1 },
    target: {
      kind: 'student',
      classGroupId,
      studentId,
      enrollmentId,
    },
    model: 'composition',
    presentation: {
      locale: 'pt-BR',
      dateStyle: 'short',
    },
    ...overrides,
  };
}

function snapshot(
  snapshotVersion = 1,
  dataVersion = 'data:synthetic:v1',
  model: BulletinModelV1 = compositionModel(),
): BulletinSnapshotV1 {
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    snapshotId: `snapshot:synthetic:${snapshotVersion}` as BulletinSnapshotIdV1,
    snapshotVersion,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    dataVersion: dataVersion as BulletinDataVersionV1,
    emittedAt: `2026-09-01T12:0${snapshotVersion}:00.000Z`,
    issuerId,
    presentation: {
      locale: 'pt-BR',
      dateStyle: 'short',
    },
    model,
  };
}

describe('bulletin contract v1', () => {
  it('freezes one versioned contract for synthetic, composition and detailed models over the same base', () => {
    const models = [syntheticModel(), compositionModel(), detailedModel()];

    expect(BULLETIN_MODEL_KINDS_V1).toEqual(['synthetic', 'composition', 'detailed']);
    expect(models.map((model) => model.modelKind)).toEqual(BULLETIN_MODEL_KINDS_V1);

    for (const model of models) {
      expect(model.contractVersion).toBe(1);
      expect(model.modelVersion).toBe(1);
      expect(model.academicYearId).toBe(academicYearId);
      expect(model.student).toEqual(student);
      expect(model.classGroup).toEqual(classGroup);
      expect(model.period).toEqual({ kind: 'term', term: 1 });
      expect(model.authorityMode).toBe('imported-source');
      expect(isBulletinArtifactPayloadSafeV1(model)).toBe(true);
    }
  });

  it('projects official academic values without source evidence, formulas, weights, cuts or rules', () => {
    const artifact = {
      snapshot: snapshot(1, 'data:synthetic:v1', detailedModel()),
    };

    expect(isBulletinArtifactPayloadSafeV1(artifact)).toBe(true);
    const serialized = JSON.stringify(artifact);
    for (const forbiddenField of [
      'evidence',
      'formula',
      'weight',
      'cutoff',
      'ruleVersion',
      'token',
      'authorization',
      'authorized',
      'capabilities',
      'html',
      'css',
      'renderer',
    ]) {
      expect(serialized).not.toContain(`"${forbiddenField}"`);
    }

    expect(BULLETIN_CONTRACT_V1.academicValues).toEqual({
      source: 'official-academic-result-contracts',
      importedAndCalculatedSides: 'preserved',
      sourceEvidence: 'omitted',
      formulas: 'forbidden',
      weights: 'forbidden',
      cutoffs: 'forbidden',
      rules: 'forbidden',
    });
  });

  it('uses exactly the same canonical snapshot structure for preview and PDF', () => {
    const canonicalInput = {
      snapshot: freezeBulletinSnapshotV1(snapshot()),
    };
    const previewInput: BulletinPreviewInputV1 = canonicalInput;
    const pdfInput: BulletinPdfInputV1 = canonicalInput;

    expect(previewInput).toBe(pdfInput);
    expect(previewInput.snapshot).toBe(pdfInput.snapshot);
    expect(BULLETIN_CONTRACT_V1.artifacts.previewAndPdfInput).toBe('same-canonical-snapshot');
    expect(BULLETIN_CONTRACT_V1.artifacts.renderer).toBe('outside-contract');
  });

  it('materializes a deeply immutable coherent snapshot with opaque data and server issuer versions', () => {
    const historical = freezeBulletinSnapshotV1(snapshot());

    expect(isBulletinSnapshotCoherentV1(historical)).toBe(true);
    expect(Object.isFrozen(historical)).toBe(true);
    expect(Object.isFrozen(historical.presentation)).toBe(true);
    expect(Object.isFrozen(historical.model)).toBe(true);
    expect(Object.isFrozen(historical.model.subjects)).toBe(true);
    expect(Reflect.set(historical.model, 'authorityMode', 'native-engine')).toBe(false);
    expect(historical.model.authorityMode).toBe('imported-source');
    expect(historical.dataVersion).toBe('data:synthetic:v1');
    expect(historical.issuerId).toBe(issuerId);
  });

  it('reprints only the exact historical snapshot/version without recalculation fields', () => {
    const historical = freezeBulletinSnapshotV1(snapshot());
    const request = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      snapshotId: historical.snapshotId,
      snapshotVersion: historical.snapshotVersion,
    } satisfies BulletinReprintRequestV1;
    const result = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      status: 'ready',
      source: 'historical-snapshot',
      snapshot: historical,
    } satisfies BulletinReprintResultV1;

    expect(inspectBulletinReprintRequestV1(request)).toBe('ready');
    expect(result.snapshot).toBe(historical);
    expect(result.source).toBe('historical-snapshot');
    expect(request).not.toHaveProperty('academicYearId');
    expect(request).not.toHaveProperty('model');
    expect(request).not.toHaveProperty('dataVersion');
  });

  it('creates a newer emission version without mutating the immutable historical snapshot', () => {
    const historical = freezeBulletinSnapshotV1(
      snapshot(1, 'data:synthetic:v1', compositionModel(8)),
    );
    const current = freezeBulletinSnapshotV1(
      snapshot(2, 'data:synthetic:v2', compositionModel(9)),
    );

    expect(historical.snapshotVersion).toBe(1);
    expect(historical.dataVersion).toBe('data:synthetic:v1');
    expect(historical.model.subjects[0]?.terms[0]?.officialGrade.imported).toEqual({
      state: 'numeric',
      value: 8,
    });

    expect(current.snapshotVersion).toBe(2);
    expect(current.dataVersion).toBe('data:synthetic:v2');
    expect(current.model.subjects[0]?.terms[0]?.officialGrade.imported).toEqual({
      state: 'numeric',
      value: 9,
    });
  });

  it('keeps ready, blocked and insufficient-data emissions explicit without false success', () => {
    const ready = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      status: 'ready',
      snapshot: freezeBulletinSnapshotV1(snapshot()),
    } satisfies BulletinEmissionResultV1;
    const blocked = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      status: 'blocked',
      reasons: ['synthetic-block'],
    } satisfies BulletinEmissionResultV1;
    const insufficient = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      status: 'insufficient-data',
      coverage: insufficientCoverage,
      reasons: ['synthetic-insufficient-data'],
    } satisfies BulletinEmissionResultV1;

    expect(ready.status).toBe('ready');
    expect(blocked.status).toBe('blocked');
    expect(insufficient.status).toBe('insufficient-data');
    expect(insufficient.coverage.state).toBe('insufficient-data');
    expect(blocked).not.toHaveProperty('snapshot');
    expect(insufficient).not.toHaveProperty('snapshot');
  });

  it('separates valid and blocked items in a partial batch', () => {
    const batchRequest = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      items: [
        emissionRequest(),
        emissionRequest({
          target: {
            kind: 'class-group',
            classGroupId,
          },
          model: 'synthetic',
        }),
      ],
    } satisfies BulletinBatchEmissionRequestV1;
    const batchResult = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      ready: [
        {
          requestIndex: 0,
          emission: {
            contractVersion: BULLETIN_CONTRACT_VERSION_V1,
            status: 'ready',
            snapshot: freezeBulletinSnapshotV1(snapshot()),
          },
        },
      ],
      blocked: [
        {
          requestIndex: 1,
          emission: {
            contractVersion: BULLETIN_CONTRACT_VERSION_V1,
            status: 'blocked',
            reasons: ['synthetic-block'],
          },
        },
      ],
    } satisfies BulletinBatchEmissionResultV1;

    expect(inspectBulletinBatchEmissionRequestV1(batchRequest)).toBe('ready');
    expect(batchResult.ready).toHaveLength(1);
    expect(batchResult.blocked).toHaveLength(1);
    expect(batchResult.ready[0]?.requestIndex).toBe(0);
    expect(batchResult.blocked[0]?.requestIndex).toBe(1);
  });

  it('preserves absence and non-applicability instead of fabricating zero', () => {
    const composition = termComposition();
    const detailed = detailedModel();

    expect(composition.quantitative.parallelRecovery.imported).toEqual({ state: 'absent' });
    expect(composition.quantitative.parallelRecovery.calculated).toEqual({ state: 'absent' });

    if (detailed.modelKind !== 'detailed') throw new Error('unexpected synthetic fixture');
    const nonApplicable = detailed.subjects[0]?.terms[0]?.assessments[1];
    expect(nonApplicable?.applicability.state).toBe('not-applicable');
    expect(nonApplicable?.value.imported.state).toBe('not-applicable');
    expect(nonApplicable?.value.calculated.state).toBe('not-applicable');
  });

  it('accepts only year, period, class/student target, model and presentation in an emission request', () => {
    const request = emissionRequest();

    expect(inspectBulletinEmissionRequestV1(request)).toBe('ready');
    expect(Object.keys(request).sort()).toEqual([
      'academicYearId',
      'contractVersion',
      'model',
      'period',
      'presentation',
      'target',
    ]);
    expect(request).not.toHaveProperty('issuerId');
    expect(request).not.toHaveProperty('authorization');
    expect(request).not.toHaveProperty('token');
    expect(request).not.toHaveProperty('capabilities');
  });

  it('rejects formulas, weights, academic rules, tokens, authorization and client actor claims', () => {
    const base = emissionRequest();
    const forbiddenRequests: unknown[] = [
      { ...base, formula: '=A1+B1' },
      { ...base, weights: [0.45, 0.55] },
      { ...base, academicRule: { passingCutoff: 60 } },
      { ...base, token: 'synthetic-token' },
      { ...base, authorization: 'Bearer synthetic' },
      { ...base, authorized: true },
      { ...base, issuerId: 'issuer:client-claim' },
      {
        ...base,
        presentation: {
          ...base.presentation,
          capabilities: ['gradebook.persistence.admin'],
        },
      },
    ];

    for (const request of forbiddenRequests) {
      expect(inspectBulletinEmissionRequestV1(request)).toBe('forbidden-client-payload');
    }

    expect(inspectBulletinEmissionRequestV1({ ...base, href: '/bulletin' })).toBe(
      'invalid-request',
    );
  });
});
