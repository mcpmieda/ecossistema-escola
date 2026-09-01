import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  SchoolId,
  StudentId,
  StudentStatusEventId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { AssessmentComponentId } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  createGradebookD1AcademicEntityRepositoryV1,
  GRADEBOOK_D1_ACADEMIC_ENTITY_DEFAULT_MAXIMUM_PAGE_SIZE_V1,
  GRADEBOOK_D1_ACADEMIC_ENTITY_KINDS_V1,
} from '../../../../server/gradebook/persistence/d1/entities/d1-academic-entity-repository-v1';
import { createGradebookD1WriteUnitOfWorkV1 } from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../../src/gradebook-domain/context/academic-context-2026-v1';
import type {
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicPersistenceContextV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const academicYearIdA = 'academic-year:d1-entities:2026:a' as AcademicYearId;
const academicYearIdB = 'academic-year:d1-entities:2026:b' as AcademicYearId;
const contextA = { academicYearId: academicYearIdA } satisfies AcademicPersistenceContextV1;
const contextB = { academicYearId: academicYearIdB } satisfies AcademicPersistenceContextV1;

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
});

afterEach(() => {
  database.raw.close();
});

async function seedAcademicYear(
  context: AcademicPersistenceContextV1,
  schoolId: SchoolId,
): Promise<void> {
  const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
  const result = await unit.entities.appendVersion(
    context,
    {
      kind: 'academic-year',
      value: {
        id: context.academicYearId,
        schoolId,
        year: ACADEMIC_CONTEXT_2026_IDENTITY_V1.academicYear,
        status: 'active',
        startsOn: '2026-02-01',
        endsOn: '2026-12-20',
        activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
        configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
      },
    },
    { expectedVersion: null },
  );
  expect(result.status).toBe('written');
}

function records(
  academicYearId = academicYearIdA,
  suffix = 'a',
): readonly AcademicEntityRecordV1[] {
  const teacherId = `teacher:d1-entities:${suffix}` as TeacherId;
  const classGroupId = `class-group:d1-entities:${suffix}` as ClassGroupId;
  const subjectId = `subject:d1-entities:${suffix}` as SubjectId;
  const teachingAssignmentId = `teaching-assignment:d1-entities:${suffix}` as TeachingAssignmentId;
  const studentId = `student:d1-entities:${suffix}` as StudentId;
  const enrollmentId = `enrollment:d1-entities:${suffix}` as EnrollmentId;
  const statusEventId = `student-status-event:d1-entities:${suffix}` as StudentStatusEventId;
  const componentId = `assessment-component:d1-entities:${suffix}` as AssessmentComponentId;

  return [
    {
      kind: 'teacher',
      value: {
        id: teacherId,
        displayName: `Docente Sintético ${suffix.toUpperCase()}`,
        sourceNames: [`DOCENTE SINTÉTICO ${suffix.toUpperCase()}`, `Docente ${suffix}`],
        status: 'active',
      },
    },
    {
      kind: 'class-group',
      value: {
        id: classGroupId,
        academicYearId,
        code: `6${suffix.toUpperCase()}`,
        grade: '6',
        section: suffix.toUpperCase(),
        shift: 'morning',
      },
    },
    {
      kind: 'subject',
      value: {
        id: subjectId,
        code: `SYN-${suffix.toUpperCase()}`,
        displayName: `Componente Sintético ${suffix.toUpperCase()}`,
        shortName: `CS-${suffix.toUpperCase()}`,
        status: 'active',
      },
    },
    {
      kind: 'teaching-assignment',
      value: {
        id: teachingAssignmentId,
        academicYearId,
        teacherId,
        classGroupId,
        subjectId,
        sourceDisciplineIndex: 'D1',
        effectivePeriod: { startsOn: '2026-02-01', endsOn: '2026-12-20' },
        confirmationOrigin: 'imported-source',
      },
    },
    {
      kind: 'student',
      value: {
        id: studentId,
        displayName: `Estudante Sintético ${suffix.toUpperCase()}`,
        sourceNames: [`ESTUDANTE SINTÉTICO ${suffix.toUpperCase()}`],
        sourceIdentityMarks: [`synthetic-position:${suffix}`],
      },
    },
    {
      kind: 'enrollment',
      value: {
        id: enrollmentId,
        academicYearId,
        studentId,
        classGroupId,
        effectivePeriod: { startsOn: '2026-02-01' },
        position: 'current',
        sourcePosition: 10,
      },
    },
    {
      kind: 'student-status-event',
      value: {
        id: statusEventId,
        academicYearId,
        enrollmentId,
        status: 'active',
        sourceText: 'SITUAÇÃO SINTÉTICA ATIVA',
        occurredOn: '2026-02-01',
        sourceReference: `synthetic-source:${suffix}`,
      },
    },
    {
      kind: 'assessment-component',
      value: {
        id: componentId,
        academicYearId,
        teachingAssignmentId,
        term: 1,
        type: 'written',
        name: `Avaliação Sintética ${suffix.toUpperCase()}`,
        maximum: 10,
        order: 1,
        applicability: { state: 'applicable' },
      },
    },
  ];
}

