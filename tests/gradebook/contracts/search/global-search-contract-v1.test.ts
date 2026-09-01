import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  StudentId,
  SubjectId,
  TeacherId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1,
  GLOBAL_SEARCH_CONTRACT_V1,
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_MAX_LIMIT_V1,
  GLOBAL_SEARCH_NON_DISCLOSURE_OUTCOMES_V1,
  GLOBAL_SEARCH_ORDER_V1,
  GLOBAL_SEARCH_REQUIRED_CAPABILITY_V1,
  compareGlobalSearchResultsV1,
  inspectGlobalSearchRequestV1,
  isGlobalSearchLimitV1,
  isGlobalSearchQueryEmptyV1,
  isGlobalSearchResultOrderV1,
  isGlobalSearchResultPresentableV1,
  isGlobalSearchResultsPageValidV1,
  isGlobalSearchScopeSufficientV1,
  type GlobalSearchCursorV1,
  type GlobalSearchNonDisclosureV1,
  type GlobalSearchRequestV1,
  type GlobalSearchResultV1,
  type GlobalSearchResultsPageV1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const firstCursor = 'cursor:synthetic:first-page' as GlobalSearchCursorV1;

const studentA = {
  kind: 'student',
  id: 'student:synthetic:a' as StudentId,
  displayName: 'Aluno Sintético A',
} satisfies GlobalSearchResultV1;

const studentB = {
  kind: 'student',
  id: 'student:synthetic:b' as StudentId,
  displayName: 'Aluno Sintético B',
} satisfies GlobalSearchResultV1;

const classGroup = {
  kind: 'class-group',
  id: 'class-group:synthetic:6a' as ClassGroupId,
  code: '6A',
} satisfies GlobalSearchResultV1;

const teacher = {
  kind: 'teacher',
  id: 'teacher:synthetic:a' as TeacherId,
  displayName: 'Professor Sintético A',
} satisfies GlobalSearchResultV1;

const subject = {
  kind: 'subject',
  id: 'subject:synthetic:math' as SubjectId,
  displayName: 'Componente Sintético A',
} satisfies GlobalSearchResultV1;

function request(overrides: Partial<GlobalSearchRequestV1> = {}): GlobalSearchRequestV1 {
  return {
    contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
    academicYearId,
    query: 'sintético',
    scope: { kinds: ['student', 'class-group', 'teacher', 'subject'] },
    page: { limit: 20, cursor: null },
    order: GLOBAL_SEARCH_ORDER_V1,
    ...overrides,
  };
}

