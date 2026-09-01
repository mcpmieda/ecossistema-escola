import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  StudentId,
  SubjectId,
  TeacherId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_V1,
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchCursorV1,
  type GlobalSearchResultV1,
  type GlobalSearchResultsPageV1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import {
  OPERATIONAL_WORKSPACE_CONTRACT_V1,
  OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
  OPERATIONAL_WORKSPACE_FORBIDDEN_CLIENT_FIELDS_V1,
  OPERATIONAL_WORKSPACE_NAVIGATION_KINDS_V1,
  OPERATIONAL_WORKSPACE_STATES_V1,
  containsOperationalWorkspaceForbiddenClientFieldV1,
  isOperationalWorkspaceAcademicYearContextValidV1,
  isOperationalWorkspaceAvailabilityValidV1,
  isOperationalWorkspaceNavigationIntentValidV1,
  isOperationalWorkspaceSearchRequestForContextV1,
  isOperationalWorkspaceSearchResponseValidV1,
  navigationIntentFromGlobalSearchResultV1,
  type OperationalWorkspaceAcademicYearContextV1,
  type OperationalWorkspaceAvailabilityV1,
  type OperationalWorkspaceNavigationIntentV1,
  type OperationalWorkspaceSearchRequestV1,
  type OperationalWorkspaceSearchResponseV1,
  type OperationalWorkspaceSearchResultV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';

const year2026 = 'academic-year:synthetic:2026' as AcademicYearId;
const year2027 = 'academic-year:synthetic:2027' as AcademicYearId;
const nextCursor = 'cursor:synthetic:next' as GlobalSearchCursorV1;

const availableAcademicYears = [
  { id: year2026, label: '2026' },
  { id: year2027, label: '2027' },
] as const;

const context2026 = {
  selectedAcademicYearId: year2026,
  availableAcademicYears,
} satisfies OperationalWorkspaceAcademicYearContextV1;

const context2027 = {
  selectedAcademicYearId: year2027,
  availableAcademicYears,
} satisfies OperationalWorkspaceAcademicYearContextV1;

const searchResults = [
  {
    kind: 'student',
    id: 'student:synthetic:a' as StudentId,
    displayName: 'Aluno Sintético A',
  },
  {
    kind: 'class-group',
    id: 'class-group:synthetic:6a' as ClassGroupId,
    code: '6A',
  },
  {
    kind: 'teacher',
    id: 'teacher:synthetic:a' as TeacherId,
    displayName: 'Professor Sintético A',
  },
  {
    kind: 'subject',
    id: 'subject:synthetic:math' as SubjectId,
    displayName: 'Componente Sintético A',
  },
] as const satisfies readonly GlobalSearchResultV1[];

function searchRequest(
  context: OperationalWorkspaceAcademicYearContextV1,
): OperationalWorkspaceSearchRequestV1 {
  return {
    contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
    academicYearId: context.selectedAcademicYearId,
    query: 'sintético',
    scope: { kinds: ['student', 'class-group', 'teacher', 'subject'] },
    page: { limit: 4, cursor: null },
    order: GLOBAL_SEARCH_ORDER_V1,
  };
}

describe('operational academic workspace contract v1', () => {
  it('freezes one provider-independent contract and directly reuses the global search contract', () => {
    expect(OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1).toBe(1);
    expect(OPERATIONAL_WORKSPACE_STATES_V1).toEqual([
      'loading',
      'ready',
      'empty',
      'unavailable',
      'not-authorized',
    ]);
    expect(OPERATIONAL_WORKSPACE_NAVIGATION_KINDS_V1).toBe(
      GLOBAL_SEARCH_CONTRACT_V1.resultKinds,
    );
    expect(OPERATIONAL_WORKSPACE_CONTRACT_V1.search).toBe(GLOBAL_SEARCH_CONTRACT_V1);
    expect(OPERATIONAL_WORKSPACE_CONTRACT_V1.academicYear).toEqual({
      selection: 'explicit',
      selectedYearMustBeAvailable: true,
      clockFallback: 'forbidden',
    });
    expect(OPERATIONAL_WORKSPACE_CONTRACT_V1.navigation).toEqual({
      identity: 'opaque-id-and-kind-only',
      route: 'outside-contract',
    });
    expect(OPERATIONAL_WORKSPACE_CONTRACT_V1.authorization).toEqual({
      enforcement: 'server',
      clientClaims: 'forbidden',
    });
  });

  it('requires an explicit selected year from a minimal unique list and supports switching context', () => {
    expect(isOperationalWorkspaceAcademicYearContextValidV1(context2026)).toBe(true);
    expect(isOperationalWorkspaceAcademicYearContextValidV1(context2027)).toBe(true);
    expect(context2026.selectedAcademicYearId).not.toBe(context2027.selectedAcademicYearId);
    expect(context2026.availableAcademicYears).toBe(context2027.availableAcademicYears);

    expect(
      isOperationalWorkspaceAcademicYearContextValidV1({
        selectedAcademicYearId: 'academic-year:synthetic:absent' as AcademicYearId,
        availableAcademicYears,
      }),
    ).toBe(false);
    expect(
      isOperationalWorkspaceAcademicYearContextValidV1({
        selectedAcademicYearId: year2026,
        availableAcademicYears: [
          { id: year2026, label: '2026' },
          { id: year2026, label: 'Duplicado' },
        ],
      }),
    ).toBe(false);
    expect(
      isOperationalWorkspaceAcademicYearContextValidV1({
        selectedAcademicYearId: year2026,
        availableAcademicYears: [{ id: year2026, label: '   ' }],
      }),
    ).toBe(false);
  });

  it('derives the four navigation intents from search identities without routes or presentation copies', () => {
    const intents = searchResults.map(navigationIntentFromGlobalSearchResultV1);

    expect(intents).toEqual([
      { kind: 'student', id: 'student:synthetic:a' },
      { kind: 'class-group', id: 'class-group:synthetic:6a' },
      { kind: 'teacher', id: 'teacher:synthetic:a' },
      { kind: 'subject', id: 'subject:synthetic:math' },
    ]);
    for (const intent of intents) {
      expect(isOperationalWorkspaceNavigationIntentValidV1(intent)).toBe(true);
      expect(Object.keys(intent).sort()).toEqual(['id', 'kind']);
      expect(intent).not.toHaveProperty('href');
      expect(intent).not.toHaveProperty('route');
      expect(intent).not.toHaveProperty('url');
      expect(intent).not.toHaveProperty('displayName');
      expect(intent).not.toHaveProperty('code');
    }

    expect(
      isOperationalWorkspaceNavigationIntentValidV1({
        kind: 'student',
        id: '   ' as StudentId,
      }),
    ).toBe(false);
  });

  it('uses the selected annual context with the exact V1 search request instead of a second search model', () => {
    const request2026 = searchRequest(context2026);
    const request2027 = searchRequest(context2027);

    expect(isOperationalWorkspaceSearchRequestForContextV1(request2026, context2026)).toBe(true);
    expect(isOperationalWorkspaceSearchRequestForContextV1(request2026, context2027)).toBe(false);
    expect(isOperationalWorkspaceSearchRequestForContextV1(request2027, context2027)).toBe(true);
    expect(Object.keys(request2026).sort()).toEqual([
      'academicYearId',
      'contractVersion',
      'order',
      'page',
      'query',
      'scope',
    ]);
  });

  it('preserves global-search pagination and result shapes by direct type compatibility', () => {
    const resultPage = {
      contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
      outcome: 'results',
      academicYearId: year2026,
      order: GLOBAL_SEARCH_ORDER_V1,
      limit: 4,
      items: searchResults,
      nextCursor,
    } as const satisfies GlobalSearchResultsPageV1;

    const workspaceResponse: OperationalWorkspaceSearchResponseV1 = resultPage;
    const workspaceResults: readonly OperationalWorkspaceSearchResultV1[] = resultPage.items;

    expect(isOperationalWorkspaceSearchResponseValidV1(workspaceResponse)).toBe(true);
    expect(workspaceResults).toBe(searchResults);
    expect(workspaceResponse.nextCursor).toBe(nextCursor);
    expect(workspaceResponse).not.toHaveProperty('total');

    const absent = {
      contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
      outcome: 'no-results',
      items: [] as const,
      nextCursor: null,
    } satisfies OperationalWorkspaceSearchResponseV1;
    expect(isOperationalWorkspaceSearchResponseValidV1(absent)).toBe(true);
    expect(absent.items).toEqual([]);
    expect(absent.nextCursor).toBeNull();
    expect(absent).not.toHaveProperty('academicYearId');
    expect(absent).not.toHaveProperty('total');
  });

  it('discriminates loading, ready, empty, unavailable and not-authorized without disclosure', () => {
    const states: readonly OperationalWorkspaceAvailabilityV1[] = [
      { contractVersion: 1, state: 'loading' },
      { contractVersion: 1, state: 'ready', context: context2026 },
      { contractVersion: 1, state: 'empty', context: context2026 },
      { contractVersion: 1, state: 'unavailable' },
      { contractVersion: 1, state: 'not-authorized' },
    ];

    for (const state of states) {
      expect(isOperationalWorkspaceAvailabilityValidV1(state)).toBe(true);
    }

    for (const state of states.filter(
      (candidate) =>
        candidate.state === 'unavailable' || candidate.state === 'not-authorized',
    )) {
      expect(Object.keys(state).sort()).toEqual(['contractVersion', 'state']);
      expect(state).not.toHaveProperty('context');
      expect(state).not.toHaveProperty('academicYearId');
      expect(state).not.toHaveProperty('entity');
      expect(state).not.toHaveProperty('total');
      expect(state).not.toHaveProperty('nextCursor');
    }
  });

  it('rejects client payload fields for authorization, routes, grades, results and source evidence', () => {
    const safePayload = {
      availability: { contractVersion: 1, state: 'ready', context: context2026 },
      navigation: navigationIntentFromGlobalSearchResultV1(searchResults[0]),
      search: searchRequest(context2026),
    };
    expect(containsOperationalWorkspaceForbiddenClientFieldV1(safePayload)).toBe(false);

    const forbiddenPayloads = [
      { role: 'ADMINISTRADOR' },
      { token: 'synthetic-token' },
      { capabilities: ['gradebook.persistence.admin'] },
      { authorized: true },
      { navigation: { href: '/synthetic/student' } },
      { navigation: { route: 'synthetic-route' } },
      { navigation: { url: 'https://synthetic.invalid' } },
      { academic: { grade: 10 } },
      { academic: { result: 'synthetic-result' } },
      { source: { evidence: 'synthetic-evidence' } },
    ];

    for (const payload of forbiddenPayloads) {
      expect(containsOperationalWorkspaceForbiddenClientFieldV1(payload)).toBe(true);
    }

    for (const forbiddenField of OPERATIONAL_WORKSPACE_FORBIDDEN_CLIENT_FIELDS_V1) {
      expect(containsOperationalWorkspaceForbiddenClientFieldV1({ [forbiddenField]: 'synthetic' })).toBe(
        true,
      );
    }
  });

  it('keeps navigation intents as opaque identities only', () => {
    const intent = {
      kind: 'teacher',
      id: 'teacher:synthetic:only-id' as TeacherId,
    } satisfies OperationalWorkspaceNavigationIntentV1;

    expect(isOperationalWorkspaceNavigationIntentValidV1(intent)).toBe(true);
    expect(JSON.stringify(intent)).toBe(
      '{"kind":"teacher","id":"teacher:synthetic:only-id"}',
    );
  });
});
