import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceRequestV1,
  type PerformanceLensV1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import type {
  AcademicGradeValueV1,
  AnnualResultV1,
  AssessmentComponentId,
  ComparedGradeValueV1,
  FinalRecoveryV1,
  GradeEntryV1,
  ResultCoverageV1,
  TermResultV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  ClassPerformanceReadModelErrorV1,
  createClassPerformanceReadModelV1,
} from '../../../server/gradebook/application/read-models/performance/class-performance-read-model-v1';
import { createGradebookD1ClassPerformanceSourceV1 } from '../../../server/gradebook/persistence/d1/performance/d1-class-performance-source-v1';
import type { D1ReadDatabaseV1 } from '../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import {
  SqliteD1Database,
  openMigratedDatabase,
} from '../persistence/d1-transaction/d1-write-test-support';

const year = 'academic-year:performance:2026' as AcademicYearId;
const otherYear = 'academic-year:performance:2027' as AcademicYearId;
const classGroup = 'class-group:performance:7a' as ClassGroupId;
const otherClass = 'class-group:performance:7a:2027' as ClassGroupId;
const teacher = 'teacher:performance:one' as TeacherId;
const students = [
  'student:performance:ana',
  'student:performance:bia',
] as unknown as readonly StudentId[];
const enrollments = [
  'enrollment:performance:ana',
  'enrollment:performance:bia',
] as unknown as readonly EnrollmentId[];
const subjects = [
  'subject:performance:mat',
  'subject:performance:por',
] as unknown as readonly SubjectId[];
const assignments = [
  'assignment:performance:mat',
  'assignment:performance:por',
] as unknown as readonly TeachingAssignmentId[];
const components = [
  'component:performance:mat',
  'component:performance:por',
] as unknown as readonly AssessmentComponentId[];
const instant = '2026-09-01T10:00:00.000Z';

function coverage(state: ResultCoverageV1['state']): ResultCoverageV1 {
  if (state === 'complete')
    return { state, expectedItemCount: 2, resolvedItemCount: 2, missingItemCount: 0, reasons: [] };
  if (state === 'partial')
    return {
      state,
      expectedItemCount: 2,
      resolvedItemCount: 1,
      missingItemCount: 1,
      reasons: ['synthetic-partial'],
    };
  if (state === 'insufficient-data')
    return {
      state,
      expectedItemCount: 2,
      resolvedItemCount: 0,
      missingItemCount: 2,
      reasons: ['synthetic-insufficient'],
    };
  return {
    state,
    expectedItemCount: 0,
    resolvedItemCount: 0,
    missingItemCount: 0,
    reasons: ['synthetic-not-applicable'],
  };
}

function grade(
  imported: AcademicGradeValueV1,
  calculated: AcademicGradeValueV1 = imported,
): ComparedGradeValueV1 {
  return {
    imported: { value: imported, evidence: [{}] },
    calculated: { value: calculated },
  } as unknown as ComparedGradeValueV1;
}

function numeric(value: number, calculated = value + 0.25): ComparedGradeValueV1 {
  return grade({ state: 'numeric', value }, { state: 'numeric', value: calculated });
}

