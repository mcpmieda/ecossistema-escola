import { describe, expect, it, vi } from 'vitest';

import {
  ClassGroupCenterReadModelErrorV1,
  createClassGroupCenterQueryV1,
} from '../../../../../server/gradebook/application/read-models/class-group/class-group-center-read-model-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  StudentStatusEventId,
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

const yearA = 'academic-year:class-center:2026' as AcademicYearId;
const yearB = 'academic-year:class-center:2027' as AcademicYearId;
const contextA = { academicYearId: yearA } satisfies AcademicPersistenceContextV1;
const contextB = { academicYearId: yearB } satisfies AcademicPersistenceContextV1;
const classGroupId = 'class-group:class-center:001' as ClassGroupId;
const studentA = 'student:class-center:a' as StudentId;
const studentB = 'student:class-center:b' as StudentId;
const enrollmentA = 'enrollment:class-center:a' as EnrollmentId;
const enrollmentB = 'enrollment:class-center:b' as EnrollmentId;
const assignmentId = 'teaching-assignment:class-center:001' as TeachingAssignmentId;
const teacherId = 'teacher:class-center:001' as TeacherId;
const subjectId = 'subject:class-center:001' as SubjectId;
const instant = '2026-09-01T13:10:00.000Z';

interface StoredEntity {
  readonly academicYearId: AcademicYearId;
  readonly record: VersionedRecordV1<AcademicEntityRecordV1>;
}

