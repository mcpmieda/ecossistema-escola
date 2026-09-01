import { describe, expect, it, vi } from 'vitest';

import {
  createTeachingCenterQueriesV1,
  TeachingCenterReadModelErrorV1,
} from '../../../../../server/gradebook/application/read-models/teaching/teaching-center-read-models-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../../../shared/gradebook-contracts/entities';
import type { AssessmentComponentId } from '../../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AcademicEntityKindV1,
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const yearA = 'academic-year:teaching-center:2026' as AcademicYearId;
const yearB = 'academic-year:teaching-center:2027' as AcademicYearId;
const contextA = { academicYearId: yearA } satisfies AcademicPersistenceContextV1;
const contextB = { academicYearId: yearB } satisfies AcademicPersistenceContextV1;
const teacherA = 'teacher:teaching-center:a' as TeacherId;
const teacherB = 'teacher:teaching-center:b' as TeacherId;
const subjectA = 'subject:teaching-center:a' as SubjectId;
const subjectB = 'subject:teaching-center:b' as SubjectId;
const classA = 'class-group:teaching-center:a' as ClassGroupId;
const classB = 'class-group:teaching-center:b' as ClassGroupId;
const assignmentA = 'teaching-assignment:teaching-center:a' as TeachingAssignmentId;
const assignmentB = 'teaching-assignment:teaching-center:b' as TeachingAssignmentId;
const assignmentC = 'teaching-assignment:teaching-center:c' as TeachingAssignmentId;
const instant = '2026-09-01T13:20:00.000Z';

interface StoredEntity {
  readonly academicYearId: AcademicYearId;
  readonly record: VersionedRecordV1<AcademicEntityRecordV1>;
}

function stored(
  academicYearId: AcademicYearId,
  value: AcademicEntityRecordV1,
  version = 1,
): StoredEntity {
  return { academicYearId, record: { value, version, recordedAt: instant } };
}

function memoryRepository(values: readonly StoredEntity[]): AcademicEntityRepositoryV1 & {
  readonly list: ReturnType<typeof vi.fn<AcademicEntityRepositoryV1['list']>>;
} {
  const get = vi.fn(
    async (context: AcademicPersistenceContextV1, reference: AcademicEntityReferenceV1) =>
      values.find(
        ({ academicYearId, record }) =>
          academicYearId === context.academicYearId &&
          record.value.kind === reference.kind &&
          record.value.value.id === reference.id,
      )?.record ?? null,
  );
  const list = vi.fn<AcademicEntityRepositoryV1['list']>(async (context, kind, request) => {
    const matching = values
      .filter(
        ({ academicYearId, record }) =>
          academicYearId === context.academicYearId && record.value.kind === kind,
      )
      .map(({ record }) => record);
    const offset =
      request.cursor == null ? 0 : Number.parseInt(request.cursor.slice('cursor:'.length), 10);
    const items = matching.slice(offset, offset + request.limit);
    const nextOffset = offset + items.length;
    return {
      items,
      nextCursor: nextOffset < matching.length ? `cursor:${nextOffset}` : null,
    };
  });
  return {
    get,
    list,
    appendVersion: vi.fn(async () => {
      throw new Error('Synthetic read-only repository.');
    }),
  };
}

function teacher(id: TeacherId, displayName: string): AcademicEntityRecordV1 {
  return {
    kind: 'teacher',
    value: {
      id,
      displayName,
      sourceNames: [`${displayName.toUpperCase()} SINTÉTICO`],
      status: 'active',
    },
  };
}

function subject(id: SubjectId, suffix: string): AcademicEntityRecordV1 {
  return {
    kind: 'subject',
    value: {
      id,
      code: `SYN-${suffix}`,
      displayName: `Componente Sintético ${suffix}`,
      shortName: `CS-${suffix}`,
      status: 'active',
    },
  };
}

function classGroup(id: ClassGroupId, code: string, year = yearA): AcademicEntityRecordV1 {
  return {
    kind: 'class-group',
    value: { id, academicYearId: year, code, grade: '6', section: code.slice(-1) },
  };
}

