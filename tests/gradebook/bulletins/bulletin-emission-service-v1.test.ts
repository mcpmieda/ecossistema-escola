import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  ClassGroupV1,
  EnrollmentId,
  EnrollmentV1,
  StudentId,
  StudentV1,
  SubjectId,
  SubjectV1,
  TeacherId,
  TeachingAssignmentId,
  TeachingAssignmentV1,
} from '../../../shared/gradebook-contracts/entities';
import {
  BULLETIN_CONTRACT_VERSION_V1,
  isBulletinSnapshotCoherentV1,
  type BulletinBatchEmissionRequestV1,
  type BulletinEmissionRequestV1,
  type BulletinIssuerIdV1,
  type BulletinModelV1,
  type BulletinReprintRequestV1,
  type BulletinSnapshotIdV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type {
  AcademicGradeValueV1,
  AcademicTermV1,
  AnnualResultId,
  AnnualResultV1,
  ApplicabilityV1,
  AssessmentComponentId,
  AuthorityModeV1,
  ComparedApplicabilityV1,
  ComparedGradeValueV1,
  GradeEntryId,
  GradeEntryV1,
  ResultCoverageV1,
  TermResultId,
  TermResultV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import type { AssessmentComponentV2 } from '../../../shared/gradebook-contracts/results/results-contract-v2';
import type { SourceCellEvidenceV1 } from '../../../shared/gradebook-contracts/source/source-contract-v1';
import type {
  AcademicRecordRepositoryV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  VersionedRecordV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  ClassGroupCenterReadModelV1,
  ClassGroupCenterVersionedValueV1,
} from '../../../server/gradebook/application/read-models/class-group/class-group-center-read-model-v1';
import {
  BULLETIN_EMISSION_REASONS_V1,
  createBulletinEmissionServiceV1,
} from '../../../server/gradebook/application/bulletins/bulletin-emission-service-v1';
import { BULLETIN_MATERIALIZATION_REASONS_V1 } from '../../../server/gradebook/application/bulletins/bulletin-model-materializer-v1';
import { createInMemoryBulletinSnapshotRepositoryV1 } from '../../../server/gradebook/application/bulletins/bulletin-snapshot-repository-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:6a' as ClassGroupId;
const teacherId = 'teacher:synthetic:a' as TeacherId;
const subjectId = 'subject:synthetic:math' as SubjectId;
const assignmentId = 'assignment:synthetic:math' as TeachingAssignmentId;
const studentAId = 'student:synthetic:a' as StudentId;
const studentBId = 'student:synthetic:b' as StudentId;
const enrollmentAId = 'enrollment:synthetic:a' as EnrollmentId;
const enrollmentBId = 'enrollment:synthetic:b' as EnrollmentId;
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
  reasons: ['synthetic-missing-item'],
} satisfies ResultCoverageV1;

function evidence(cellAddress: string): SourceCellEvidenceV1 {
  return {
    provenance: {
      fileName: 'synthetic-teacher-workbook.xlsx',
      fileSha256: 'synthetic-sha256',
      sheetName: '6A1º',
      cellAddress,
    },
    classification: 'manual-positive-number',
    rawValue: 8,
  };
}

function compared(
  imported: AcademicGradeValueV1,
  calculated: AcademicGradeValueV1 = imported,
): ComparedGradeValueV1 {
  return {
    imported: { value: imported, evidence: [evidence('R10')] },
    calculated: { value: calculated },
  };
}

function comparedApplicability(
  imported: ApplicabilityV1,
  calculated: ApplicabilityV1 = imported,
): ComparedApplicabilityV1 {
  return {
    imported: { value: imported, evidence: [evidence('Z10')] },
    calculated,
  };
}

function numeric(value: number): ComparedGradeValueV1 {
  return compared({ state: 'numeric', value });
}

function versioned<Value>(value: Value, version = 1): ClassGroupCenterVersionedValueV1<Value> {
  return { value, version, recordedAt: `2026-09-01T10:0${version}:00.000Z` };
}

function component(term: AcademicTermV1): AssessmentComponentV2 {
  const notApplicable = term === 2;
  return {
    id: `assessment:synthetic:t${term}` as AssessmentComponentId,
    academicYearId,
    teachingAssignmentId: assignmentId,
    term,
    type: notApplicable ? 'qualitative-activity' : 'quantitative-assessment',
    name: notApplicable ? 'Atividade Sintética Não Aplicável' : `Avaliação quantitativa ${term}`,
    maximum: notApplicable ? 0 : 10,
    order: 1,
    applicability: notApplicable
      ? { state: 'not-applicable', reason: 'synthetic-not-applicable' }
      : { state: 'applicable' },
  };
}

function termResult(
  term: AcademicTermV1,
  options: {
    readonly authorityMode?: AuthorityModeV1;
    readonly coverage?: ResultCoverageV1;
    readonly officialValue?: number;
  } = {},
): TermResultV1 {
  const defaultValueByTerm = { 1: 8, 2: 9, 3: 10 } as const;
  const value = options.officialValue ?? defaultValueByTerm[term];
  return {
    id: `term-result:synthetic:a:t${term}` as TermResultId,
    academicYearId,
    studentId: studentAId,
    enrollmentId: enrollmentAId,
    teachingAssignmentId: assignmentId,
    term,
    maximum: term === 3 ? 40 : 30,
    quantitative: {
      original: numeric(4),
      parallelRecovery: compared({ state: 'absent' }),
      parallelRecoveryApplicability: comparedApplicability({
        state: 'not-applicable',
        reason: 'synthetic-threshold-not-met',
      }),
      considered: numeric(4),
    },
    qualitativeOperational: numeric(4),
    officialGrade: numeric(value),
    percentage: numeric(80),
    authorityMode: options.authorityMode ?? 'imported-source',
    coverage: options.coverage ?? completeCoverage,
    ruleVersion: 'synthetic-official-v1',
  };
}

function annualResult(
  options: { readonly authorityMode?: AuthorityModeV1; readonly value?: number } = {},
): AnnualResultV1 {
  const value = options.value ?? 48;
  return {
    id: 'annual-result:synthetic:a' as AnnualResultId,
    academicYearId,
    studentId: studentAId,
    enrollmentId: enrollmentAId,
    teachingAssignmentId: assignmentId,
    originalTotal: numeric(value),
    postRecoveryTotal: numeric(value),
    academicState: { imported: 'in-progress', calculated: 'in-progress' },
    finalDecision: { status: 'pending' },
    authorityMode: options.authorityMode ?? 'imported-source',
    coverage: completeCoverage,
    ruleVersion: 'synthetic-official-v1',
  };
}

function gradeEntry(
  term: AcademicTermV1,
  authorityMode: AuthorityModeV1 = 'imported-source',
): GradeEntryV1 {
  const value =
    term === 1
      ? compared({ state: 'absent' }, { state: 'numeric', value: 8 })
      : term === 2
        ? compared(
            { state: 'not-applicable', reason: 'synthetic-not-applicable' },
            { state: 'not-applicable', reason: 'synthetic-not-applicable' },
          )
        : numeric(8);
  return {
    id: `grade-entry:synthetic:a:t${term}` as GradeEntryId,
    academicYearId,
    studentId: studentAId,
    enrollmentId: enrollmentAId,
    assessmentComponentId: component(term).id,
    value,
    authorityMode,
    ruleVersion: 'synthetic-official-v1',
    version: 1,
  };
}

function streamKey(stream: AcademicRecordStreamV1): string {
  return JSON.stringify(stream);
}

function academicRecord<Value extends AcademicRecordV1>(
  value: Value,
  version = 1,
): VersionedRecordV1<Value> {
  return { value, version, recordedAt: `2026-09-01T11:0${version}:00.000Z` };
}

function termStream(term: AcademicTermV1): AcademicRecordStreamV1 {
  return {
    kind: 'term-result',
    studentId: studentAId,
    enrollmentId: enrollmentAId,
    teachingAssignmentId: assignmentId,
    term,
  };
}

function annualStream(): AcademicRecordStreamV1 {
  return {
    kind: 'annual-result',
    studentId: studentAId,
    enrollmentId: enrollmentAId,
    teachingAssignmentId: assignmentId,
  };
}

function gradeStream(term: AcademicTermV1): AcademicRecordStreamV1 {
  return {
    kind: 'grade-entry',
    studentId: studentAId,
    enrollmentId: enrollmentAId,
    assessmentComponentId: component(term).id,
  };
}

interface SyntheticFixture {
  readonly service: ReturnType<typeof createBulletinEmissionServiceV1>;
  readonly records: Map<string, VersionedRecordV1<AcademicRecordV1>>;
  readonly calls: { classGroups: number; academicRecords: number; clock: number };
  readonly studentRequest: (
    model: BulletinEmissionRequestV1['model'],
    period?: BulletinEmissionRequestV1['period'],
  ) => BulletinEmissionRequestV1;
  readonly classGroupRequest: BulletinEmissionRequestV1;
  readonly replaceTerm: (term: AcademicTermV1, value: TermResultV1) => void;
  readonly replaceAnnual: (value: AnnualResultV1) => void;
  readonly replaceGrade: (term: AcademicTermV1, value: GradeEntryV1) => void;
}

function createFixture(): SyntheticFixture {
  const classGroup = {
    id: classGroupId,
    academicYearId,
    code: '6A',
    grade: '6',
    section: 'A',
  } satisfies ClassGroupV1;
  const assignment = {
    id: assignmentId,
    academicYearId,
    teacherId,
    classGroupId,
    subjectId,
    effectivePeriod: {},
    confirmationOrigin: 'imported-source',
  } satisfies TeachingAssignmentV1;
  const subject = {
    id: subjectId,
    code: 'MAT',
    displayName: 'Componente Sintético',
    shortName: 'MAT',
    status: 'active',
  } satisfies SubjectV1;
  const studentA = {
    id: studentAId,
    displayName: 'Aluno Sintético A',
    sourceNames: ['Aluno Sintético A'],
  } satisfies StudentV1;
  const studentB = {
    id: studentBId,
    displayName: 'Aluno Sintético B',
    sourceNames: ['Aluno Sintético B'],
  } satisfies StudentV1;
  const enrollmentA = {
    id: enrollmentAId,
    academicYearId,
    studentId: studentAId,
    classGroupId,
    effectivePeriod: {},
    position: 'current',
  } satisfies EnrollmentV1;
  const enrollmentB = {
    id: enrollmentBId,
    academicYearId,
    studentId: studentBId,
    classGroupId,
    effectivePeriod: {},
    position: 'current',
  } satisfies EnrollmentV1;
  const classGroupModel = {
    academicYearId,
    classGroup: versioned(classGroup),
    students: [
      { enrollment: versioned(enrollmentA), student: versioned(studentA), statusHistory: [] },
      { enrollment: versioned(enrollmentB), student: versioned(studentB), statusHistory: [] },
    ],
    assignments: [
      {
        assignment: versioned(assignment),
        teacher: null,
        subject: versioned(subject),
        assessmentComponents: [1, 2, 3].map((term) => versioned(component(term as AcademicTermV1))),
      },
    ],
  } satisfies ClassGroupCenterReadModelV1;

  const calls = { classGroups: 0, academicRecords: 0, clock: 0 };
  const records = new Map<string, VersionedRecordV1<AcademicRecordV1>>();
  for (const term of [1, 2, 3] as const) {
    records.set(
      streamKey(termStream(term)),
      academicRecord({ kind: 'term-result', value: termResult(term) }),
    );
    records.set(
      streamKey(gradeStream(term)),
      academicRecord({ kind: 'grade-entry', value: gradeEntry(term) }),
    );
  }
  records.set(
    streamKey(annualStream()),
    academicRecord({ kind: 'annual-result', value: annualResult() }),
  );

  const academicRecords: AcademicRecordRepositoryV1 = {
    async getCurrent(_context, stream) {
      calls.academicRecords += 1;
      return records.get(streamKey(stream)) ?? null;
    },
    async listVersions() {
      return { items: [], nextCursor: null };
    },
    async appendVersion() {
      throw new Error('Synthetic read-only repository.');
    },
  };
  const snapshots = createInMemoryBulletinSnapshotRepositoryV1();
  let snapshotSequence = 0;
  const service = createBulletinEmissionServiceV1({
    classGroups: {
      async get(_context, requestedClassGroupId) {
        calls.classGroups += 1;
        return requestedClassGroupId === classGroupId ? classGroupModel : null;
      },
    },
    academicRecords,
    snapshots,
    now: () => {
      calls.clock += 1;
      return `2026-09-01T12:0${calls.clock}:00.000Z`;
    },
    createSnapshotId: () => `snapshot:synthetic:${(snapshotSequence += 1)}` as BulletinSnapshotIdV1,
  });

  function studentRequest(
    model: BulletinEmissionRequestV1['model'],
    period: BulletinEmissionRequestV1['period'] = { kind: 'annual' },
  ): BulletinEmissionRequestV1 {
    return {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      academicYearId,
      period,
      target: {
        kind: 'student',
        classGroupId,
        studentId: studentAId,
        enrollmentId: enrollmentAId,
      },
      model,
      presentation: { locale: 'pt-BR', dateStyle: 'short' },
    };
  }

  return {
    service,
    records,
    calls,
    studentRequest,
    classGroupRequest: {
      ...studentRequest('synthetic', { kind: 'term', term: 1 }),
      target: { kind: 'class-group', classGroupId },
    },
    replaceTerm(term, value) {
      const current = records.get(streamKey(termStream(term)));
      records.set(
        streamKey(termStream(term)),
        academicRecord({ kind: 'term-result', value }, (current?.version ?? 0) + 1),
      );
    },
    replaceAnnual(value) {
      const current = records.get(streamKey(annualStream()));
      records.set(
        streamKey(annualStream()),
        academicRecord({ kind: 'annual-result', value }, (current?.version ?? 0) + 1),
      );
    },
    replaceGrade(term, value) {
      const current = records.get(streamKey(gradeStream(term)));
      records.set(
        streamKey(gradeStream(term)),
        academicRecord({ kind: 'grade-entry', value }, (current?.version ?? 0) + 1),
      );
    },
  };
}

function expectEveryAuthorityImported(model: BulletinModelV1): void {
  expect(model.authorityMode).toBe('imported-source');
  if (model.modelKind === 'synthetic') {
    model.subjects.forEach(({ result }) => expect(result.authorityMode).toBe('imported-source'));
    return;
  }
  if (model.modelKind === 'composition') {
    model.subjects.forEach(({ terms, annualResult }) => {
      terms.forEach((term) => expect(term.authorityMode).toBe('imported-source'));
      if (annualResult !== null) expect(annualResult.authorityMode).toBe('imported-source');
    });
    return;
  }
  model.subjects.forEach(({ terms, annualResult }) => {
    terms.forEach((term) => {
      expect(term.authorityMode).toBe('imported-source');
      term.assessments.forEach((assessment) =>
        expect(assessment.authorityMode).toBe('imported-source'),
      );
    });
    if (annualResult !== null) expect(annualResult.authorityMode).toBe('imported-source');
  });
}

function expectDeeplyFrozen(value: unknown, visited = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value as Record<string, unknown>).forEach((nested) =>
    expectDeeplyFrozen(nested, visited),
  );
}

