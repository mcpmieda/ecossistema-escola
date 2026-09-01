import { describe, expect, it, vi } from 'vitest';

import { createGradebookOperationalReadModelsV1 } from '../../../../../server/gradebook/application/read-models/composition/operational-read-models-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  StudentId,
  SubjectId,
  TeacherId,
} from '../../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1,
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchCursorV1,
  type GlobalSearchRequestV1,
} from '../../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import type {
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  PersistenceUnitOfWorkV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const yearA = 'academic-year:facade-search:2026' as AcademicYearId;
const yearB = 'academic-year:facade-search:2027' as AcademicYearId;
const instant = '2026-09-01T15:40:00.000Z';

const studentA = 'student:facade-search:a' as StudentId;
const studentB = 'student:facade-search:b' as StudentId;
const classGroupA = 'class-group:facade-search:a' as ClassGroupId;
const teacherA = 'teacher:facade-search:a' as TeacherId;
const subjectA = 'subject:facade-search:a' as SubjectId;

interface StoredEntity {
  readonly academicYearId: AcademicYearId;
  readonly record: VersionedRecordV1<AcademicEntityRecordV1>;
}

type InstrumentedRepository = AcademicEntityRepositoryV1 & {
  readonly get: ReturnType<typeof vi.fn<AcademicEntityRepositoryV1['get']>>;
  readonly list: ReturnType<typeof vi.fn<AcademicEntityRepositoryV1['list']>>;
};

function versioned(value: AcademicEntityRecordV1): VersionedRecordV1<AcademicEntityRecordV1> {
  return { value, version: 1, recordedAt: instant };
}

function stored(academicYearId: AcademicYearId, value: AcademicEntityRecordV1): StoredEntity {
  return { academicYearId, record: versioned(value) };
}

function repositoryFor(values: readonly StoredEntity[]): InstrumentedRepository {
  const get = vi.fn<AcademicEntityRepositoryV1['get']>(
    async (_context: AcademicPersistenceContextV1, _reference: AcademicEntityReferenceV1) => {
      throw new Error('A pesquisa composta não deve executar consultas individuais.');
    },
  );
  const list = vi.fn<AcademicEntityRepositoryV1['list']>(async (context, kind, page) => {
    const matching = values
      .filter(
        ({ academicYearId, record }) =>
          academicYearId === context.academicYearId && record.value.kind === kind,
      )
      .map(({ record }) => record);
    const offset =
      page.cursor === null || page.cursor === undefined
        ? 0
        : Number.parseInt(page.cursor.slice('cursor:'.length), 10);
    const items = matching.slice(offset, offset + page.limit);
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
      throw new Error('Repositório sintético somente para leitura.');
    }),
  };
}

function fixtures(): readonly StoredEntity[] {
  return [
    stored(yearA, {
      kind: 'student',
      value: {
        id: studentB,
        displayName: 'Aluno Sintético',
        sourceNames: ['ALUNO SINTÉTICO B'],
        sourceIdentityMarks: ['marca-sintetica-b'],
      },
    }),
    stored(yearA, {
      kind: 'student',
      value: {
        id: studentA,
        displayName: 'Aluno Sintético',
        sourceNames: ['ALUNO SINTÉTICO A'],
        sourceIdentityMarks: ['marca-sintetica-a'],
      },
    }),
    stored(yearA, {
      kind: 'class-group',
      value: {
        id: classGroupA,
        academicYearId: yearA,
        code: '6A Sintético',
        grade: '6',
        section: 'A',
        shift: 'morning',
      },
    }),
    stored(yearA, {
      kind: 'teacher',
      value: {
        id: teacherA,
        displayName: 'Professor Sintético',
        sourceNames: ['PROFESSOR SINTÉTICO'],
        status: 'active',
      },
    }),
    stored(yearA, {
      kind: 'subject',
      value: {
        id: subjectA,
        code: 'CMP-SYN',
        displayName: 'Componente Sintético',
        shortName: 'SYN',
        status: 'active',
      },
    }),
    stored(yearB, {
      kind: 'student',
      value: {
        id: studentA,
        displayName: 'Aluno Sintético 2027',
        sourceNames: ['ALUNO SINTÉTICO 2027'],
      },
    }),
    stored(yearB, {
      kind: 'class-group',
      value: {
        id: classGroupA,
        academicYearId: yearB,
        code: '7B Sintético 2027',
        grade: '7',
        section: 'B',
      },
    }),
  ];
}

