import { describe, expect, it, vi } from 'vitest';

import {
  createStudentCenterQueryV1,
  StudentCenterReadModelErrorV1,
} from '../../../../../server/gradebook/application/read-models/student/student-center-read-model-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  StudentStatusEventId,
} from '../../../../../shared/gradebook-contracts/entities';
import type {
  AcademicEntityKindV1,
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const yearA = 'academic-year:student-center:2026' as AcademicYearId;
const yearB = 'academic-year:student-center:2027' as AcademicYearId;
const contextA = { academicYearId: yearA } satisfies AcademicPersistenceContextV1;
const contextB = { academicYearId: yearB } satisfies AcademicPersistenceContextV1;
const studentId = 'student:student-center:001' as StudentId;
const otherStudentId = 'student:student-center:other' as StudentId;
const enrollmentA = 'enrollment:student-center:a' as EnrollmentId;
const enrollmentB = 'enrollment:student-center:b' as EnrollmentId;
const classA = 'class-group:student-center:a' as ClassGroupId;
const classB = 'class-group:student-center:b' as ClassGroupId;
const instant = '2026-09-01T13:00:00.000Z';

interface StoredEntity {
  readonly academicYearId: AcademicYearId;
  readonly record: VersionedRecordV1<AcademicEntityRecordV1>;
}

function versioned(
  value: AcademicEntityRecordV1,
  version = 1,
): VersionedRecordV1<AcademicEntityRecordV1> {
  return { value, version, recordedAt: instant };
}

function stored(
  academicYearId: AcademicYearId,
  value: AcademicEntityRecordV1,
  version = 1,
): StoredEntity {
  return { academicYearId, record: versioned(value, version) };
}

function entityId(record: AcademicEntityRecordV1): string {
  return record.value.id;
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
          entityId(record.value) === reference.id,
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
      request.cursor === null || request.cursor === undefined
        ? 0
        : Number.parseInt(request.cursor.slice('cursor:'.length), 10);
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
        kind: 'student',
        value: {
          id: studentId,
          displayName: 'Estudante Sintético',
          sourceNames: ['ESTUDANTE SINTÉTICO'],
        },
      },
      2,
    ),
    stored(yearA, {
      kind: 'student',
      value: {
        id: otherStudentId,
        displayName: 'Outro Estudante Sintético',
        sourceNames: ['OUTRO ESTUDANTE SINTÉTICO'],
      },
    }),
    stored(yearA, {
      kind: 'enrollment',
      value: {
        id: enrollmentB,
        academicYearId: yearA,
        studentId,
        classGroupId: classB,
        effectivePeriod: { startsOn: '2026-06-01' },
        position: 'current',
      },
    }),
    stored(
      yearA,
      {
        kind: 'enrollment',
        value: {
          id: enrollmentA,
          academicYearId: yearA,
          studentId,
          classGroupId: classA,
          effectivePeriod: { startsOn: '2026-02-01', endsOn: '2026-05-31' },
          position: 'historical',
        },
      },
      3,
    ),
    stored(yearA, {
      kind: 'enrollment',
      value: {
        id: 'enrollment:student-center:unrelated' as EnrollmentId,
        academicYearId: yearA,
        studentId: otherStudentId,
        classGroupId: classA,
        effectivePeriod: {},
        position: 'current',
      },
    }),
    stored(yearA, {
      kind: 'class-group',
      value: {
        id: classA,
        academicYearId: yearA,
        code: '6A',
        grade: '6',
        section: 'A',
      },
    }),
    stored(yearA, {
      kind: 'class-group',
      value: {
        id: classB,
        academicYearId: yearA,
        code: '6B',
        grade: '6',
        section: 'B',
        shift: 'morning',
      },
    }),
    stored(yearA, {
      kind: 'student-status-event',
      value: {
        id: 'student-status-event:student-center:z' as StudentStatusEventId,
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
        id: 'student-status-event:student-center:a' as StudentStatusEventId,
        academicYearId: yearA,
        enrollmentId: enrollmentA,
        status: 'active',
        sourceText: 'SITUAÇÃO SINTÉTICA ATIVA',
        occurredOn: '2026-02-01',
      },
    }),
    stored(yearA, {
      kind: 'student-status-event',
      value: {
        id: 'student-status-event:student-center:no-date' as StudentStatusEventId,
        academicYearId: yearA,
        enrollmentId: enrollmentB,
        status: 'active',
        sourceText: 'SITUAÇÃO SINTÉTICA SEM DATA',
      },
    }),
    stored(yearB, {
      kind: 'student',
      value: {
        id: studentId,
        displayName: 'Estudante Sintético em Outro Ano',
        sourceNames: ['ESTUDANTE SINTÉTICO EM OUTRO ANO'],
      },
    }),
    stored(yearB, {
      kind: 'enrollment',
      value: {
        id: 'enrollment:student-center:other-year' as EnrollmentId,
        academicYearId: yearB,
        studentId,
        classGroupId: 'class-group:student-center:other-year' as ClassGroupId,
        effectivePeriod: {},
        position: 'current',
      },
    }),
  ];
}

