import { describe, expect, it, vi } from 'vitest';

import {
  AcademicGlobalSearchReadModelErrorV1,
  createAcademicGlobalSearchReadModelV1,
} from '../../../../../server/gradebook/application/read-models/search/academic-global-search-read-model-v1';
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
  type GlobalSearchResponseV1,
} from '../../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import type {
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const yearA = 'academic-year:search:2026' as AcademicYearId;
const yearB = 'academic-year:search:2027' as AcademicYearId;
const instant = '2026-09-01T14:00:00.000Z';

const studentA = 'student:search:a' as StudentId;
const studentB = 'student:search:b' as StudentId;
const classGroupA = 'class-group:search:a' as ClassGroupId;
const teacherA = 'teacher:search:a' as TeacherId;
const subjectA = 'subject:search:a' as SubjectId;

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

function memoryRepository(values: readonly StoredEntity[]): InstrumentedRepository {
  const get = vi.fn<AcademicEntityRepositoryV1['get']>(
    async (_context: AcademicPersistenceContextV1, _reference: AcademicEntityReferenceV1) => {
      throw new Error('A pesquisa não deve executar consultas individuais.');
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
      throw new Error('Synthetic read-only repository.');
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
        sourceIdentityMarks: ['marca-privada-b'],
      },
    }),
    stored(yearA, {
      kind: 'student',
      value: {
        id: studentA,
        displayName: 'Aluno Sintético',
        sourceNames: ['ALUNO SINTÉTICO A'],
        sourceIdentityMarks: ['marca-privada-a'],
      },
    }),
    stored(yearA, {
      kind: 'student',
      value: {
        id: 'student:search:hidden-alias' as StudentId,
        displayName: 'Apresentação neutra',
        sourceNames: ['SEGREDO OCULTO SINTÉTICO'],
        sourceIdentityMarks: ['sintetico-nao-pesquisar'],
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
      kind: 'class-group',
      value: {
        id: 'class-group:search:hidden-grade' as ClassGroupId,
        academicYearId: yearA,
        code: '7A',
        grade: 'Sintético',
        section: 'B',
      },
    }),
    stored(yearA, {
      kind: 'teacher',
      value: {
        id: teacherA,
        displayName: 'Professor Sintético',
        sourceNames: ['PROFESSOR ORIGEM PRIVADA'],
        status: 'active',
      },
    }),
    stored(yearA, {
      kind: 'subject',
      value: {
        id: subjectA,
        code: 'CMP-A',
        displayName: 'Componente Sintético',
        shortName: 'CMP',
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

function request(
  overrides: Partial<GlobalSearchRequestV1> = {},
): GlobalSearchRequestV1 {
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

function expectNonDisclosure(
  response: GlobalSearchResponseV1,
  outcome: Exclude<GlobalSearchResponseV1['outcome'], 'results'>,
): void {
  expect(response).toEqual({
    contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
    outcome,
    items: [],
    nextCursor: null,
  });
}

describe('read model local da pesquisa acadêmica V1', () => {
  it('pagina o repositório, pesquisa os quatro tipos e retorna somente campos mínimos', async () => {
    const repository = memoryRepository(fixtures());
    const query = createAcademicGlobalSearchReadModelV1(repository, { repositoryPageSize: 1 });

    const response = await query.search(request());

    expect(query.authorizationPolicy).toBe(GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1);
    expect(response).toEqual({
      contractVersion: 1,
      outcome: 'results',
      academicYearId: yearA,
      order: GLOBAL_SEARCH_ORDER_V1,
      limit: 20,
      items: [
        { kind: 'student', id: studentA, displayName: 'Aluno Sintético' },
        { kind: 'student', id: studentB, displayName: 'Aluno Sintético' },
        { kind: 'class-group', id: classGroupA, code: '6A Sintético' },
        { kind: 'teacher', id: teacherA, displayName: 'Professor Sintético' },
        { kind: 'subject', id: subjectA, displayName: 'Componente Sintético' },
      ],
      nextCursor: null,
    });
    expect(repository.get).not.toHaveBeenCalled();
    const listedKinds = repository.list.mock.calls.map(([, kind]) => kind);
    expect(new Set(listedKinds)).toEqual(
      new Set(['student', 'class-group', 'teacher', 'subject']),
    );
    expect(listedKinds.filter((kind) => kind === 'student')).toHaveLength(3);
    expect(listedKinds.filter((kind) => kind === 'class-group')).toHaveLength(2);
    expect(listedKinds.filter((kind) => kind === 'teacher')).toHaveLength(1);
    expect(listedKinds.filter((kind) => kind === 'subject')).toHaveLength(1);

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'sourceNames',
      'sourceIdentityMarks',
      'grade',
      'section',
      'shift',
      'status',
      'recordedAt',
      'version',
      'SEGREDO',
      'PRIVADA',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('mantém paginação externa estável e sem duplicar resultados', async () => {
    const repository = memoryRepository(fixtures());
    const query = createAcademicGlobalSearchReadModelV1(repository, { repositoryPageSize: 2 });

    const first = await query.search(request({ page: { limit: 2, cursor: null } }));
    expect(first.outcome).toBe('results');
    if (first.outcome !== 'results') throw new Error('Unexpected synthetic result.');
    expect(first.items.map(({ id }) => id)).toEqual([studentA, studentB]);
    expect(first.nextCursor).not.toBeNull();
    expect(first.nextCursor).not.toContain(studentB);
    expect(first.nextCursor).not.toContain('sintetico');

    const second = await query.search(
      request({ page: { limit: 2, cursor: first.nextCursor } }),
    );
    expect(second.outcome).toBe('results');
    if (second.outcome !== 'results') throw new Error('Unexpected synthetic result.');
    expect(second.items.map(({ id }) => id)).toEqual([classGroupA, teacherA]);
    expect(second.nextCursor).not.toBeNull();

    const third = await query.search(
      request({ page: { limit: 2, cursor: second.nextCursor } }),
    );
    expect(third.outcome).toBe('results');
    if (third.outcome !== 'results') throw new Error('Unexpected synthetic result.');
    expect(third.items.map(({ id }) => id)).toEqual([subjectA]);
    expect(third.nextCursor).toBeNull();

    const allIds = [...first.items, ...second.items, ...third.items].map(({ id }) => id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('isola estritamente o contexto anual recebido no contrato', async () => {
    const repository = memoryRepository(fixtures());
    const query = createAcademicGlobalSearchReadModelV1(repository);

    const response = await query.search(
      request({ academicYearId: yearB, query: '2027', scope: { kinds: ['student', 'class-group'] } }),
    );

    expect(response).toMatchObject({
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

  it('não consulta o repositório para pedido vazio, escopo insuficiente ou cursor inválido', async () => {
    const repository = memoryRepository(fixtures());
    const query = createAcademicGlobalSearchReadModelV1(repository);

    expectNonDisclosure(await query.search(request({ query: '   ' })), 'empty-query');
    expectNonDisclosure(await query.search(request({ query: '\u0301' })), 'empty-query');
    expectNonDisclosure(
      await query.search(request({ scope: { kinds: [] } })),
      'insufficient-scope',
    );
    expectNonDisclosure(
      await query.search(
        request({ page: { limit: 20, cursor: 'cursor-invalido' as GlobalSearchCursorV1 } }),
      ),
      'invalid-request',
    );
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.get).not.toHaveBeenCalled();
  });

  it('pesquisa somente a apresentação autorizada, sem usar aliases, marcas ou dados da turma', async () => {
    const repository = memoryRepository(fixtures());
    const query = createAcademicGlobalSearchReadModelV1(repository);

    expectNonDisclosure(await query.search(request({ query: 'oculto' })), 'no-results');
    expectNonDisclosure(await query.search(request({ query: 'morning' })), 'no-results');
    expectNonDisclosure(await query.search(request({ query: 'marca-privada' })), 'no-results');
  });

  it('falha fechada e sem payload quando o repositório não fornece dados seguros', async () => {
    const repository = memoryRepository(fixtures());
    repository.list.mockRejectedValue(
      new Error('ERRO INTERNO COM NOME, NOTA 99 E PAYLOAD QUE NÃO PODE VAZAR'),
    );
    const query = createAcademicGlobalSearchReadModelV1(repository);

    const response = await query.search(request());

    expectNonDisclosure(response, 'insufficient-data');
    expect(JSON.stringify(response)).not.toContain('NOTA 99');
    expect(JSON.stringify(response)).not.toContain('PAYLOAD');
  });

  it('lista somente os tipos solicitados e rejeita paginação interna inválida', async () => {
    const repository = memoryRepository(fixtures());
    const query = createAcademicGlobalSearchReadModelV1(repository);

    await expect(
      query.search(request({ query: 'componente', scope: { kinds: ['subject'] } })),
    ).resolves.toMatchObject({
      outcome: 'results',
      items: [{ kind: 'subject', id: subjectA }],
    });
    expect(repository.list.mock.calls.map(([, kind]) => kind)).toEqual(['subject']);
    expect(() =>
      createAcademicGlobalSearchReadModelV1(repository, { repositoryPageSize: 0 }),
    ).toThrow(AcademicGlobalSearchReadModelErrorV1);
  });
});