function request(overrides: Partial<GlobalSearchRequestV1> = {}): GlobalSearchRequestV1 {
  return {
    contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
    academicYearId: yearA,
    query: 'sintetico',
    scope: { kinds: ['student', 'class-group', 'teacher', 'subject'] },
    page: { limit: 20, cursor: null },
    order: GLOBAL_SEARCH_ORDER_V1,
    ...overrides,
  };
}

function facade(repository: AcademicEntityRepositoryV1) {
  return createGradebookOperationalReadModelsV1(
    { entities: repository } as PersistenceUnitOfWorkV1,
    { pageSize: 1 },
  );
}

describe('pesquisa acadêmica na fachada operacional V1', () => {
  it('compõe os quatro tipos, a ordem e a paginação sem duplicar consulta ou payload', async () => {
    const repository = repositoryFor(fixtures());
    const readModels = facade(repository);

    expect(readModels.search.authorizationPolicy).toBe(GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1);

    const first = await readModels.search.search(request({ page: { limit: 2, cursor: null } }));
    expect(first).toMatchObject({
      outcome: 'results',
      academicYearId: yearA,
      items: [
        { kind: 'student', id: studentA, displayName: 'Aluno Sintético' },
        { kind: 'student', id: studentB, displayName: 'Aluno Sintético' },
      ],
    });
    if (first.outcome !== 'results') throw new Error('Resultado sintético inesperado.');
    expect(first.nextCursor).not.toBeNull();

    const second = await readModels.search.search(
      request({ page: { limit: 2, cursor: first.nextCursor } }),
    );
    expect(second).toMatchObject({
      outcome: 'results',
      items: [
        { kind: 'class-group', id: classGroupA, code: '6A Sintético' },
        { kind: 'teacher', id: teacherA, displayName: 'Professor Sintético' },
      ],
    });
    if (second.outcome !== 'results') throw new Error('Resultado sintético inesperado.');

    const third = await readModels.search.search(
      request({ page: { limit: 2, cursor: second.nextCursor } }),
    );
    expect(third).toMatchObject({
      outcome: 'results',
      items: [{ kind: 'subject', id: subjectA, displayName: 'Componente Sintético' }],
      nextCursor: null,
    });

    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.list.mock.calls.every(([, , page]) => page.limit === 1)).toBe(true);

    const serialized = JSON.stringify([first, second, third]);
    for (const forbidden of [
      'sourceNames',
      'sourceIdentityMarks',
      'grade',
      'section',
      'shift',
      'status',
      'recordedAt',
      'version',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('preserva o isolamento anual pela mesma porta de entidades da UoW', async () => {
    const repository = repositoryFor(fixtures());
    const readModels = facade(repository);

    await expect(
      readModels.search.search(
        request({
          academicYearId: yearB,
          query: '2027',
          scope: { kinds: ['student', 'class-group'] },
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'results',
      academicYearId: yearB,
      items: [
        { kind: 'student', id: studentA, displayName: 'Aluno Sintético 2027' },
        { kind: 'class-group', id: classGroupA, code: '7B Sintético 2027' },
      ],
    });
    expect(repository.list.mock.calls.every(([context]) => context.academicYearId === yearB)).toBe(
      true,
    );
  });

  it('mantém vazios, ausência, escopo insuficiente e cursor inválido sem divulgação', async () => {
    const repository = repositoryFor(fixtures());
    const readModels = facade(repository);

    await expect(readModels.search.search(request({ query: '   ' }))).resolves.toEqual({
      contractVersion: 1,
      outcome: 'empty-query',
      items: [],
      nextCursor: null,
    });
    await expect(
      readModels.search.search(request({ scope: { kinds: [] } })),
    ).resolves.toEqual({
      contractVersion: 1,
      outcome: 'insufficient-scope',
      items: [],
      nextCursor: null,
    });
    await expect(
      readModels.search.search(
        request({ page: { limit: 20, cursor: 'cursor-invalido' as GlobalSearchCursorV1 } }),
      ),
    ).resolves.toEqual({
      contractVersion: 1,
      outcome: 'invalid-request',
      items: [],
      nextCursor: null,
    });
    expect(repository.list).not.toHaveBeenCalled();

    await expect(readModels.search.search(request({ query: 'ausente' }))).resolves.toEqual({
      contractVersion: 1,
      outcome: 'no-results',
      items: [],
      nextCursor: null,
    });
  });
});