function assignment(
  id: TeachingAssignmentId,
  teacherId: TeacherId,
  subjectId: SubjectId,
  classGroupId: ClassGroupId,
  year = yearA,
): AcademicEntityRecordV1 {
  return {
    kind: 'teaching-assignment',
    value: {
      id,
      academicYearId: year,
      teacherId,
      classGroupId,
      subjectId,
      sourceDisciplineIndex: 'D1',
      effectivePeriod: {},
      confirmationOrigin: 'imported-source',
    },
  };
}

function component(
  id: AssessmentComponentId,
  teachingAssignmentId: TeachingAssignmentId,
  term: 1 | 2,
  order: number,
): AcademicEntityRecordV1 {
  return {
    kind: 'assessment-component',
    value: {
      id,
      academicYearId: yearA,
      teachingAssignmentId,
      term,
      type: 'written',
      name: `Avaliação Sintética ${id}`,
      maximum: 10,
      order,
      applicability: { state: 'applicable' },
    },
  };
}

function fixtures(): readonly StoredEntity[] {
  return [
    stored(yearA, teacher(teacherB, 'Docente B')),
    stored(yearA, teacher(teacherA, 'Docente A'), 2),
    stored(yearA, subject(subjectB, 'B')),
    stored(yearA, subject(subjectA, 'A'), 3),
    stored(yearA, classGroup(classB, '6B')),
    stored(yearA, classGroup(classA, '6A')),
    stored(yearA, assignment(assignmentC, teacherB, subjectA, classB)),
    stored(yearA, assignment(assignmentB, teacherA, subjectB, classB)),
    stored(yearA, assignment(assignmentA, teacherA, subjectA, classA)),
    stored(
      yearA,
      component(
        'assessment-component:teaching-center:z' as AssessmentComponentId,
        assignmentA,
        2,
        1,
      ),
    ),
    stored(
      yearA,
      component(
        'assessment-component:teaching-center:a' as AssessmentComponentId,
        assignmentA,
        1,
        2,
      ),
    ),
    stored(
      yearA,
      component(
        'assessment-component:teaching-center:b' as AssessmentComponentId,
        assignmentB,
        1,
        1,
      ),
    ),
    stored(yearB, teacher(teacherA, 'Docente A Outro Ano')),
    stored(yearB, subject(subjectA, 'A-OUTRO-ANO')),
    stored(yearB, classGroup(classA, '7A', yearB)),
    stored(yearB, assignment(assignmentA, teacherA, subjectA, classA, yearB)),
  ];
}