function insertYear(database: SqliteD1Database, id: AcademicYearId, numericYear: number): void {
  database.raw
    .prepare(
      `INSERT INTO academic_years (academic_year_id, school_id, year, current_version, created_at) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(id, `school:performance:${numericYear}`, numericYear, instant);
}

interface EntitySeed {
  readonly kind: string;
  readonly value: Record<string, unknown>;
  readonly teacherId?: string;
  readonly classGroupId?: string;
  readonly subjectId?: string;
  readonly studentId?: string;
  readonly enrollmentId?: string;
  readonly teachingAssignmentId?: string;
  readonly term?: number;
  readonly displayCode?: string;
  readonly lifecycleState?: string;
}

function insertEntity(
  database: SqliteD1Database,
  academicYearId: AcademicYearId,
  seed: EntitySeed,
): void {
  const id = String(seed.value.id);
  database.raw
    .prepare(
      `INSERT INTO academic_entity_streams (academic_year_id, entity_kind, entity_id, current_version, created_at) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(academicYearId, seed.kind, id, instant);
  database.raw
    .prepare(
      `INSERT INTO academic_entity_versions (
    academic_year_id, entity_kind, entity_id, version, previous_version,
    teacher_ref_kind, teacher_id, class_group_ref_kind, class_group_id,
    subject_ref_kind, subject_id, student_ref_kind, student_id,
    enrollment_ref_kind, enrollment_id, teaching_assignment_ref_kind, teaching_assignment_id,
    term, display_code, lifecycle_state, payload_json, recorded_at
  ) VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      academicYearId,
      seed.kind,
      id,
      seed.teacherId ? 'teacher' : null,
      seed.teacherId ?? null,
      seed.classGroupId ? 'class-group' : null,
      seed.classGroupId ?? null,
      seed.subjectId ? 'subject' : null,
      seed.subjectId ?? null,
      seed.studentId ? 'student' : null,
      seed.studentId ?? null,
      seed.enrollmentId ? 'enrollment' : null,
      seed.enrollmentId ?? null,
      seed.teachingAssignmentId ? 'teaching-assignment' : null,
      seed.teachingAssignmentId ?? null,
      seed.term ?? null,
      seed.displayCode ?? null,
      seed.lifecycleState ?? null,
      JSON.stringify({ kind: seed.kind, value: seed.value }),
      instant,
    );
}

function insertRecord(
  database: SqliteD1Database,
  academicYearId: AcademicYearId,
  kind: string,
  value: Record<string, unknown>,
  options: { assignmentId?: string; componentId?: string; term?: number; authority?: string } = {},
): void {
  const key = `stream:${academicYearId}:${kind}:${String(value.id)}`;
  database.raw
    .prepare(
      `INSERT INTO academic_record_streams (
    academic_year_id, record_kind, stream_key, current_version, student_id, enrollment_id,
    assessment_component_ref_kind, assessment_component_id,
    teaching_assignment_ref_kind, teaching_assignment_id, term, created_at
  ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      academicYearId,
      kind,
      key,
      String(value.studentId),
      String(value.enrollmentId),
      options.componentId ? 'assessment-component' : null,
      options.componentId ?? null,
      options.assignmentId ? 'teaching-assignment' : null,
      options.assignmentId ?? null,
      options.term ?? null,
      instant,
    );
  database.raw
    .prepare(
      `INSERT INTO academic_record_versions (
    academic_year_id, record_kind, stream_key, version, previous_version, record_id,
    authority_mode, rule_version, payload_json, recorded_at
  ) VALUES (?, ?, ?, 1, NULL, ?, ?, 'synthetic-rule-v1', ?, ?)`,
    )
    .run(
      academicYearId,
      kind,
      key,
      String(value.id),
      options.authority ?? 'imported-source',
      JSON.stringify({
        kind,
        value: { ...value, authorityMode: options.authority ?? 'imported-source' },
      }),
      instant,
    );
}

function termResult(
  studentIndex: number,
  assignmentIndex: number,
  term: 1 | 2 | 3,
  state: ResultCoverageV1['state'],
): TermResultV1 {
  const value = 10 + studentIndex * 2 + assignmentIndex + term;
  return {
    id: `term-result:${studentIndex}:${assignmentIndex}:${term}` as TermResultV1['id'],
    academicYearId: year,
    studentId: students[studentIndex]!,
    enrollmentId: enrollments[studentIndex]!,
    teachingAssignmentId: assignments[assignmentIndex]!,
    term,
    maximum: 30,
    quantitative: {
      original: numeric(value),
      parallelRecovery: grade({ state: 'not-applicable', reason: 'synthetic' }),
      parallelRecoveryApplicability: {
        imported: { value: { state: 'not-applicable', reason: 'synthetic' }, evidence: [{}] },
        calculated: { state: 'not-applicable', reason: 'synthetic' },
      } as unknown as TermResultV1['quantitative']['parallelRecoveryApplicability'],
      considered: numeric(value + 1),
    },
    qualitativeOperational: numeric(value + 2),
    officialGrade: numeric(value + 3),
    percentage: numeric(60 + value),
    authorityMode: 'imported-source',
    coverage: coverage(state),
    ruleVersion: 'synthetic-rule-v1',
  };
}

async function fixture(): Promise<SqliteD1Database> {
  const database = await openMigratedDatabase();
  insertYear(database, year, 2026);
  insertYear(database, otherYear, 2027);
  insertEntity(database, year, {
    kind: 'teacher',
    value: { id: teacher, displayName: 'Docente Sintético', sourceNames: [], status: 'active' },
    lifecycleState: 'active',
  });
  insertEntity(database, year, {
    kind: 'class-group',
    value: { id: classGroup, academicYearId: year, code: '7A', grade: '7', section: 'A' },
    displayCode: '7A',
  });
  subjects.forEach((id, index) =>
    insertEntity(database, year, {
      kind: 'subject',
      value: {
        id,
        code: index ? 'POR' : 'MAT',
        displayName: index ? 'Português Sintético' : 'Matemática Sintética',
        shortName: index ? 'POR' : 'MAT',
        status: 'active',
      },
      displayCode: index ? 'POR' : 'MAT',
      lifecycleState: 'active',
    }),
  );
  students.forEach((id, index) =>
    insertEntity(database, year, {
      kind: 'student',
      value: { id, displayName: index ? 'Bia Sintética' : 'Ana Sintética', sourceNames: [] },
    }),
  );
  assignments.forEach((id, index) =>
    insertEntity(database, year, {
      kind: 'teaching-assignment',
      value: {
        id,
        academicYearId: year,
        teacherId: teacher,
        classGroupId: classGroup,
        subjectId: subjects[index],
        effectivePeriod: {},
        confirmationOrigin: 'imported-source',
      },
      teacherId: teacher,
      classGroupId: classGroup,
      subjectId: subjects[index],
    }),
  );
  enrollments.forEach((id, index) =>
    insertEntity(database, year, {
      kind: 'enrollment',
      value: {
        id,
        academicYearId: year,
        studentId: students[index],
        classGroupId: classGroup,
        effectivePeriod: {},
        position: 'current',
        sourcePosition: 2 - index,
      },
      studentId: students[index],
      classGroupId: classGroup,
    }),
  );
  insertEntity(database, year, {
    kind: 'student-status-event',
    value: {
      id: 'status:ana:active',
      academicYearId: year,
      enrollmentId: enrollments[0],
      status: 'active',
      sourceText: 'ATIVO',
      occurredOn: '2026-02-01',
    },
    enrollmentId: enrollments[0],
    lifecycleState: 'active',
  });
  components.forEach((id, index) =>
    insertEntity(database, year, {
      kind: 'assessment-component',
      value: {
        id,
        academicYearId: year,
        teachingAssignmentId: assignments[index],
        term: 1,
        type: index ? 'qualitative-activity' : 'quantitative-assessment',
        name: index ? 'Pesquisa sobre frações' : 'Avaliação quantitativa 1',
        maximum: index ? 3 : 8,
        order: index ? 3 : 1,
        applicability: { state: 'applicable' },
      },
      teachingAssignmentId: assignments[index],
      term: 1,
    }),
  );
  const states = ['complete', 'partial', 'insufficient-data', 'not-applicable'] as const;
  for (let studentIndex = 0; studentIndex < 2; studentIndex += 1) {
    for (let assignmentIndex = 0; assignmentIndex < 2; assignmentIndex += 1) {
      const current = termResult(
        studentIndex,
        assignmentIndex,
        1,
        states[studentIndex * 2 + assignmentIndex]!,
      );
      const reference = termResult(studentIndex, assignmentIndex, 2, 'complete');
      insertRecord(database, year, 'term-result', current as unknown as Record<string, unknown>, {
        assignmentId: assignments[assignmentIndex],
        term: 1,
      });
      if (!(studentIndex === 1 && assignmentIndex === 1))
        insertRecord(
          database,
          year,
          'term-result',
          reference as unknown as Record<string, unknown>,
          { assignmentId: assignments[assignmentIndex], term: 2 },
        );
    }
  }
  const entry: GradeEntryV1 = {
    id: 'grade-entry:ana:mat' as GradeEntryV1['id'],
    academicYearId: year,
    studentId: students[0]!,
    enrollmentId: enrollments[0]!,
    assessmentComponentId: components[0]!,
    value: numeric(8),
    authorityMode: 'imported-source',
    ruleVersion: 'synthetic-rule-v1',
    version: 1,
  };
  insertRecord(database, year, 'grade-entry', entry as unknown as Record<string, unknown>, {
    componentId: components[0],
  });
  const annual: AnnualResultV1 = {
    id: 'annual:ana:mat' as AnnualResultV1['id'],
    academicYearId: year,
    studentId: students[0]!,
    enrollmentId: enrollments[0]!,
    teachingAssignmentId: assignments[0]!,
    originalTotal: numeric(70),
    postRecoveryTotal: numeric(75),
    academicState: { imported: 'approved-direct', calculated: 'approved-after-recovery' },
    finalDecision: { status: 'pending' },
    authorityMode: 'imported-source',
    coverage: coverage('complete'),
    ruleVersion: 'synthetic-rule-v1',
  };
  insertRecord(database, year, 'annual-result', annual as unknown as Record<string, unknown>, {
    assignmentId: assignments[0],
  });
  const recovery: FinalRecoveryV1 = {
    id: 'final-recovery:ana:mat:1' as FinalRecoveryV1['id'],
    academicYearId: year,
    studentId: students[0]!,
    enrollmentId: enrollments[0]!,
    teachingAssignmentId: assignments[0]!,
    recoveredTerm: 1,
    originalTermGrade: numeric(18),
    applicability: {
      imported: { value: { state: 'applicable' }, evidence: [{}] },
      calculated: { state: 'applicable' },
    } as unknown as FinalRecoveryV1['applicability'],
    recoveryGrade: numeric(22),
    replacementTermGrade: numeric(22),
    authorityMode: 'imported-source',
    coverage: coverage('partial'),
    ruleVersion: 'synthetic-rule-v1',
  };
  insertRecord(database, year, 'final-recovery', recovery as unknown as Record<string, unknown>, {
    assignmentId: assignments[0],
    term: 1,
  });
  insertEntity(database, otherYear, {
    kind: 'class-group',
    value: { id: otherClass, academicYearId: otherYear, code: '7A', grade: '7', section: 'A' },
    displayCode: '7A',
  });
  return database;
}

function request(
  lens: PerformanceLensV1,
  overrides: Partial<ClassPerformanceRequestV1> = {},
): ClassPerformanceRequestV1 {
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId: year,
    classGroupId: classGroup,
    period: { kind: 'term', term: 1 },
    mode: 'regular',
    lens,
    comparisonPeriod: { kind: 'term', term: 2 },
    rows: { limit: 100, cursor: null },
    columns: { limit: 100, cursor: null },
    order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
    ...overrides,
  };
}

class CountingDatabase implements D1ReadDatabaseV1 {
  count = 0;
  constructor(private readonly inner: D1ReadDatabaseV1) {}
  prepare(query: string) {
    this.count += 1;
    return this.inner.prepare(query);
  }
}

describe('fonte D1 em lote de Desempenho V1', () => {
  it.each(['result', 'quantitative', 'qualitative', 'assessments'] as const)(
    'materializa múltiplas linhas/colunas e a lente %s preservando os lados oficiais',
    async (lens) => {
      const provider = createClassPerformanceReadModelV1(
        createGradebookD1ClassPerformanceSourceV1(await fixture()),
      );
      const model = await provider.get(request(lens));
      expect(model?.rows.items).toHaveLength(2);
      expect(model?.columns.items.map((item) => item.code)).toEqual(['MAT', 'POR']);
      expect(model?.rows.items.map((item) => item.displayName)).toEqual([
        'Bia Sintética',
        'Ana Sintética',
      ]);
      expect(model?.rows.items[0]?.situation).toEqual({ state: 'absent' });
      expect(model?.rows.items[1]?.situation).toEqual({ state: 'known', value: 'active' });
      expect(
        model?.rows.items
          .flatMap((row) => row.cells)
          .every((cell) => cell.authorityMode === 'imported-source' && cell.lens === lens),
      ).toBe(true);
      if (lens === 'result') {
        const cells = model!.rows.items.flatMap((row) => row.cells);
        expect(new Set(cells.map((cell) => cell.coverage.state))).toEqual(
          new Set(['complete', 'partial', 'insufficient-data', 'not-applicable']),
        );
        expect(
          cells.every(
            (cell) =>
              cell.comparison?.state === 'not-comparable' &&
              cell.comparison.reason === 'comparison-semantics-not-integrated',
          ),
        ).toBe(true);
        expect(JSON.stringify(cells.map((cell) => cell.comparison))).not.toMatch(
          /"basis"|"current"|"reference"/u,
        );
        const projection = cells[0]!.projection;
        expect(projection).toHaveProperty('officialGrade.imported');
        expect(projection).toHaveProperty('officialGrade.calculated');
      }
      if (lens === 'assessments') {
        const assessmentItems = model!.rows.items
          .flatMap((row) => row.cells)
          .flatMap((cell) => (cell.lens === 'assessments' ? cell.projection.items : []));
        expect(assessmentItems).toContainEqual(
          expect.objectContaining({
            assessmentComponentId: components[0],
            name: 'Avaliação quantitativa 1',
            type: 'quantitative-assessment',
            order: 1,
            maximum: 8,
            applicability: { state: 'applicable' },
          }),
        );
        const values = model!.rows.items
          .flatMap((row) => row.cells)
          .flatMap((cell) =>
            cell.lens === 'assessments' ? cell.projection.items.map((item) => item.value) : [],
          );
        expect(values).toContainEqual({
          imported: { state: 'numeric', value: 8 },
          calculated: { state: 'numeric', value: 8.25 },
        });
      }
    },
  );

  it('preserva anual, ausência sem zero e isolamento de ano', async () => {
    const provider = createClassPerformanceReadModelV1(
      createGradebookD1ClassPerformanceSourceV1(await fixture()),
    );
    const annual = await provider.get(
      request('result', { period: { kind: 'annual' }, comparisonPeriod: null }),
    );
    const ana = annual?.rows.items.find((row) => row.studentId === students[0]);
    const bia = annual?.rows.items.find((row) => row.studentId === students[1]);
    expect(ana?.cells[0]?.projection).toMatchObject({
      source: 'annual-result',
      academicState: { imported: 'approved-direct', calculated: 'approved-after-recovery' },
    });
    expect(bia?.cells[0]?.projection).toMatchObject({
      originalTotal: { imported: { state: 'absent' }, calculated: { state: 'absent' } },
    });
    await expect(
      provider.get(request('result', { academicYearId: otherYear, classGroupId: classGroup })),
    ).resolves.toBeNull();
  });

  it.each(['quantitative', 'qualitative', 'assessments'] as const)(
    'mantém annual + %s como projeção oficial insuficiente sem fabricar não aplicabilidade ou agregado',
    async (lens) => {
      const provider = createClassPerformanceReadModelV1(
        createGradebookD1ClassPerformanceSourceV1(await fixture()),
      );
      const model = await provider.get(
        request(lens, { period: { kind: 'annual' }, comparisonPeriod: null }),
      );
      const cells = model!.rows.items.flatMap((row) => row.cells);
      expect(model?.coverage.state).toBe('insufficient-data');
      expect(
        cells.every(
          (cell) =>
            cell.coverage.state === 'insufficient-data' &&
            cell.coverage.reasons.includes('official-projection-unavailable'),
        ),
      ).toBe(true);
      expect(JSON.stringify(cells)).not.toContain('not-applicable');
      expect(JSON.stringify(cells)).not.toMatch(/"state":"numeric"|official-zero|legacy-zero/u);
      if (lens === 'assessments') {
        expect(
          cells.every((cell) => cell.lens === 'assessments' && cell.projection.items.length === 0),
        ).toBe(true);
      }
    },
  );

  it('mantém comparison null sem período de referência e fail-closed com referência', async () => {
    const source = createGradebookD1ClassPerformanceSourceV1(await fixture());
    const withoutReference = await source.loadMatrix({
      contractVersion: 1,
      academicYearId: year,
      classGroupId: classGroup,
      period: { kind: 'term', term: 1 },
      mode: 'regular',
      lens: 'result',
      comparisonPeriod: null,
    });
    expect(
      withoutReference?.rows.flatMap((row) => row.cells).every((cell) => cell.comparison === null),
    ).toBe(true);

    for (const lens of ['result', 'quantitative', 'qualitative', 'assessments'] as const) {
      const withReference = await source.loadMatrix({
        contractVersion: 1,
        academicYearId: year,
        classGroupId: classGroup,
        period: { kind: 'term', term: 1 },
        mode: 'regular',
        lens,
        comparisonPeriod: { kind: 'term', term: 2 },
      });
      const comparisons = withReference!.rows
        .flatMap((row) => row.cells)
        .map((cell) => cell.comparison);
      expect(
        comparisons.every(
          (comparison) =>
            comparison?.state === 'not-comparable' &&
            comparison.reason === 'comparison-semantics-not-integrated',
        ),
      ).toBe(true);
      expect(JSON.stringify(comparisons)).not.toMatch(/"basis"|"current"|"reference"/u);
    }
  });

  it('seleciona a recuperação oficial trimestral sem recalcular valores', async () => {
    const provider = createClassPerformanceReadModelV1(
      createGradebookD1ClassPerformanceSourceV1(await fixture()),
    );
    const model = await provider.get(
      request('result', { mode: 'recovery', comparisonPeriod: null }),
    );
    const ana = model?.rows.items.find((row) => row.studentId === students[0]);
    expect(ana?.cells[0]?.projection).toMatchObject({
      source: 'final-recovery',
      originalTermGrade: {
        imported: { state: 'numeric', value: 18 },
        calculated: { state: 'numeric', value: 18.25 },
      },
      replacementTermGrade: {
        imported: { state: 'numeric', value: 22 },
        calculated: { state: 'numeric', value: 22.25 },
      },
    });
    expect(ana?.cells[0]?.coverage.state).toBe('partial');
  });

  it.each(['quantitative', 'qualitative', 'assessments'] as const)(
    'mantém recovery + %s na projeção e cobertura do TermResultV1',
    async (lens) => {
      const provider = createClassPerformanceReadModelV1(
        createGradebookD1ClassPerformanceSourceV1(await fixture()),
      );
      const model = await provider.get(request(lens, { mode: 'recovery', comparisonPeriod: null }));
      const ana = model!.rows.items.find((row) => row.studentId === students[0])!;
      const mathematics = ana.cells.find((cell) => cell.teachingAssignmentId === assignments[0])!;
      expect(mathematics.coverage.state).toBe('complete');
      expect(mathematics.signals.some((signal) => signal.code === 'coverage-partial')).toBe(false);
      if (mathematics.lens === 'quantitative') {
        expect(mathematics.projection.original.imported).toEqual({ state: 'numeric', value: 11 });
      } else if (mathematics.lens === 'qualitative') {
        expect(mathematics.projection.operational.imported).toEqual({
          state: 'numeric',
          value: 13,
        });
      } else if (mathematics.lens === 'assessments') {
        expect(mathematics.projection.items[0]?.value.imported).toEqual({
          state: 'numeric',
          value: 8,
        });
      } else {
        throw new Error('unexpected synthetic result lens');
      }
    },
  );

  it('carrega detalhes separadamente com registros oficiais e sem evidência na matriz', async () => {
    const provider = createClassPerformanceReadModelV1(
      createGradebookD1ClassPerformanceSourceV1(await fixture()),
    );
    const model = await provider.get(request('assessments'));
    const row = model!.rows.items.find((item) => item.studentId === students[0])!;
    const studentDetail = await provider.getStudentDetail(row.detailRef);
    const cellDetail = await provider.getCellDetail(row.cells[0]!.detailRef);
    expect(studentDetail).toMatchObject({
      enrollment: { id: enrollments[0] },
      statusHistory: [{ status: 'active' }],
    });
    expect(cellDetail?.officialRecords.some((item) => item.kind === 'grade-entry')).toBe(true);
    expect(cellDetail?.cell.projection).toEqual(row.cells[0]!.projection);
    expect(JSON.stringify(row.cells)).not.toContain('evidence');
  });

  it('mantém seis queries para a matriz independentemente de aluno × componente', async () => {
    const small = new CountingDatabase(await fixture());
    const source = createGradebookD1ClassPerformanceSourceV1(small);
    await source.loadMatrix({
      contractVersion: 1,
      academicYearId: year,
      classGroupId: classGroup,
      period: { kind: 'term', term: 1 },
      mode: 'regular',
      lens: 'result',
      comparisonPeriod: null,
    });
    expect(small.count).toBe(6);
    const large = new CountingDatabase(await fixture());
    await createGradebookD1ClassPerformanceSourceV1(large).loadMatrix({
      contractVersion: 1,
      academicYearId: year,
      classGroupId: classGroup,
      period: { kind: 'term', term: 1 },
      mode: 'regular',
      lens: 'assessments',
      comparisonPeriod: { kind: 'term', term: 2 },
    });
    expect(large.count).toBe(6);
  });

  it('rejeita native-engine e sanitiza falha física na fronteira provider-independent', async () => {
    const database = await fixture();
    database.raw
      .prepare(
        `UPDATE academic_record_versions SET authority_mode='native-engine', payload_json=json_set(payload_json, '$.value.authorityMode', 'native-engine') WHERE record_kind='annual-result'`,
      )
      .run();
    const provider = createClassPerformanceReadModelV1(
      createGradebookD1ClassPerformanceSourceV1(database),
    );
    await expect(provider.get(request('result'))).rejects.toMatchObject({
      code: 'source-failure',
      message: 'A fonte do read model de Desempenho não pôde ser consultada.',
    });
    const physicalFailure: D1ReadDatabaseV1 = {
      prepare: () => {
        throw new Error('sensitive physical details');
      },
    };
    await expect(
      createClassPerformanceReadModelV1(
        createGradebookD1ClassPerformanceSourceV1(physicalFailure),
      ).get(request('result')),
    ).rejects.toEqual(new ClassPerformanceReadModelErrorV1('source-failure'));
  });
});