function stored(
  academicYearId: AcademicYearId,
  value: AcademicEntityRecordV1,
  version = 1,
): StoredEntity {
  return {
    academicYearId,
    record: { value, version, recordedAt: instant },
  };
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

function fixtures(): readonly StoredEntity[] {
  return [
    stored(
      yearA,
      {
        kind: 'class-group',
        value: {
          id: classGroupId,
          academicYearId: yearA,
          code: '6S',
          grade: '6',
          section: 'S',
          shift: 'morning',
        },
      },
      2,
    ),
    stored(yearA, {
      kind: 'enrollment',
      value: {
        id: enrollmentB,
        academicYearId: yearA,
        studentId: studentB,
        classGroupId,
        effectivePeriod: {},
        position: 'current',
      },
    }),
    stored(yearA, {
      kind: 'enrollment',
      value: {
        id: enrollmentA,
        academicYearId: yearA,
        studentId: studentA,
        classGroupId,
        effectivePeriod: {},
        position: 'historical',
      },
    }),
    stored(yearA, {
      kind: 'student',
      value: { id: studentB, displayName: 'Estudante Sintético B', sourceNames: [] },
    }),
    stored(yearA, {
      kind: 'student',
      value: { id: studentA, displayName: 'Estudante Sintético A', sourceNames: [] },
    }),
    stored(yearA, {
      kind: 'student-status-event',
      value: {
        id: 'student-status-event:class-center:z' as StudentStatusEventId,
        academicYearId: yearA,
        enrollmentId: enrollmentA,
        status: 'transferred',
        sourceText: 'MOVIMENTO SINTÉTICO',
        occurredOn: '2026-05-31',
      },
    }),
    stored(yearA, {
      kind: 'student-status-event',
      value: {
        id: 'student-status-event:class-center:a' as StudentStatusEventId,
        academicYearId: yearA,
        enrollmentId: enrollmentA,
        status: 'active',
        sourceText: 'SITUAÇÃO SINTÉTICA ATIVA',
        occurredOn: '2026-02-01',
      },
    }),
    stored(yearA, {
      kind: 'teaching-assignment',
      value: {
        id: assignmentId,
        academicYearId: yearA,
        teacherId,
        classGroupId,
        subjectId,
        effectivePeriod: {},
        confirmationOrigin: 'imported-source',
      },
    }),
    stored(yearA, {
      kind: 'teacher',
      value: {
        id: teacherId,
        displayName: 'Docente Sintético',
        sourceNames: [],
        status: 'active',
      },
    }),
    stored(yearA, {
      kind: 'subject',
      value: {
        id: subjectId,
        code: 'SYN',
        displayName: 'Componente Sintético',
        shortName: 'CS',
        status: 'active',
      },
    }),
    stored(yearA, {
      kind: 'assessment-component',
      value: {
        id: 'assessment-component:class-center:b' as AssessmentComponentId,
        academicYearId: yearA,
        teachingAssignmentId: assignmentId,
        term: 2,
        type: 'written',
        name: 'Avaliação Sintética B',
        maximum: 10,
        order: 1,
        applicability: { state: 'applicable' },
      },
    }),
    stored(yearA, {
      kind: 'assessment-component',
      value: {
        id: 'assessment-component:class-center:a' as AssessmentComponentId,
        academicYearId: yearA,
        teachingAssignmentId: assignmentId,
        term: 1,
        type: 'written',
        name: 'Avaliação Sintética A',
        maximum: 10,
        order: 2,
        applicability: { state: 'applicable' },
      },
    }),
    stored(yearB, {
      kind: 'class-group',
      value: {
        id: classGroupId,
        academicYearId: yearB,
        code: '7S',
        grade: '7',
        section: 'S',
      },
    }),
    stored(yearB, {
      kind: 'enrollment',
      value: {
        id: 'enrollment:class-center:other-year' as EnrollmentId,
        academicYearId: yearB,
        studentId: studentA,
        classGroupId,
        effectivePeriod: {},
        position: 'current',
      },
    }),
  ];
}

describe('read model local da Central da Turma V1', () => {
  it('pagina, isola o ano e monta estudantes, situações, atribuições e componentes', async () => {
    const repository = memoryRepository(fixtures());
    const query = createClassGroupCenterQueryV1(repository, { pageSize: 1 });

    const result = await query.get(contextA, classGroupId);

    expect(result).toMatchObject({
      academicYearId: yearA,
      classGroup: { value: { id: classGroupId, code: '6S' }, version: 2 },
      students: [
        {
          enrollment: { value: { id: enrollmentA, position: 'historical' } },
          student: { value: { id: studentA, displayName: 'Estudante Sintético A' } },
          statusHistory: [
            { value: { id: 'student-status-event:class-center:a', status: 'active' } },
            { value: { id: 'student-status-event:class-center:z', status: 'transferred' } },
          ],
        },
        {
          enrollment: { value: { id: enrollmentB, position: 'current' } },
          student: { value: { id: studentB, displayName: 'Estudante Sintético B' } },
          statusHistory: [],
        },
      ],
      assignments: [
        {
          assignment: {
            value: { id: assignmentId, confirmationOrigin: 'imported-source' },
          },
          teacher: { value: { id: teacherId } },
          subject: { value: { id: subjectId } },
          assessmentComponents: [
            { value: { id: 'assessment-component:class-center:a', term: 1 } },
            { value: { id: 'assessment-component:class-center:b', term: 2 } },
          ],
        },
      ],
    });
    expect(repository.list.mock.calls.filter(([, kind]) => kind === 'student')).toHaveLength(2);
    expect(
      repository.list.mock.calls.filter(([, kind]) => kind === 'assessment-component'),
    ).toHaveLength(2);

    await expect(query.get(contextB, classGroupId)).resolves.toMatchObject({
      academicYearId: yearB,
      classGroup: { value: { code: '7S' } },
      students: [{ enrollment: { value: { academicYearId: yearB } }, student: null }],
      assignments: [],
    });
  });

  it('retorna null para turma ausente sem varrer relações', async () => {
    const repository = memoryRepository(fixtures());
    await expect(
      createClassGroupCenterQueryV1(repository).get(
        contextA,
        'class-group:class-center:missing' as ClassGroupId,
      ),
    ).resolves.toBeNull();
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('mantém referências incompletas como null e listas vazias sem inferência', async () => {
    const repository = memoryRepository([
      stored(yearA, {
        kind: 'class-group',
        value: {
          id: classGroupId,
          academicYearId: yearA,
          code: 'NOME IGUAL AO DOCENTE',
          grade: '6',
          section: 'S',
        },
      }),
      stored(yearA, {
        kind: 'enrollment',
        value: {
          id: enrollmentA,
          academicYearId: yearA,
          studentId: studentA,
          classGroupId,
          effectivePeriod: {},
          position: 'current',
        },
      }),
      stored(yearA, {
        kind: 'teaching-assignment',
        value: {
          id: assignmentId,
          academicYearId: yearA,
          teacherId,
          classGroupId,
          subjectId,
          effectivePeriod: {},
          confirmationOrigin: 'imported-source',
        },
      }),
    ]);

    await expect(
      createClassGroupCenterQueryV1(repository).get(contextA, classGroupId),
    ).resolves.toMatchObject({
      students: [{ student: null, statusHistory: [] }],
      assignments: [{ teacher: null, subject: null, assessmentComponents: [] }],
    });
  });

  it('recusa paginação inválida e ciclos de cursor com erro estável', async () => {
    const repository = memoryRepository(fixtures());
    expect(() => createClassGroupCenterQueryV1(repository, { pageSize: 101 })).toThrow(
      ClassGroupCenterReadModelErrorV1,
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
      createClassGroupCenterQueryV1(repository, { pageSize: 1 }).get(contextA, classGroupId),
    ).rejects.toMatchObject({ code: 'cursor-cycle' });
  });
});