describe('provider-independent bulletin emission v1', () => {
  it('materializes synthetic, composition and detailed models from the same official base', async () => {
    const fixture = createFixture();
    const models: BulletinModelV1[] = [];

    for (const kind of ['synthetic', 'composition', 'detailed'] as const) {
      const result = await fixture.service.materialize(fixture.studentRequest(kind), {
        decision: 'allowed',
      });
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') continue;
      models.push(result.model);
      expect(result.model.modelKind).toBe(kind);
      expectEveryAuthorityImported(result.model);
    }

    expect(models).toHaveLength(3);
    expect(models.map(({ student }) => student)).toEqual([
      models[0]?.student,
      models[0]?.student,
      models[0]?.student,
    ]);
    expect(models.map(({ classGroup }) => classGroup)).toEqual([
      models[0]?.classGroup,
      models[0]?.classGroup,
      models[0]?.classGroup,
    ]);
    expect(models[1]?.modelKind === 'composition' && models[1].subjects[0]?.terms).toHaveLength(3);
    if (models[2]?.modelKind === 'detailed') {
      expect(models[2].subjects[0]?.terms).toHaveLength(3);
      expect(models[2].subjects[0]?.terms[0]?.assessments[0]).toMatchObject({
        type: 'quantitative-assessment',
        name: 'Avaliação quantitativa 1',
      });
      expect(models[2].subjects[0]?.terms[0]?.assessments[0]?.value).toEqual({
        imported: { state: 'absent' },
        calculated: { state: 'numeric', value: 8 },
      });
      expect(models[2].subjects[0]?.terms[1]?.assessments[0]).toMatchObject({
        applicability: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
        value: {
          imported: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
          calculated: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
        },
      });
    }
  });

  it('creates a deeply immutable snapshot using server issuer, clock and authorization', async () => {
    const fixture = createFixture();
    const denied = await fixture.service.emit(fixture.studentRequest('synthetic'), {
      decision: 'denied',
      issuerId,
    });
    expect(denied).toMatchObject({ status: 'blocked', reasons: ['not-authorized'] });
    expect(fixture.calls.classGroups).toBe(0);

    const forbiddenRequest = {
      ...fixture.studentRequest('synthetic'),
      issuerId: 'issuer:client',
    } as unknown as BulletinEmissionRequestV1;
    const forbidden = await fixture.service.emit(forbiddenRequest, {
      decision: 'allowed',
      issuerId,
    });
    expect(forbidden).toMatchObject({
      status: 'blocked',
      reasons: [BULLETIN_EMISSION_REASONS_V1.forbiddenClientPayload],
    });

    const result = await fixture.service.emit(fixture.studentRequest('detailed'), {
      decision: 'allowed',
      issuerId,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.issuerId).toBe(issuerId);
    expect(result.snapshot.emittedAt).toBe('2026-09-01T12:01:00.000Z');
    expect(isBulletinSnapshotCoherentV1(result.snapshot)).toBe(true);
    expectDeeplyFrozen(result.snapshot);
    expect(() => {
      (result.snapshot.model.student as { displayName: string }).displayName = 'Mutação proibida';
    }).toThrow();
  });

  it('creates a new version without mutating history and reuses an identical printed version', async () => {
    const fixture = createFixture();
    const request = fixture.studentRequest('composition', { kind: 'term', term: 1 });
    const first = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;

    fixture.replaceTerm(1, termResult(1, { officialValue: 9 }));
    const second = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') return;
    const repeated = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(repeated.status).toBe('ready');
    if (repeated.status !== 'ready') return;

    expect(second.snapshot.snapshotId).toBe(first.snapshot.snapshotId);
    expect(first.snapshot.snapshotVersion).toBe(1);
    expect(second.snapshot.snapshotVersion).toBe(2);
    expect(repeated.snapshot).toBe(second.snapshot);
    expect(fixture.calls.clock).toBe(2);
    if (first.snapshot.model.modelKind === 'composition') {
      expect(first.snapshot.model.subjects[0]?.terms[0]?.officialGrade.imported).toEqual({
        state: 'numeric',
        value: 8,
      });
    }
    expectDeeplyFrozen(first.snapshot);
  });

  it('reprints the exact historical snapshot without reading or recalculating academic data', async () => {
    const fixture = createFixture();
    const request = fixture.studentRequest('synthetic', { kind: 'term', term: 1 });
    const emission = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(emission.status).toBe('ready');
    if (emission.status !== 'ready') return;
    const callsBeforeReprint = { ...fixture.calls };

    fixture.replaceTerm(1, termResult(1, { officialValue: 10 }));
    const reprint = await fixture.service.reprint(
      {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        snapshotId: emission.snapshot.snapshotId,
        snapshotVersion: emission.snapshot.snapshotVersion,
      } satisfies BulletinReprintRequestV1,
      { decision: 'allowed' },
    );

    expect(reprint).toMatchObject({ status: 'ready', source: 'historical-snapshot' });
    if (reprint.status !== 'ready') return;
    expect(reprint.snapshot).toBe(emission.snapshot);
    expect(fixture.calls).toEqual(callsBeforeReprint);
  });

  it('emits a class-group batch partially, separating ready and blocked students', async () => {
    const fixture = createFixture();
    const result = await fixture.service.emitBatch(
      {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        items: [fixture.classGroupRequest],
      } satisfies BulletinBatchEmissionRequestV1,
      { decision: 'allowed', issuerId },
    );

    expect(result.ready).toHaveLength(1);
    expect(result.blocked).toHaveLength(1);
    expect(result.ready[0]?.requestIndex).toBe(0);
    expect(result.blocked[0]?.requestIndex).toBe(0);
    expect(result.ready[0]?.emission.snapshot.model.student.id).toBe(studentAId);
    expect(result.blocked[0]?.emission).toMatchObject({
      status: 'blocked',
      reasons: [BULLETIN_MATERIALIZATION_REASONS_V1.officialResultNotFound],
    });
  });

  it('preserves official coverage and blocks materialization when it is insufficient', async () => {
    const fixture = createFixture();
    fixture.replaceTerm(1, termResult(1, { coverage: insufficientCoverage }));
    const result = await fixture.service.emit(
      fixture.studentRequest('composition', { kind: 'term', term: 1 }),
      { decision: 'allowed', issuerId },
    );

    expect(result).toEqual({
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      status: 'insufficient-data',
      coverage: insufficientCoverage,
      reasons: [BULLETIN_MATERIALIZATION_REASONS_V1.insufficientCoverage],
    });
  });

  it.each([
    {
      level: 'synthetic term result',
      request: (fixture: SyntheticFixture) =>
        fixture.studentRequest('synthetic', { kind: 'term', term: 1 }),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceTerm(1, termResult(1, { authorityMode: 'native-engine' })),
    },
    {
      level: 'term composition',
      request: (fixture: SyntheticFixture) =>
        fixture.studentRequest('composition', { kind: 'term', term: 1 }),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceTerm(1, termResult(1, { authorityMode: 'native-engine' })),
    },
    {
      level: 'annual result',
      request: (fixture: SyntheticFixture) => fixture.studentRequest('synthetic'),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceAnnual(annualResult({ authorityMode: 'native-engine' })),
    },
    {
      level: 'assessment entry',
      request: (fixture: SyntheticFixture) =>
        fixture.studentRequest('detailed', { kind: 'term', term: 1 }),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceGrade(1, gradeEntry(1, 'native-engine')),
    },
  ])('rejects native-engine injected at the $level level', async ({ request, inject }) => {
    const fixture = createFixture();
    inject(fixture);
    const result = await fixture.service.emit(request(fixture), {
      decision: 'allowed',
      issuerId,
    });
    expect(result).toMatchObject({
      status: 'blocked',
      reasons: [BULLETIN_MATERIALIZATION_REASONS_V1.nativeEngineRejected],
    });
    expect(fixture.calls.clock).toBe(0);
  });
});