describe('authorized academic global search contract v1', () => {
  it('reuses the existing server capability without freezing a competing role policy', () => {
    expect(GLOBAL_SEARCH_REQUIRED_CAPABILITY_V1).toBe('gradebook.persistence.admin');
    expect(GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1).toEqual({
      enforcement: 'server',
      requiredCapability: 'gradebook.persistence.admin',
      authorizationContext: 'server-issued-opaque',
      clientAuthorizationClaims: 'forbidden',
    });
    expect(GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1).not.toHaveProperty('roles');
    expect(GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1).not.toHaveProperty('authorized');
  });

  it('requires an explicit annual context, scope, page and deterministic order', () => {
    const value = request();

    expect(value).toEqual({
      contractVersion: 1,
      academicYearId,
      query: 'sintético',
      scope: { kinds: ['student', 'class-group', 'teacher', 'subject'] },
      page: { limit: 20, cursor: null },
      order: 'kind-presentation-id-ascending-code-unit',
    });
    expect(value).not.toHaveProperty('href');
    expect(value).not.toHaveProperty('route');
    expect(value).not.toHaveProperty('url');
    expect(value).not.toHaveProperty('roles');
    expect(value).not.toHaveProperty('capabilities');
    expect(value).not.toHaveProperty('authorized');
    expect(inspectGlobalSearchRequestV1(value)).toBe('ready');
  });

  it('freezes only minimal presentation fields for the four result kinds', () => {
    expect(Object.keys(studentA).sort()).toEqual(['displayName', 'id', 'kind']);
    expect(Object.keys(classGroup).sort()).toEqual(['code', 'id', 'kind']);
    expect(Object.keys(teacher).sort()).toEqual(['displayName', 'id', 'kind']);
    expect(Object.keys(subject).sort()).toEqual(['displayName', 'id', 'kind']);
    expect(isGlobalSearchResultPresentableV1(studentA)).toBe(true);
    expect(
      isGlobalSearchResultPresentableV1({
        kind: 'student',
        id: 'student:synthetic:empty-name' as StudentId,
        displayName: '   ',
      }),
    ).toBe(false);

    const serialized = JSON.stringify([studentA, classGroup, teacher, subject]);
    for (const forbidden of [
      'grade',
      'result',
      'evidence',
      'sourceNames',
      'sourceIdentityMarks',
      'confirmationOrigin',
      'authorityMode',
      'enrollment',
      'assignment',
      'href',
      'route',
      'url',
      'searchText',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('orders by fixed kind, raw presentation and id without locale or fuzzy matching', () => {
    const unordered: GlobalSearchResultV1[] = [subject, teacher, studentB, classGroup, studentA];
    const ordered = [...unordered].sort(compareGlobalSearchResultsV1);

    expect(ordered).toEqual([studentA, studentB, classGroup, teacher, subject]);
    expect(isGlobalSearchResultOrderV1(ordered)).toBe(true);
    expect(isGlobalSearchResultOrderV1(unordered)).toBe(false);
    expect(GLOBAL_SEARCH_CONTRACT_V1.querySemantics).toEqual({
      matching: 'outside-contract',
      fuzzyMatching: 'forbidden',
      identityHeuristics: 'forbidden',
      academicRules: 'forbidden',
    });
  });

  it('validates the explicit limit and opaque cursor boundaries', () => {
    expect(isGlobalSearchLimitV1(1)).toBe(true);
    expect(isGlobalSearchLimitV1(GLOBAL_SEARCH_MAX_LIMIT_V1)).toBe(true);
    expect(isGlobalSearchLimitV1(0)).toBe(false);
    expect(isGlobalSearchLimitV1(GLOBAL_SEARCH_MAX_LIMIT_V1 + 1)).toBe(false);
    expect(isGlobalSearchLimitV1(1.5)).toBe(false);

    expect(inspectGlobalSearchRequestV1(request({ page: { limit: 0, cursor: null } }))).toBe(
      'invalid-request',
    );
    expect(
      inspectGlobalSearchRequestV1(
        request({ page: { limit: 20, cursor: '   ' as GlobalSearchCursorV1 } }),
      ),
    ).toBe('invalid-request');
  });

  it('classifies empty queries and insufficient scopes without matching or identity inference', () => {
    expect(isGlobalSearchQueryEmptyV1('')).toBe(true);
    expect(isGlobalSearchQueryEmptyV1(' \n\t ')).toBe(true);
    expect(isGlobalSearchQueryEmptyV1('Aluno Sintético')).toBe(false);
    expect(inspectGlobalSearchRequestV1(request({ query: '   ' }))).toBe('empty-query');

    expect(isGlobalSearchScopeSufficientV1({ kinds: [] })).toBe(false);
    expect(isGlobalSearchScopeSufficientV1({ kinds: ['student', 'student'] })).toBe(false);
    expect(isGlobalSearchScopeSufficientV1({ kinds: ['student', 'subject'] })).toBe(true);
    expect(inspectGlobalSearchRequestV1(request({ scope: { kinds: [] } }))).toBe(
      'insufficient-scope',
    );
  });

  it('uses an identical non-disclosing data shape for empty, absent, insufficient and unauthorized cases', () => {
    const responses = GLOBAL_SEARCH_NON_DISCLOSURE_OUTCOMES_V1.map(
      (outcome) =>
        ({
          contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
          outcome,
          items: [] as const,
          nextCursor: null,
        }) satisfies GlobalSearchNonDisclosureV1,
    );

    for (const response of responses) {
      expect(Object.keys(response).sort()).toEqual([
        'contractVersion',
        'items',
        'nextCursor',
        'outcome',
      ]);
      expect(response.items).toEqual([]);
      expect(response.nextCursor).toBeNull();
      expect(response).not.toHaveProperty('academicYearId');
      expect(response).not.toHaveProperty('query');
      expect(response).not.toHaveProperty('count');
      expect(response).not.toHaveProperty('total');
      expect(response).not.toHaveProperty('entity');
    }
  });

  it('represents a bounded, ordered result page without totals or navigation data', () => {
    const page = {
      contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
      outcome: 'results',
      academicYearId,
      order: GLOBAL_SEARCH_ORDER_V1,
      limit: 5,
      items: [studentA, studentB, classGroup, teacher, subject],
      nextCursor: firstCursor,
    } as const satisfies GlobalSearchResultsPageV1;

    expect(isGlobalSearchResultsPageValidV1(page)).toBe(true);
    expect(page).not.toHaveProperty('total');
    expect(page).not.toHaveProperty('href');
    expect(page).not.toHaveProperty('route');
    expect(page).not.toHaveProperty('url');

    const invalidOrder = {
      ...page,
      items: [teacher, studentA] as const,
    } satisfies GlobalSearchResultsPageV1;
    expect(isGlobalSearchResultsPageValidV1(invalidOrder)).toBe(false);
  });
});