function reference(record: AcademicEntityRecordV1): AcademicEntityReferenceV1 {
  return { kind: record.kind, id: record.value.id } as AcademicEntityReferenceV1;
}

function updated(record: AcademicEntityRecordV1): AcademicEntityRecordV1 {
  switch (record.kind) {
    case 'academic-year':
      return record;
    case 'teacher':
      return {
        kind: record.kind,
        value: { ...record.value, displayName: 'Docente Sintético Atualizado', status: 'inactive' },
      };
    case 'class-group':
      return { kind: record.kind, value: { ...record.value, shift: 'afternoon' } };
    case 'subject':
      return {
        kind: record.kind,
        value: { ...record.value, shortName: 'CSA', status: 'inactive' },
      };
    case 'teaching-assignment':
      return {
        kind: record.kind,
        value: { ...record.value, confirmationOrigin: 'administrative' },
      };
    case 'student':
      return {
        kind: record.kind,
        value: {
          ...record.value,
          sourceIdentityMarks: [...(record.value.sourceIdentityMarks ?? []), 'synthetic-mark:2'],
        },
      };
    case 'enrollment':
      return { kind: record.kind, value: { ...record.value, position: 'historical' } };
    case 'student-status-event':
      return {
        kind: record.kind,
        value: {
          ...record.value,
          status: 'transferred',
          sourceText: 'MOVIMENTO SINTÉTICO',
          transfer: { destinationClassGroupCode: '6B' },
        },
      };
    case 'assessment-component':
      return { kind: record.kind, value: { ...record.value, maximum: 12, order: 2 } };
  }
}

async function appendAll(
  repository: ReturnType<typeof createGradebookD1AcademicEntityRepositoryV1>,
  context: AcademicPersistenceContextV1,
  values: readonly AcademicEntityRecordV1[],
): Promise<void> {
  for (const record of values) {
    await expect(
      repository.appendVersion(context, record, { expectedVersion: null }),
    ).resolves.toMatchObject({ status: 'written', record: { value: record, version: 1 } });
  }
}

