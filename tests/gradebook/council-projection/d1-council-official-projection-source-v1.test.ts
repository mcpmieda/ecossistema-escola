import { describe, expect, it } from 'vitest';
import type { CouncilClassReferenceV1 } from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
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
  AnnualResultV1,
  ComparedGradeValueV1,
  FinalRecoveryV1,
  ResultCoverageV1,
  TermResultV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import { CouncilWorkspaceSourceErrorV1 } from '../../../server/gradebook/application/council/council-workspace-source-v1';
import { createGradebookD1CouncilOfficialProjectionSourceV1 } from '../../../server/gradebook/persistence/d1/council/d1-council-official-projection-source-v1';
import type { D1ReadDatabaseV1 } from '../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import {
  SqliteD1Database,
  openMigratedDatabase,
} from '../persistence/d1-transaction/d1-write-test-support';

const year = 'academic-year:council-d1:2026' as AcademicYearId;
const otherYear = 'academic-year:council-d1:2027' as AcademicYearId;
const classGroup = 'class-group:council-d1:9a' as ClassGroupId;
const otherClass = 'class-group:council-d1:9a:2027' as ClassGroupId;
const instant = '2026-09-01T20:00:00.000Z';

function coverage(): ResultCoverageV1 {
  return {
    state: 'complete',
    expectedItemCount: 1,
    resolvedItemCount: 1,
    missingItemCount: 0,
    reasons: [],
  };
}

function grade(imported: number, calculated = imported + 20): ComparedGradeValueV1 {
  return {
    imported: {
      value: { state: 'numeric', value: imported },
      evidence: [{ sheetName: 'RAW', cellAddress: 'A1' }],
    },
    calculated: { value: { state: 'numeric', value: calculated } },
  } as unknown as ComparedGradeValueV1;
}

