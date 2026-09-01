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
  BULLETIN_MODEL_VERSION_V1,
  isBulletinSnapshotCoherentV1,
  type BulletinBatchEmissionRequestV1,
  type BulletinEmissionRequestV1,
  type BulletinIssuerIdV1,
  type BulletinModelV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type {
  AcademicGradeValueV1,
  AcademicTermV1,
  AnnualResultId,
  AnnualResultV1,
  ApplicabilityV1,
  AssessmentComponentId,
  AssessmentComponentV1,
  AuthorityModeV1,
  ComparedApplicabilityV1,
  ComparedGradeValueV1,
  GradeEntryId,
  GradeEntryV1,
  ResultCoverageV1,
  TermResultId,
  TermResultV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
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
import { createBulletinEmissionServiceV1 } from '../../../server/gradebook/application/bulletins/bulletin-emission-service-v1';
import { BULLETIN_MATERIALIZATION_REASONS_V1 } from '../../../server/gradebook/application/bulletins/bulletin-model-materializer-v1';
import {
  createLocalBulletinSnapshotRepositoryV1,
  type BulletinSnapshotSeriesKeyV1,
} from '../../../server/gradebook/application/bulletins/bulletin-snapshot-repository-v1';

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

const identities = {
  a: { studentId: studentAId, enrollmentId: enrollmentAId },
  b: { studentId: studentBId, enrollmentId: enrollmentBId },
} as const;

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

function component(term: AcademicTermV1): AssessmentComponentV1 {
  const notApplicable = term === 2;
  return {
    id: `assessment:synthetic:t${term}` as AssessmentComponentId,
    academicYearId,
    teachingAssignmentId: assignmentId,
    term,
    type: notApplicable ? 'qualitative-activity' : 'written',
    name: notApplicable ? 'Atividade Sintética Não Aplicável' : `Avaliação Sintética ${term}`,
    maximum: notApplicable ? 0 : 10,
    order: 1,
    applicability: notApplicable
      ? { state: 'not-applicable', reason: 'synthetic-not-applicable' }
      : { state: 'applicable' },
  };
}

function termResult(
  identity: (typeof identities)[keyof typeof identities],
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
    id: `term-result:synthetic:${identity.studentId}:t${term}` as TermResultId,
    academicYearId,
    studentId: identity.studentId,
    enrollmentId: identity.enrollmentId,
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
  identity: (typeof identities)[keyof typeof identities],
  options: { readonly authorityMode?: AuthorityModeV1; readonly value?: number } = {},
): AnnualResultV1 {
  const value = options.value ?? 48;
  return {
    id: `annual-result:synthetic:${identity.studentId}` as AnnualResultId,
    academicYearId,
    studentId: identity.studentId,
    enrollmentId: identity.enrollmentId,
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
  identity: (typeof identities)[keyof typeof identities],
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
    id: `grade-entry:synthetic:${identity.studentId}:t${term}` as GradeEntryId,
    academicYearId,
    studentId: identity.studentId,
    enrollmentId: identity.enrollmentId,
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

function termStream(
  identity: (typeof identities)[keyof typeof identities],
  term: AcademicTermV1,
): AcademicRecordStreamV1 {
  return {
    kind: 'term-result',
    studentId: identity.studentId,
    enrollmentId: identity.enrollmentId,
    teachingAssignmentId: assignmentId,
    term,
  };
}

function annualStream(
  identity: (typeof identities)[keyof typeof identities],
): AcademicRecordStreamV1 {
  return {
    kind: 'annual-result',
    studentId: identity.studentId,
    enrollmentId: identity.enrollmentId,
    teachingAssignmentId: assignmentId,
  };
}

function gradeStream(
  identity: (typeof identities)[keyof typeof identities],
  term: AcademicTermV1,
): AcademicRecordStreamV1 {
  return {
    kind: 'grade-entry',
    studentId: identity.studentId,
    enrollmentId: identity.enrollmentId,
    assessmentComponentId: component(term).id,
  };
}

function academicRecord<Value extends AcademicRecordV1>(
  value: Value,
  version = 1,
): VersionedRecordV1<Value> {
  return { value, version, recordedAt: `2026-09-01T11:0${version}:00.000Z` };
}

interface SyntheticFixture {
  readonly service: ReturnType<typeof createBulletinEmissionServiceV1>;
  readonly calls: { classGroups: number; academicRecords: number; clock: number };
  readonly studentRequest: (
    identity: (typeof identities)[keyof typeof identities],
    model: BulletinEmissionRequestV1['model'],
    period?: BulletinEmissionRequestV1['period'],
  ) => BulletinEmissionRequestV1;
  readonly classRequest: (
    model: BulletinEmissionRequestV1['model'],
    period?: BulletinEmissionRequestV1['period'],
  ) => BulletinEmissionRequestV1;
  readonly replaceTerm: (
    identity: (typeof identities)[keyof typeof identities],
    term: AcademicTermV1,
    value: TermResultV1,
  ) => void;
  readonly replaceAnnual: (
    identity: (typeof identities)[keyof typeof identities],
    value: AnnualResultV1,
  ) => void;
  readonly replaceGrade: (
    identity: (typeof identities)[keyof typeof identities],
    term: AcademicTermV1,
    value: GradeEntryV1,
  ) => void;
}

function createFixture(options: { readonly includeStudentBRecords?: boolean } = {}): SyntheticFixture {
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
  const students = [
    {
      student: {
        id: studentAId,
        displayName: 'Aluno Sintético A',
        sourceNames: ['Aluno Sintético A'],
      } satisfies StudentV1,
      enrollment: {
        id: enrollmentAId,
        academicYearId,
        studentId: studentAId,
        classGroupId,
        effectivePeriod: {},
        position: 'current',
      } satisfies EnrollmentV1,
    },
    {
      student: {
        id: studentBId,
        displayName: 'Aluno Sintético B',
        sourceNames: ['Aluno Sintético B'],
      } satisfies StudentV1,
      enrollment: {
        id: enrollmentBId,
        academicYearId,
        studentId: studentBId,
        classGroupId,
        effectivePeriod: {},
        position: 'current',
      } satisfies EnrollmentV1,
    },
  ];
  const classGroupModel = {
    academicYearId,
    classGroup: versioned(classGroup),
    students: students.map(({ student, enrollment }) => ({
      enrollment: versioned(enrollment),
      student: versioned(student),
      statusHistory: [],
    })),
    assignments: [
      {
        assignment: versioned(assignment),
        teacher: null,
        subject: versioned(subject),
        assessmentComponents: [1, 2, 3].map((term) =>
          versioned(component(term as AcademicTermV1)),
        ),
      },
    ],
  } satisfies ClassGroupCenterReadModelV1;

  const calls = { classGroups: 0, academicRecords: 0, clock: 0 };
  const records = new Map<string, VersionedRecordV1<AcademicRecordV1>>();

  function putStudentRecords(identity: (typeof identities)[keyof typeof identities]): void {
    for (const term of [1, 2, 3] as const) {
      records.set(
        streamKey(termStream(identity, term)),
        academicRecord({ kind: 'term-result', value: termResult(identity, term) }),
      );
      records.set(
        streamKey(gradeStream(identity, term)),
        academicRecord({ kind: 'grade-entry', value: gradeEntry(identity, term) }),
      );
    }
    records.set(
      streamKey(annualStream(identity)),
      academicRecord({ kind: 'annual-result', value: annualResult(identity) }),
    );
  }

  putStudentRecords(identities.a);
  if (options.includeStudentBRecords ?? true) putStudentRecords(identities.b);

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

  let snapshotSequence = 0;
  const service = createBulletinEmissionServiceV1({
    classGroups: {
      async get(_context, requestedClassGroupId) {
        calls.classGroups += 1;
        return requestedClassGroupId === classGroupId ? classGroupModel : null;
      },
    },
    academicRecords,
    snapshots: createLocalBulletinSnapshotRepositoryV1(),
    now: () => `2026-09-01T12:${String((calls.clock += 1)).padStart(2, '0')}:00.000Z`,
    createSnapshotId: () =>
      `snapshot:synthetic:${(snapshotSequence += 1)}` as BulletinSnapshotIdV1,
  });

  function studentRequest(
    identity: (typeof identities)[keyof typeof identities],
    model: BulletinEmissionRequestV1['model'],
    period: BulletinEmissionRequestV1['period'] = { kind: 'annual' },
  ): BulletinEmissionRequestV1 {
    return {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      academicYearId,
      period,
      target: { kind: 'student', classGroupId, ...identity },
      model,
      presentation: { locale: 'pt-BR', dateStyle: 'short' },
    };
  }

  return {
    service,
    calls,
    studentRequest,
    classRequest(model, period = { kind: 'annual' }) {
      return {
        ...studentRequest(identities.a, model, period),
        target: { kind: 'class-group', classGroupId },
      };
    },
    replaceTerm(identity, term, value) {
      const key = streamKey(termStream(identity, term));
      const current = records.get(key);
      records.set(
        key,
        academicRecord({ kind: 'term-result', value }, (current?.version ?? 0) + 1),
      );
    },
    replaceAnnual(identity, value) {
      const key = streamKey(annualStream(identity));
      const current = records.get(key);
      records.set(
        key,
        academicRecord({ kind: 'annual-result', value }, (current?.version ?? 0) + 1),
      );
    },
    replaceGrade(identity, term, value) {
      const key = streamKey(gradeStream(identity, term));
      const current = records.get(key);
      records.set(
        key,
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

describe('issue #316 bulletin emission hardening', () => {
  it('materializes a multi-student class batch with one shared class-group read', async () => {
    const fixture = createFixture();
    const result = await fixture.service.emitBatch(
      {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        items: [fixture.classRequest('synthetic', { kind: 'term', term: 1 })],
      } satisfies BulletinBatchEmissionRequestV1,
      { decision: 'allowed', issuerId },
    );

    expect(result.blocked).toEqual([]);
    expect(result.ready).toHaveLength(2);
    expect(result.ready.map(({ emission }) => emission.snapshot.model.student.id)).toEqual([
      studentAId,
      studentBId,
    ]);
    expect(fixture.calls.classGroups).toBe(1);
    expect(fixture.calls.classGroups).toBeLessThan(3); // Previous flow: 1 expansion + 2 reloads.
    expect(fixture.calls.academicRecords).toBe(2);
    result.ready.forEach(({ emission }) => expectEveryAuthorityImported(emission.snapshot.model));
  });

  it.each(['synthetic', 'composition', 'detailed'] as const)(
    'isolates ready and blocked students for the %s model',
    async (model) => {
      const fixture = createFixture({ includeStudentBRecords: false });
      const result = await fixture.service.emitBatch(
        {
          contractVersion: BULLETIN_CONTRACT_VERSION_V1,
          items: [fixture.classRequest(model)],
        },
        { decision: 'allowed', issuerId },
      );

      expect(result.ready).toHaveLength(1);
      expect(result.blocked).toHaveLength(1);
      expect(result.ready[0]?.emission.snapshot.model.student.id).toBe(studentAId);
      expect(result.ready[0]?.emission.snapshot.model.modelKind).toBe(model);
      if (result.ready[0] !== undefined) {
        expectEveryAuthorityImported(result.ready[0].emission.snapshot.model);
      }
      expect(result.blocked[0]?.emission).toMatchObject({
        status: 'blocked',
        reasons: [BULLETIN_MATERIALIZATION_REASONS_V1.officialResultNotFound],
      });
      expect(fixture.calls.classGroups).toBe(1);
    },
  );

  it('shares one class base and one identical academic materialization across repeated batch items', async () => {
    const fixture = createFixture();
    const request = fixture.studentRequest(identities.a, 'composition', {
      kind: 'term',
      term: 1,
    });
    const result = await fixture.service.emitBatch(
      { contractVersion: BULLETIN_CONTRACT_VERSION_V1, items: [request, request] },
      { decision: 'allowed', issuerId },
    );

    expect(result.ready).toHaveLength(2);
    expect(result.blocked).toEqual([]);
    expect(result.ready[1]?.emission.snapshot).toBe(result.ready[0]?.emission.snapshot);
    expect(fixture.calls.classGroups).toBe(1);
    expect(fixture.calls.academicRecords).toBe(1);
    expect(fixture.calls.clock).toBe(1);
  });

  it('preserves absence, non-applicability and imported/calculated sides without raw evidence', async () => {
    const fixture = createFixture();
    const result = await fixture.service.materialize(
      fixture.studentRequest(identities.a, 'detailed'),
      { decision: 'allowed' },
    );

    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.model.modelKind !== 'detailed') return;
    const first = result.model.subjects[0]?.terms[0]?.assessments[0];
    const second = result.model.subjects[0]?.terms[1]?.assessments[0];
    expect(first?.value).toEqual({
      imported: { state: 'absent' },
      calculated: { state: 'numeric', value: 8 },
    });
    expect(second).toMatchObject({
      applicability: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
      value: {
        imported: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
        calculated: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
      },
    });
    expect(JSON.stringify(result.model)).not.toContain('evidence');
    expectEveryAuthorityImported(result.model);
  });

  it('isolates insufficient official coverage without manufacturing a value', async () => {
    const fixture = createFixture();
    fixture.replaceTerm(
      identities.b,
      1,
      termResult(identities.b, 1, { coverage: insufficientCoverage }),
    );
    const result = await fixture.service.emitBatch(
      {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        items: [fixture.classRequest('composition', { kind: 'term', term: 1 })],
      },
      { decision: 'allowed', issuerId },
    );

    expect(result.ready).toHaveLength(1);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.emission).toEqual({
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      status: 'insufficient-data',
      coverage: insufficientCoverage,
      reasons: [BULLETIN_MATERIALIZATION_REASONS_V1.insufficientCoverage],
    });
  });

  it('reuses an identical artifact, versions a changed artifact and preserves historical bytes', async () => {
    const fixture = createFixture();
    const request = fixture.studentRequest(identities.a, 'synthetic', {
      kind: 'term',
      term: 1,
    });
    const first = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    const firstSerialized = JSON.stringify(first.snapshot);

    fixture.replaceTerm(identities.a, 1, termResult(identities.a, 1));
    const sameArtifact = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(sameArtifact.status).toBe('ready');
    if (sameArtifact.status !== 'ready') return;
    expect(sameArtifact.snapshot).toBe(first.snapshot);
    expect(sameArtifact.snapshot.snapshotVersion).toBe(1);

    fixture.replaceTerm(
      identities.a,
      1,
      termResult(identities.a, 1, { officialValue: 9 }),
    );
    const changed = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(changed.status).toBe('ready');
    if (changed.status !== 'ready') return;
    expect(changed.snapshot.snapshotId).toBe(first.snapshot.snapshotId);
    expect(changed.snapshot.snapshotVersion).toBe(2);
    expect(JSON.stringify(first.snapshot)).toBe(firstSerialized);
    expect(fixture.calls.clock).toBe(2);
    expectDeeplyFrozen(first.snapshot);
    expectDeeplyFrozen(changed.snapshot);
  });

  it('reprints only the requested historical version without any academic read', async () => {
    const fixture = createFixture();
    const request = fixture.studentRequest(identities.a, 'composition');
    const emission = await fixture.service.emit(request, { decision: 'allowed', issuerId });
    expect(emission.status).toBe('ready');
    if (emission.status !== 'ready') return;
    const before = { ...fixture.calls };

    fixture.replaceAnnual(identities.a, annualResult(identities.a, { value: 60 }));
    const reprint = await fixture.service.reprint(
      {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        snapshotId: emission.snapshot.snapshotId,
        snapshotVersion: emission.snapshot.snapshotVersion,
      },
      { decision: 'allowed' },
    );

    expect(reprint).toMatchObject({ status: 'ready', source: 'historical-snapshot' });
    if (reprint.status !== 'ready') return;
    expect(reprint.snapshot).toBe(emission.snapshot);
    expect(fixture.calls).toEqual(before);
  });

  it('resolves a concurrent identical emission conflict to one immutable version', async () => {
    const fixture = createFixture();
    const request = fixture.studentRequest(identities.a, 'synthetic', {
      kind: 'term',
      term: 1,
    });
    const [left, right] = await Promise.all([
      fixture.service.emit(request, { decision: 'allowed', issuerId }),
      fixture.service.emit(request, { decision: 'allowed', issuerId }),
    ]);

    expect(left.status).toBe('ready');
    expect(right.status).toBe('ready');
    if (left.status !== 'ready' || right.status !== 'ready') return;
    expect(right.snapshot).toBe(left.snapshot);
    expect(left.snapshot.snapshotVersion).toBe(1);
    expectDeeplyFrozen(left.snapshot);
  });

  it.each([
    {
      level: 'synthetic term',
      request: (fixture: SyntheticFixture) =>
        fixture.studentRequest(identities.a, 'synthetic', { kind: 'term', term: 1 }),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceTerm(
          identities.a,
          1,
          termResult(identities.a, 1, { authorityMode: 'native-engine' }),
        ),
    },
    {
      level: 'composition term',
      request: (fixture: SyntheticFixture) =>
        fixture.studentRequest(identities.a, 'composition', { kind: 'term', term: 1 }),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceTerm(
          identities.a,
          1,
          termResult(identities.a, 1, { authorityMode: 'native-engine' }),
        ),
    },
    {
      level: 'annual result',
      request: (fixture: SyntheticFixture) =>
        fixture.studentRequest(identities.a, 'synthetic'),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceAnnual(
          identities.a,
          annualResult(identities.a, { authorityMode: 'native-engine' }),
        ),
    },
    {
      level: 'assessment entry',
      request: (fixture: SyntheticFixture) =>
        fixture.studentRequest(identities.a, 'detailed', { kind: 'term', term: 1 }),
      inject: (fixture: SyntheticFixture) =>
        fixture.replaceGrade(identities.a, 1, gradeEntry(identities.a, 1, 'native-engine')),
    },
  ])('rejects native-engine at the $level level', async ({ request, inject }) => {
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

  it('owns deeply immutable local copies and rejects a concurrent stale append', async () => {
    const fixture = createFixture();
    const request = fixture.studentRequest(identities.a, 'synthetic', {
      kind: 'term',
      term: 1,
    });
    const materialization = await fixture.service.materialize(request, { decision: 'allowed' });
    expect(materialization.status).toBe('ready');
    if (materialization.status !== 'ready') return;

    const repository = createLocalBulletinSnapshotRepositoryV1();
    const seriesKey = 'series:synthetic:a' as BulletinSnapshotSeriesKeyV1;
    const candidate: BulletinSnapshotV1 = {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      snapshotId: 'snapshot:local:1' as BulletinSnapshotIdV1,
      snapshotVersion: 1,
      modelVersion: BULLETIN_MODEL_VERSION_V1,
      dataVersion: materialization.dataVersion,
      emittedAt: '2026-09-01T13:00:00.000Z',
      issuerId,
      presentation: { locale: 'pt-BR', dateStyle: 'short' },
      model: materialization.model,
    };
    expect(isBulletinSnapshotCoherentV1(candidate)).toBe(true);

    const appended = await repository.append(seriesKey, candidate, 0);
    expect(appended.status).toBe('appended');
    if (appended.status !== 'appended') return;
    expect(appended.snapshot).not.toBe(candidate);
    expect(Object.isFrozen(candidate)).toBe(false);
    expectDeeplyFrozen(appended.snapshot);

    (candidate.model.student as { displayName: string }).displayName = 'Mutação externa';
    expect(appended.snapshot.model.student.displayName).toBe('Aluno Sintético A');
    expect(await repository.getHistorical(candidate.snapshotId, 1)).toBe(appended.snapshot);

    const racingRepository = createLocalBulletinSnapshotRepositoryV1();
    const competing: BulletinSnapshotV1 = {
      ...candidate,
      snapshotId: 'snapshot:local:2' as BulletinSnapshotIdV1,
      model: appended.snapshot.model,
    };
    const race = await Promise.all([
      racingRepository.append(seriesKey, appended.snapshot, 0),
      racingRepository.append(seriesKey, competing, 0),
    ]);
    expect(race.map(({ status }) => status).sort()).toEqual(['appended', 'version-conflict']);
  });
});