describe('read model local da Central do Aluno V1', () => {
  it('pagina, isola o ano e ordena matrículas e situações sintéticas', async () => {
    const repository = memoryRepository(fixtures());
    const query = createStudentCenterQueryV1(repository, { pageSize: 1 });

    const result = await query.get(contextA, studentId);

    expect(result).toMatchObject({
      academicYearId: yearA,
      student: {
        value: { id: studentId, displayName: 'Estudante Sintético' },
        version: 2,
      },
      enrollments: [
        {
          enrollment: { value: { id: enrollmentA, position: 'historical' }, version: 3 },
          classGroup: { value: { id: classA, code: '6A' }, version: 1 },
          statusHistory: [
            { value: { id: 'student-status-event:student-center:a', status: 'active' } },
            { value: { id: 'student-status-event:student-center:z', status: 'transferred' } },
          ],
        },
        {
          enrollment: { value: { id: enrollmentB, position: 'current' } },
          classGroup: { value: { id: classB, code: '6B' } },
          statusHistory: [
            { value: { id: 'student-status-event:student-center:no-date', status: 'active' } },
          ],
        },
      ],
    });
    expect(result?.enrollments).toHaveLength(2);
    expect(repository.list.mock.calls.filter(([, kind]) => kind === 'enrollment')).toHaveLength(3);
    expect(
      repository.list.mock.calls.filter(([, kind]) => kind === 'student-status-event'),
    ).toHaveLength(3);

    await expect(query.get(contextB, studentId)).resolves.toMatchObject({
      academicYearId: yearB,
      student: { value: { displayName: 'Estudante Sintético em Outro Ano' } },
      enrollments: [{ enrollment: { value: { academicYearId: yearB } } }],
    });
  });

  it('retorna null para estudante ausente sem varrer entidades relacionadas', async () => {
    const repository = memoryRepository(fixtures());
    const query = createStudentCenterQueryV1(repository, { pageSize: 1 });

    await expect(
      query.get(contextA, 'student:student-center:missing' as StudentId),
    ).resolves.toBeNull();
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('mantém turma ausente como null e não infere identidade por nome ou posição', async () => {
    const missingClass = 'class-group:student-center:missing' as ClassGroupId;
    const repository = memoryRepository([
      stored(yearA, {
        kind: 'student',
        value: {
          id: studentId,
          displayName: '6Z',
          sourceNames: ['TURMA 6Z'],
          sourceIdentityMarks: ['synthetic-position:6'],
        },
      }),
      stored(yearA, {
        kind: 'enrollment',
        value: {
          id: enrollmentA,
          academicYearId: yearA,
          studentId,
          classGroupId: missingClass,
          effectivePeriod: {},
          position: 'current',
          sourcePosition: 6,
        },
      }),
    ]);

    await expect(
      createStudentCenterQueryV1(repository).get(contextA, studentId),
    ).resolves.toMatchObject({
      enrollments: [{ classGroup: null, statusHistory: [] }],
    });
  });

  it('recusa paginação inválida e ciclos de cursor com erro estável', async () => {
    const repository = memoryRepository(fixtures());
    expect(() => createStudentCenterQueryV1(repository, { pageSize: 0 })).toThrow(
      StudentCenterReadModelErrorV1,
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
      createStudentCenterQueryV1(repository, { pageSize: 1 }).get(contextA, studentId),
    ).rejects.toMatchObject({ code: 'cursor-cycle' });
  });
});