function insertYear(database: SqliteD1Database, id: AcademicYearId, value: number): void {
  database.raw
    .prepare(
      `INSERT INTO academic_years
         (academic_year_id, school_id, year, current_version, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .run(id, `school:council-d1:${value}`, value, instant);
}

interface EntitySeed {
  readonly kind: string;
  readonly value: Record<string, unknown>;
  readonly teacherId?: string;
  readonly classGroupId?: string;
  readonly subjectId?: string;
  readonly studentId?: string;
}

function insertEntity(
  database: SqliteD1Database,
  academicYearId: AcademicYearId,
  seed: EntitySeed,
): void {
  const id = String(seed.value.id);
  database.raw
    .prepare(
      `INSERT INTO academic_entity_streams
         (academic_year_id, entity_kind, entity_id, current_version, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .run(academicYearId, seed.kind, id, instant);
  database.raw
    .prepare(
      `INSERT INTO academic_entity_versions (
         academic_year_id, entity_kind, entity_id, version, previous_version,
         teacher_ref_kind, teacher_id, class_group_ref_kind, class_group_id,
         subject_ref_kind, subject_id, student_ref_kind, student_id,
         enrollment_ref_kind, enrollment_id,
         teaching_assignment_ref_kind, teaching_assignment_id,
         term, display_code, lifecycle_state, payload_json, recorded_at
       ) VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL,
                 NULL, NULL, NULL, ?, ?)`,
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
      JSON.stringify({ kind: seed.kind, value: seed.value }),
      instant,
    );
}

function insertRecord(
  database: SqliteD1Database,
  academicYearId: AcademicYearId,
  kind: 'term-result' | 'final-recovery' | 'annual-result',
  value: TermResultV1 | FinalRecoveryV1 | AnnualResultV1,
): void {
  const streamKey = `stream:${academicYearId}:${kind}:${value.id}`;
  const term =
    kind === 'term-result'
      ? (value as TermResultV1).term
      : kind === 'final-recovery'
        ? (value as FinalRecoveryV1).recoveredTerm
        : null;
  database.raw
    .prepare(
      `INSERT INTO academic_record_streams (
         academic_year_id, record_kind, stream_key, current_version,
         student_id, enrollment_id,
         assessment_component_ref_kind, assessment_component_id,
         teaching_assignment_ref_kind, teaching_assignment_id, term, created_at
       ) VALUES (?, ?, ?, 1, ?, ?, NULL, NULL, 'teaching-assignment', ?, ?, ?)`,
    )
    .run(
      academicYearId,
      kind,
      streamKey,
      value.studentId,
      value.enrollmentId,
      value.teachingAssignmentId,
      term,
      instant,
    );
  database.raw
    .prepare(
      `INSERT INTO academic_record_versions (
         academic_year_id, record_kind, stream_key, version, previous_version,
         record_id, authority_mode, rule_version, payload_json, recorded_at
       ) VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(
      academicYearId,
      kind,
      streamKey,
      value.id,
      value.authorityMode,
      value.ruleVersion,
      JSON.stringify({ kind, value }),
      instant,
    );
}

interface SeededClass {
  readonly assignments: readonly TeachingAssignmentId[];
  readonly students: readonly StudentId[];
  readonly enrollments: readonly EnrollmentId[];
}

function seedClass(
  database: SqliteD1Database,
  academicYearId: AcademicYearId,
  seededClassGroup: ClassGroupId,
  prefix: string,
  studentCount: number,
  assignmentCount: number,
): SeededClass {
  const teacher = `teacher:${prefix}` as TeacherId;
  insertEntity(database, academicYearId, {
    kind: 'teacher',
    value: {
      id: teacher,
      displayName: `Docente Sintético ${prefix}`,
      sourceNames: [],
      status: 'active',
    },
  });
  insertEntity(database, academicYearId, {
    kind: 'class-group',
    value: {
      id: seededClassGroup,
      academicYearId,
      code: prefix,
      grade: '9',
      section: 'A',
    },
  });
  const subjectIds = Array.from(
    { length: assignmentCount },
    (_value, index) => `subject:${prefix}:${index}` as SubjectId,
  );
  const assignmentIds = Array.from(
    { length: assignmentCount },
    (_value, index) => `assignment:${prefix}:${index}` as TeachingAssignmentId,
  );
  subjectIds.forEach((subjectId, index) =>
    insertEntity(database, academicYearId, {
      kind: 'subject',
      value: {
        id: subjectId,
        code: `C${index}`,
        displayName: `Componente D1 ${index}`,
        shortName: `C${index}`,
        status: 'active',
      },
    }),
  );
  assignmentIds.forEach((assignmentId, index) =>
    insertEntity(database, academicYearId, {
      kind: 'teaching-assignment',
      value: {
        id: assignmentId,
        academicYearId,
        teacherId: teacher,
        classGroupId: seededClassGroup,
        subjectId: subjectIds[index],
        effectivePeriod: {},
        confirmationOrigin: 'imported-source',
      },
      teacherId: teacher,
      classGroupId: seededClassGroup,
      subjectId: subjectIds[index],
    }),
  );
  const studentIds = Array.from(
    { length: studentCount },
    (_value, index) => `student:${prefix}:${index}` as StudentId,
  );
  const enrollmentIds = Array.from(
    { length: studentCount },
    (_value, index) => `enrollment:${prefix}:${index}` as EnrollmentId,
  );
  studentIds.forEach((studentId, index) => {
    insertEntity(database, academicYearId, {
      kind: 'student',
      value: {
        id: studentId,
        displayName: `Estudante D1 ${prefix} ${index}`,
        sourceNames: [],
      },
    });
    insertEntity(database, academicYearId, {
      kind: 'enrollment',
      value: {
        id: enrollmentIds[index],
        academicYearId,
        studentId,
        classGroupId: seededClassGroup,
        effectivePeriod: {},
        position: 'current',
        sourcePosition: index + 1,
      },
      studentId,
      classGroupId: seededClassGroup,
    });
  });

  studentIds.forEach((studentId, studentIndex) => {
    assignmentIds.forEach((assignmentId, assignmentIndex) => {
      ([1, 2, 3] as const).forEach((term) => {
        const value = 10 + studentIndex + assignmentIndex + term;
        const result: TermResultV1 = {
          id: `term:${prefix}:${studentIndex}:${assignmentIndex}:${term}` as TermResultV1['id'],
          academicYearId,
          studentId,
          enrollmentId: enrollmentIds[studentIndex]!,
          teachingAssignmentId: assignmentId,
          term,
          maximum: term === 3 ? 40 : 30,
          quantitative: {
            original: grade(value),
            parallelRecovery: {
              imported: { value: { state: 'not-applicable' }, evidence: [{}] },
              calculated: { value: { state: 'not-applicable' } },
            } as unknown as ComparedGradeValueV1,
            parallelRecoveryApplicability: {
              imported: { value: { state: 'not-applicable' }, evidence: [{}] },
              calculated: { state: 'not-applicable' },
            } as unknown as TermResultV1['quantitative']['parallelRecoveryApplicability'],
            considered: grade(value),
          },
          qualitativeOperational: grade(value),
          officialGrade: grade(value, 99),
          percentage: grade(value * 2),
          authorityMode: 'imported-source',
          coverage: coverage(),
          ruleVersion: 'synthetic-d1-v1',
        };
        insertRecord(database, academicYearId, 'term-result', result);
      });
      const failed = studentIndex === 1 && assignmentIndex === 0;
      const annual: AnnualResultV1 = {
        id: `annual:${prefix}:${studentIndex}:${assignmentIndex}` as AnnualResultV1['id'],
        academicYearId,
        studentId,
        enrollmentId: enrollmentIds[studentIndex]!,
        teachingAssignmentId: assignmentId,
        originalTotal: grade(failed ? 40 : 70, failed ? 100 : 0),
        postRecoveryTotal: grade(failed ? 40 : 70, failed ? 100 : 0),
        academicState: {
          imported: failed ? 'eligible-for-council' : 'approved-direct',
          calculated: failed ? 'approved-direct' : 'not-eligible-for-council',
        },
        finalDecision: { status: 'pending' },
        authorityMode: 'imported-source',
        coverage: coverage(),
        ruleVersion: 'synthetic-d1-v1',
      };
      insertRecord(database, academicYearId, 'annual-result', annual);
    });
  });

  if (studentIds[0] && assignmentIds[0]) {
    const recovery: FinalRecoveryV1 = {
      id: `recovery:${prefix}:0:0:1` as FinalRecoveryV1['id'],
      academicYearId,
      studentId: studentIds[0],
      enrollmentId: enrollmentIds[0]!,
      teachingAssignmentId: assignmentIds[0],
      recoveredTerm: 1,
      originalTermGrade: grade(11),
      applicability: {
        imported: { value: { state: 'applicable' }, evidence: [{}] },
        calculated: { state: 'not-applicable' },
      } as unknown as FinalRecoveryV1['applicability'],
      recoveryGrade: grade(45, 99),
      replacementTermGrade: grade(80, 0),
      authorityMode: 'imported-source',
      coverage: coverage(),
      ruleVersion: 'synthetic-d1-v1',
    };
    insertRecord(database, academicYearId, 'final-recovery', recovery);
  }
  return { assignments: assignmentIds, students: studentIds, enrollments: enrollmentIds };
}

async function fixture(
  studentCount = 4,
  assignmentCount = 4,
): Promise<SqliteD1Database> {
  const database = await openMigratedDatabase();
  insertYear(database, year, 2026);
  insertYear(database, otherYear, 2027);
  seedClass(database, year, classGroup, '9A-2026', studentCount, assignmentCount);
  seedClass(database, otherYear, otherClass, '9A-2027', 1, 1);
  return database;
}

function queueRequest(
  academicYearId: AcademicYearId = year,
  requestedClass: ClassGroupId = classGroup,
) {
  return {
    operation: 'queue' as const,
    contractVersion: 1 as const,
    academicYearId,
    classReference: requestedClass as unknown as CouncilClassReferenceV1,
    page: { limit: 100, cursor: null },
  };
}

class InspectingDatabase implements D1ReadDatabaseV1 {
  readonly queries: string[] = [];

  constructor(private readonly inner: D1ReadDatabaseV1) {}

  prepare(query: string) {
    this.queries.push(query);
    return this.inner.prepare(query);
  }
}

describe('fonte D1 da projeção oficial do Conselho V1', () => {
  it('materializa turma/ano corrente em seis SELECTs fixos e sem N+1', async () => {
    const database = await fixture(4, 4);
    const inspected = new InspectingDatabase(database);
    const source = createGradebookD1CouncilOfficialProjectionSourceV1(inspected);
    const page = await source.listQueue(queueRequest());
    expect(page.items).toHaveLength(4);
    expect(page.items.map((item) => item.calculated.failedComponentCount)).toEqual([0, 1, 0, 0]);
    expect(inspected.queries).toHaveLength(6);
    expect(inspected.queries.every((query) => /^\s*SELECT\b/iu.test(query))).toBe(true);
    expect(inspected.queries.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/iu);
  });

  it('mantém a mesma contagem com uma ou muitas linhas/colunas e não altera schema/migrations', async () => {
    const smallDatabase = await fixture(1, 1);
    const before = smallDatabase.raw
      .prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version')
      .all();
    const small = new InspectingDatabase(smallDatabase);
    await createGradebookD1CouncilOfficialProjectionSourceV1(small).listQueue(queueRequest());
    expect(small.queries).toHaveLength(6);

    const largeDatabase = await fixture(4, 4);
    const large = new InspectingDatabase(largeDatabase);
    await createGradebookD1CouncilOfficialProjectionSourceV1(large).listQueue(queueRequest());
    expect(large.queries).toHaveLength(6);
    const after = smallDatabase.raw
      .prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version')
      .all();
    expect(after).toEqual(before);
    expect(after).toHaveLength(4);
  });

  it('projeta resultados correntes e isola outra turma/ano, inclusive perfil diferente de 2026', async () => {
    const database = await fixture();
    const source = createGradebookD1CouncilOfficialProjectionSourceV1(database);
    const page = await source.listQueue(queueRequest());
    const detail = await source.getStudent({
      operation: 'student',
      contractVersion: 1,
      academicYearId: year,
      classReference: classGroup as unknown as CouncilClassReferenceV1,
      studentReference: page.items[0]!.studentReference,
    });
    expect(detail?.classLabel).toBe('9A-2026');
    expect(detail?.annualView).toHaveLength(4);
    expect(detail?.annualView[0]?.periods[3].value).toEqual({ state: 'numeric', value: 45 });
    expect(JSON.stringify(detail)).not.toMatch(/"sheetName"|"cellAddress"|RAW/u);

    expect(await source.listQueue(queueRequest(otherYear, otherClass))).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(
      await source.listQueue(
        queueRequest(year, 'class-group:council-d1:missing' as ClassGroupId),
      ),
    ).toEqual({ items: [], nextCursor: null });
  });

  it('faz authorityMode native-engine falhar fechado sem afetar os demais alunos', async () => {
    const database = await fixture();
    database.raw
      .prepare(
        `UPDATE academic_record_versions
         SET authority_mode = 'native-engine',
             payload_json = json_set(payload_json, '$.value.authorityMode', 'native-engine')
         WHERE record_kind = 'annual-result'
           AND record_id = 'annual:9A-2026:0:0'`,
      )
      .run();
    const page = await createGradebookD1CouncilOfficialProjectionSourceV1(
      database,
    ).listQueue(queueRequest());
    expect(page.items[0]?.calculated).toMatchObject({
      queueState: 'insufficient-data',
      failedComponentCount: null,
      coverage: { state: 'insufficient-data' },
    });
    expect(page.items[1]?.calculated.queueState).toBe('eligible-for-council');
  });

  it('sanitiza falha física antes da fronteira CouncilWorkspaceSourceV1', async () => {
    const physicalFailure: D1ReadDatabaseV1 = {
      prepare: () => {
        throw new Error('SELECT sensitive_sql FROM secret_binding');
      },
    };
    await expect(
      createGradebookD1CouncilOfficialProjectionSourceV1(physicalFailure).listQueue(
        queueRequest(),
      ),
    ).rejects.toEqual(new CouncilWorkspaceSourceErrorV1('unavailable'));
  });
});