describe('read models locais de Professor e Componente V1', () => {
  it('monta a Central do Professor com paginação, ordenação e origem preservada', async () => {
    const repository = memoryRepository(fixtures());
    const queries = createTeachingCenterQueriesV1(repository, { pageSize: 1 });

    await expect(queries.teachers.get(contextA, teacherA)).resolves.toMatchObject({
      academicYearId: yearA,
      teacher: { value: { id: teacherA, displayName: 'Docente A' }, version: 2 },
      assignments: [
        {
          assignment: {
            value: { id: assignmentA, confirmationOrigin: 'imported-source' },
          },
          classGroup: { value: { id: classA, code: '6A' } },
          subject: { value: { id: subjectA } },
          assessmentComponents: [
            { value: { id: 'assessment-component:teaching-center:a', term: 1 } },
            { value: { id: 'assessment-component:teaching-center:z', term: 2 } },
          ],
        },
        {
          assignment: {
            value: { id: assignmentB, confirmationOrigin: 'imported-source' },
          },
          classGroup: { value: { id: classB, code: '6B' } },
          subject: { value: { id: subjectB } },
          assessmentComponents: [
            { value: { id: 'assessment-component:teaching-center:b', term: 1 } },
          ],
        },
      ],
    });
    expect(
      repository.list.mock.calls.filter(([, kind]) => kind === 'teaching-assignment'),
    ).toHaveLength(3);

    await expect(queries.teachers.get(contextB, teacherA)).resolves.toMatchObject({
      academicYearId: yearB,
      teacher: { value: { displayName: 'Docente A Outro Ano' } },
      assignments: [{ assignment: { value: { academicYearId: yearB } } }],
    });
  });

  it('monta a Central do Componente em consulta separada e resolve docentes por ID', async () => {
    const repository = memoryRepository(fixtures());
    const queries = createTeachingCenterQueriesV1(repository, { pageSize: 1 });

    await expect(queries.subjects.get(contextA, subjectA)).resolves.toMatchObject({
      academicYearId: yearA,
      subject: { value: { id: subjectA, displayName: 'Componente Sintético A' }, version: 3 },
      assignments: [
        {
          assignment: {
            value: { id: assignmentA, confirmationOrigin: 'imported-source' },
          },
          classGroup: { value: { id: classA } },
          teacher: { value: { id: teacherA } },
          assessmentComponents: [
            { value: { id: 'assessment-component:teaching-center:a' } },
            { value: { id: 'assessment-component:teaching-center:z' } },
          ],
        },
        {
          assignment: {
            value: { id: assignmentC, confirmationOrigin: 'imported-source' },
          },
          classGroup: { value: { id: classB } },
          teacher: { value: { id: teacherB } },
          assessmentComponents: [],
        },
      ],
    });
  });

  it('retorna null para raiz ausente sem varrer relações', async () => {
    const repository = memoryRepository(fixtures());
    const queries = createTeachingCenterQueriesV1(repository);

    await expect(
      queries.teachers.get(contextA, 'teacher:teaching-center:missing' as TeacherId),
    ).resolves.toBeNull();
    await expect(
      queries.subjects.get(contextA, 'subject:teaching-center:missing' as SubjectId),
    ).resolves.toBeNull();
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('mantém referências incompletas explícitas sem inferir identidade por nomes', async () => {
    const missingClass = 'class-group:teaching-center:missing' as ClassGroupId;
    const missingSubject = 'subject:teaching-center:missing' as SubjectId;
    const missingTeacher = 'teacher:teaching-center:missing' as TeacherId;
    const repository = memoryRepository([
      stored(yearA, teacher(teacherA, 'Mesmo Nome Sintético')),
      stored(yearA, subject(subjectA, 'MESMO-NOME-SINTÉTICO')),
      stored(yearA, assignment(assignmentA, teacherA, missingSubject, missingClass)),
      stored(yearA, assignment(assignmentB, missingTeacher, subjectA, missingClass)),
    ]);
    const queries = createTeachingCenterQueriesV1(repository);

    await expect(queries.teachers.get(contextA, teacherA)).resolves.toMatchObject({
      assignments: [
        {
          assignment: { value: { confirmationOrigin: 'imported-source' } },
          classGroup: null,
          subject: null,
          assessmentComponents: [],
        },
      ],
    });
    await expect(queries.subjects.get(contextA, subjectA)).resolves.toMatchObject({
      assignments: [
        {
          assignment: { value: { confirmationOrigin: 'imported-source' } },
          classGroup: null,
          teacher: null,
          assessmentComponents: [],
        },
      ],
    });
  });

  it('recusa paginação inválida e ciclos de cursor com erro estável', async () => {
    const repository = memoryRepository(fixtures());
    expect(() => createTeachingCenterQueriesV1(repository, { pageSize: 1.5 })).toThrow(
      TeachingCenterReadModelErrorV1,
    );

    repository.list.mockImplementation(async (_context, kind: AcademicEntityKindV1) => ({
      items: fixtures()
        .filter(
          ({ academicYearId, record }) => academicYearId === yearA && record.value.kind === kind,
        )
        .slice(0, 1)
        .map(({ record }) => record),
      nextCursor: 'synthetic-cycle',
    }));
    await expect(
      createTeachingCenterQueriesV1(repository, { pageSize: 1 }).teachers.get(contextA, teacherA),
    ).rejects.toMatchObject({ code: 'cursor-cycle' });
  });
});