describe('createGradebookD1AcademicEntityRepositoryV1', () => {
  it('grava, atualiza e reconstrói os oito tipos sem perder relações ou histórico', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const initial = records();
    const before = structuredClone(initial);

    await appendAll(repository, contextA, initial);

    for (const record of initial) {
      await expect(repository.get(contextA, reference(record))).resolves.toEqual({
        value: record,
        version: 1,
        recordedAt: instant,
      });
      const next = updated(record);
      await expect(
        repository.appendVersion(contextA, next, { expectedVersion: 1 }),
      ).resolves.toEqual({
        status: 'written',
        record: { value: next, version: 2, recordedAt: instant },
      });
      await expect(repository.get(contextA, reference(record))).resolves.toEqual({
        value: next,
        version: 2,
        recordedAt: instant,
      });
    }

    expect(initial).toEqual(before);
    expect(
      database.raw
        .prepare(
          `SELECT entity_kind, version, previous_version
           FROM academic_entity_versions
           WHERE academic_year_id = ?
           ORDER BY entity_kind, version`,
        )
        .all(academicYearIdA),
    ).toHaveLength(16);
    for (const kind of GRADEBOOK_D1_ACADEMIC_ENTITY_KINDS_V1) {
      expect(
        database.raw
          .prepare(
            `SELECT version, previous_version FROM academic_entity_versions
             WHERE academic_year_id = ? AND entity_kind = ? ORDER BY version`,
          )
          .all(academicYearIdA, kind),
      ).toEqual([
        { version: 1, previous_version: null },
        { version: 2, previous_version: 1 },
      ]);
    }

    const assignment = initial.find((record) => record.kind === 'teaching-assignment')!;
    expect(
      database.raw
        .prepare(
          `SELECT teacher_ref_kind, teacher_id, class_group_ref_kind, class_group_id,
                  subject_ref_kind, subject_id, display_code, lifecycle_state
           FROM academic_entity_versions
           WHERE academic_year_id = ? AND entity_kind = 'teaching-assignment'
           ORDER BY version DESC LIMIT 1`,
        )
        .get(academicYearIdA),
    ).toEqual({
      teacher_ref_kind: 'teacher',
      teacher_id: assignment.kind === 'teaching-assignment' ? assignment.value.teacherId : null,
      class_group_ref_kind: 'class-group',
      class_group_id:
        assignment.kind === 'teaching-assignment' ? assignment.value.classGroupId : null,
      subject_ref_kind: 'subject',
      subject_id: assignment.kind === 'teaching-assignment' ? assignment.value.subjectId : null,
      display_code: 'D1',
      lifecycle_state: 'administrative',
    });
  });

  it('pagina por cursor opaco e chave estável com tamanhos de página 1 e 2', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
      maximumPageSize: 2,
    });
    const teachers = ['03', '01', '04', '02'].map((suffix): AcademicEntityRecordV1 => ({
      kind: 'teacher',
      value: {
        id: `teacher:d1-page:${suffix}` as TeacherId,
        displayName: `Nome Sintético ${4 - Number(suffix)}`,
        sourceNames: [`ORIGEM SINTÉTICA ${suffix}`],
        status: 'active',
      },
    }));
    await appendAll(repository, contextA, teachers);

    const first = await repository.list(contextA, 'teacher', { limit: 1 });
    const second = await repository.list(contextA, 'teacher', {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(first.items.map(({ value }) => value.value.id)).toEqual(['teacher:d1-page:01']);
    expect(second.items.map(({ value }) => value.value.id)).toEqual(['teacher:d1-page:02']);
    expect(first.nextCursor).not.toBeNull();
    expect(first.nextCursor).not.toContain('teacher:d1-page:01');

    const pageOne = await repository.list(contextA, 'teacher', { limit: 2, cursor: null });
    const pageTwo = await repository.list(contextA, 'teacher', {
      limit: 2,
      cursor: pageOne.nextCursor,
    });
    expect([...pageOne.items, ...pageTwo.items].map(({ value }) => value.value.id)).toEqual([
      'teacher:d1-page:01',
      'teacher:d1-page:02',
      'teacher:d1-page:03',
      'teacher:d1-page:04',
    ]);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it('rejeita limite inseguro e cursores inválidos, de outro tipo ou de outro ano', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    await seedAcademicYear(contextB, 'school:d1-entities:b' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
      maximumPageSize: 1,
    });
    await appendAll(repository, contextA, records(undefined, 'a').slice(0, 1));
    await appendAll(repository, contextA, records(undefined, 'b').slice(0, 1));
    const page = await repository.list(contextA, 'teacher', { limit: 1 });

    await expect(repository.list(contextA, 'teacher', { limit: 0 })).rejects.toMatchObject({
      code: 'invalid-page-request',
    });
    await expect(repository.list(contextA, 'teacher', { limit: 2 })).rejects.toMatchObject({
      code: 'invalid-page-request',
    });
    await expect(
      repository.list(contextA, 'teacher', { limit: 1, cursor: 'not-a-cursor' }),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
    await expect(
      repository.list(contextA, 'subject', { limit: 1, cursor: page.nextCursor }),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
    await expect(
      repository.list(contextB, 'teacher', { limit: 1, cursor: page.nextCursor }),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
    expect(GRADEBOOK_D1_ACADEMIC_ENTITY_DEFAULT_MAXIMUM_PAGE_SIZE_V1).toBe(100);
  });

  it('isola IDs e listas entre anos sem inferir identidade por nome', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    await seedAcademicYear(contextB, 'school:d1-entities:b' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const teacherId = 'teacher:d1-isolation:same-id' as TeacherId;
    const teacherA: AcademicEntityRecordV1 = {
      kind: 'teacher',
      value: {
        id: teacherId,
        displayName: 'Mesmo Nome Sintético',
        sourceNames: ['ORIGEM A'],
        status: 'active',
      },
    };
    const teacherB: AcademicEntityRecordV1 = {
      kind: 'teacher',
      value: {
        id: teacherId,
        displayName: 'Mesmo Nome Sintético',
        sourceNames: ['ORIGEM B'],
        status: 'inactive',
      },
    };
    await repository.appendVersion(contextA, teacherA, { expectedVersion: null });
    await repository.appendVersion(contextB, teacherB, { expectedVersion: null });

    await expect(repository.get(contextA, reference(teacherA))).resolves.toMatchObject({
      value: teacherA,
    });
    await expect(repository.get(contextB, reference(teacherB))).resolves.toMatchObject({
      value: teacherB,
    });
    const classB = records(academicYearIdB, 'b')[1]!;
    await repository.appendVersion(contextB, classB, { expectedVersion: null });
    await expect(repository.get(contextA, reference(classB))).resolves.toBeNull();
    await expect(repository.list(contextA, 'class-group', { limit: 10 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('valida por ano e tipo as relações de atribuição, matrícula, evento e componente', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    await seedAcademicYear(contextB, 'school:d1-entities:b' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const relational = records();

    for (const record of [relational[3]!, relational[5]!, relational[6]!, relational[7]!]) {
      await expect(
        repository.appendVersion(contextA, record, { expectedVersion: null }),
      ).rejects.toMatchObject({ code: 'database-write-failed' });
    }
    expect(
      database.raw
        .prepare(
          `SELECT COUNT(*) AS count FROM academic_entity_streams
           WHERE academic_year_id = ?`,
        )
        .get(academicYearIdA),
    ).toEqual({ count: 0 });

    await appendAll(repository, contextB, records(academicYearIdB, 'b').slice(0, 3));
    const crossYearAssignment = {
      ...relational[3]!,
      value: {
        ...(relational[3]!.kind === 'teaching-assignment' ? relational[3]!.value : {}),
        teacherId: records(academicYearIdB, 'b')[0]!.value.id as TeacherId,
        classGroupId: records(academicYearIdB, 'b')[1]!.value.id as ClassGroupId,
        subjectId: records(academicYearIdB, 'b')[2]!.value.id as SubjectId,
      },
    } as AcademicEntityRecordV1;
    await expect(
      repository.appendVersion(contextA, crossYearAssignment, { expectedVersion: null }),
    ).rejects.toMatchObject({ code: 'database-write-failed' });

    const wrongKindId = 'entity:d1-wrong-kind' as TeacherId;
    await repository.appendVersion(
      contextA,
      {
        kind: 'teacher',
        value: {
          id: wrongKindId,
          displayName: 'Tipo Sintético Incorreto',
          sourceNames: [],
          status: 'active',
        },
      },
      { expectedVersion: null },
    );
    const wrongKindAssignment = {
      ...crossYearAssignment,
      value: { ...crossYearAssignment.value, subjectId: wrongKindId as unknown as SubjectId },
    } as AcademicEntityRecordV1;
    await expect(
      repository.appendVersion(contextA, wrongKindAssignment, { expectedVersion: null }),
    ).rejects.toMatchObject({ code: 'database-write-failed' });
  });

  it('aplica CAS nulo, válido, obsoleto e expectativa sobre stream ausente', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const teacher = records()[0]!;
    await expect(
      repository.appendVersion(contextA, teacher, { expectedVersion: null }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 1 } });
    await expect(
      repository.appendVersion(contextA, teacher, { expectedVersion: null }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });
    await expect(
      repository.appendVersion(contextA, updated(teacher), { expectedVersion: 1 }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 2 } });
    await expect(
      repository.appendVersion(contextA, teacher, { expectedVersion: 1 }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 2 });

    const missing = records(undefined, 'missing')[0]!;
    await expect(
      repository.appendVersion(contextA, missing, { expectedVersion: 1 }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: null });
    expect(
      database.raw
        .prepare(
          `SELECT version, previous_version FROM academic_entity_versions
           WHERE academic_year_id = ? AND entity_kind = 'teacher'
             AND entity_id = ? ORDER BY version`,
        )
        .all(academicYearIdA, teacher.value.id),
    ).toEqual([
      { version: 1, previous_version: null },
      { version: 2, previous_version: 1 },
    ]);
  });

  it('reverte raiz e histórico em falha de FK e reverte ponteiro em falha histórica', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    let currentInstant = instant;
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => currentInstant,
    });
    const invalidEnrollment = records()[5]!;
    await expect(
      repository.appendVersion(contextA, invalidEnrollment, { expectedVersion: null }),
    ).rejects.toMatchObject({ code: 'database-write-failed' });
    expect(
      database.raw
        .prepare(
          `SELECT COUNT(*) AS count FROM academic_entity_streams
           WHERE academic_year_id = ? AND entity_kind = 'enrollment'`,
        )
        .get(academicYearIdA),
    ).toEqual({ count: 0 });

    const teacher = records()[0]!;
    await repository.appendVersion(contextA, teacher, { expectedVersion: null });
    currentInstant = 'driver-sensitive-invalid-instant';
    await expect(
      repository.appendVersion(contextA, updated(teacher), { expectedVersion: 1 }),
    ).rejects.toMatchObject({
      code: 'database-write-failed',
      message: 'Não foi possível gravar a entidade acadêmica persistida.',
    });
    expect(
      database.raw
        .prepare(
          `SELECT current_version FROM academic_entity_streams
           WHERE academic_year_id = ? AND entity_kind = 'teacher' AND entity_id = ?`,
        )
        .get(academicYearIdA, teacher.value.id),
    ).toEqual({ current_version: 1 });
    expect(
      database.raw
        .prepare(
          `SELECT COUNT(*) AS count FROM academic_entity_versions
           WHERE academic_year_id = ? AND entity_kind = 'teacher' AND entity_id = ?`,
        )
        .get(academicYearIdA, teacher.value.id),
    ).toEqual({ count: 1 });
  });

  it('falha para shape, JSON ou coluna incompatível e mantém erros sanitizados', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const teacher = records()[0]!;
    await expect(
      repository.appendVersion(
        contextA,
        {
          kind: 'teacher',
          value: { ...teacher.value, status: 'invalid-status' },
        } as unknown as AcademicEntityRecordV1,
        { expectedVersion: null },
      ),
    ).rejects.toMatchObject({
      code: 'incompatible-write',
      message: 'A escrita da entidade acadêmica possui formato incompatível.',
    });

    await repository.appendVersion(contextA, teacher, { expectedVersion: null });
    database.raw
      .prepare(
        `UPDATE academic_entity_versions SET display_code = 'coluna divergente'
         WHERE academic_year_id = ? AND entity_kind = 'teacher' AND entity_id = ?`,
      )
      .run(academicYearIdA, teacher.value.id);
    await expect(repository.get(contextA, reference(teacher))).rejects.toMatchObject({
      code: 'incompatible-row',
      message: 'A entidade acadêmica persistida possui formato incompatível.',
    });

    database.raw
      .prepare(
        `UPDATE academic_entity_versions SET display_code = ?, payload_json = '{}'
         WHERE academic_year_id = ? AND entity_kind = 'teacher' AND entity_id = ?`,
      )
      .run(
        teacher.kind === 'teacher' ? teacher.value.displayName : null,
        academicYearIdA,
        teacher.value.id,
      );
    await expect(repository.get(contextA, reference(teacher))).rejects.toMatchObject({
      code: 'incompatible-row',
    });

    database.raw.exec('PRAGMA ignore_check_constraints = ON;');
    database.raw
      .prepare(
        `UPDATE academic_entity_versions SET payload_json = '{invalid-json'
         WHERE academic_year_id = ? AND entity_kind = 'teacher' AND entity_id = ?`,
      )
      .run(academicYearIdA, teacher.value.id);
    database.raw.exec('PRAGMA ignore_check_constraints = OFF;');
    const invalidJsonError = await repository
      .get(contextA, reference(teacher))
      .catch((error: unknown) => error);
    expect(invalidJsonError).toMatchObject({
      code: 'invalid-json',
      message: 'Os dados da entidade acadêmica não puderam ser reconstruídos.',
    });
    expect(String(invalidJsonError)).not.toContain('{invalid-json');
    expect(String(invalidJsonError)).not.toContain(teacher.value.id);
  });

  it('rejeita academic-year explicitamente sem criar uma implementação concorrente', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const academicYearRecord: AcademicEntityRecordV1 = {
      kind: 'academic-year',
      value: {
        id: academicYearIdA,
        schoolId: 'school:d1-entities:a' as SchoolId,
        year: 2026,
        status: 'active',
        activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
        configurationVersion: '1',
      },
    };

    for (const operation of [
      repository.get(contextA, { kind: 'academic-year', id: academicYearIdA }),
      repository.list(contextA, 'academic-year', { limit: 1 }),
      repository.appendVersion(contextA, academicYearRecord, { expectedVersion: 1 }),
    ]) {
      await expect(operation).rejects.toMatchObject({
        code: 'academic-year-owned-by-context-adapter',
        message: 'O ano acadêmico pertence ao adaptador oficial de contexto.',
      });
    }
    expect(
      database.raw
        .prepare('SELECT COUNT(*) AS count FROM academic_year_versions WHERE academic_year_id = ?')
        .get(academicYearIdA),
    ).toEqual({ count: 1 });
  });

  it('converte falha bruta do driver em erro fixo sem SQL ou identificadores', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const teacher = records()[0]!;
    database.raw.exec('DROP TABLE academic_entity_versions;');

    const error = await repository
      .get(contextA, reference(teacher))
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: 'database-read-failed',
      message: 'Não foi possível consultar as entidades acadêmicas persistidas.',
    });
    expect(String(error)).not.toContain('SELECT');
    expect(String(error)).not.toContain(teacher.value.id);
    expect(String(error)).not.toContain('no such table');
  });

  it('mantém leituras determinísticas sem alterar entradas do chamador', async () => {
    await seedAcademicYear(contextA, 'school:d1-entities:a' as SchoolId);
    const repository = createGradebookD1AcademicEntityRepositoryV1(database, {
      now: () => instant,
    });
    const teacher = records()[0]!;
    const page = { limit: 10, cursor: null } as const;
    const contextSnapshot = structuredClone(contextA);
    const teacherSnapshot = structuredClone(teacher);
    const pageSnapshot = structuredClone(page);

    await repository.appendVersion(contextA, teacher, { expectedVersion: null });

    expect(await repository.get(contextA, reference(teacher))).toEqual(
      await repository.get(contextA, reference(teacher)),
    );
    expect(await repository.list(contextA, teacher.kind, page)).toEqual(
      await repository.list(contextA, teacher.kind, page),
    );
    expect(contextA).toEqual(contextSnapshot);
    expect(teacher).toEqual(teacherSnapshot);
    expect(page).toEqual(pageSnapshot);
  });

  it('rejeita opções de paginação inválidas na criação', () => {
    for (const maximumPageSize of [
      0,
      GRADEBOOK_D1_ACADEMIC_ENTITY_DEFAULT_MAXIMUM_PAGE_SIZE_V1 + 1,
    ]) {
      expect(() =>
        createGradebookD1AcademicEntityRepositoryV1(database, { maximumPageSize }),
      ).toThrow(
        expect.objectContaining({
          code: 'invalid-options',
          message: 'As opções do repositório acadêmico local são inválidas.',
        }),
      );
    }
  });
});
