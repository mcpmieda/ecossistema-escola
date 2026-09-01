import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import {
  containsOperationalWorkspaceForbiddenClientFieldV1,
  type OperationalWorkspaceAcademicYearContextV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';
import {
  OPERATIONAL_WORKSPACE_TRANSPORT_OPERATIONS_V1,
  OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1,
  isOperationalWorkspaceTransportRequestV1,
  isOperationalWorkspaceTransportResponseV1,
  type OperationalWorkspaceTransportResponseV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';

const year2026 = 'academic-year:transport:2026' as AcademicYearId;
const year2027 = 'academic-year:transport:2027' as AcademicYearId;
const years = [
  { id: year2027, label: '2027' },
  { id: year2026, label: '2026' },
] as const;
const context = {
  selectedAcademicYearId: year2026,
  availableAcademicYears: years,
} satisfies OperationalWorkspaceAcademicYearContextV1;

function searchRequest() {
  return {
    contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
    academicYearId: year2026,
    query: 'Aluno Sintético',
    scope: { kinds: ['student', 'class-group', 'teacher', 'subject'] as const },
    page: { limit: 20, cursor: null },
    order: GLOBAL_SEARCH_ORDER_V1,
  };
}

describe('operational workspace transport v1', () => {
  it('freezes one discriminated transport without changing search semantics', () => {
    expect(OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1).toBe(1);
    expect(OPERATIONAL_WORKSPACE_TRANSPORT_OPERATIONS_V1).toEqual([
      'bootstrap',
      'student',
      'class-group',
      'teacher',
      'subject',
      'search',
    ]);

    const requests = [
      { contractVersion: 1, operation: 'bootstrap' },
      { contractVersion: 1, operation: 'student', academicYearId: year2026, id: 'student:a' },
      { contractVersion: 1, operation: 'class-group', academicYearId: year2026, id: 'class:a' },
      { contractVersion: 1, operation: 'teacher', academicYearId: year2026, id: 'teacher:a' },
      { contractVersion: 1, operation: 'subject', academicYearId: year2026, id: 'subject:a' },
      { contractVersion: 1, operation: 'search', request: searchRequest() },
    ];
    for (const request of requests) expect(isOperationalWorkspaceTransportRequestV1(request)).toBe(true);
  });

  it('rejects authorization claims, physical navigation and academic payloads at the bridge boundary', () => {
    const forbidden = [
      { contractVersion: 1, operation: 'bootstrap', role: 'ADMINISTRADOR' },
      { contractVersion: 1, operation: 'bootstrap', capabilities: ['gradebook.persistence.admin'] },
      { contractVersion: 1, operation: 'bootstrap', authorized: true },
      { contractVersion: 1, operation: 'bootstrap', token: 'synthetic' },
      { contractVersion: 1, operation: 'student', academicYearId: year2026, id: 'student:a', href: '/x' },
      { contractVersion: 1, operation: 'student', academicYearId: year2026, id: 'student:a', grade: 10 },
      { contractVersion: 1, operation: 'student', academicYearId: year2026, id: 'student:a', result: 'x' },
      { contractVersion: 1, operation: 'student', academicYearId: year2026, id: 'student:a', evidence: 'x' },
      { contractVersion: 1, operation: 'student', academicYearId: year2026, id: 'student:a', authorityMode: 'native-engine' },
    ];
    for (const request of forbidden) {
      expect(containsOperationalWorkspaceForbiddenClientFieldV1(request)).toBe(true);
      expect(isOperationalWorkspaceTransportRequestV1(request)).toBe(false);
    }
  });

  it('accepts only minimal serialized center projections and keeps unavailable states non-disclosing', () => {
    const ready: OperationalWorkspaceTransportResponseV1 = {
      contractVersion: 1,
      state: 'ready',
      context,
      view: {
        kind: 'class-group',
        id: 'class-group:synthetic:a' as ClassGroupId,
        code: '6A',
        schoolGrade: '6º ano',
        section: 'A',
        students: [
          {
            id: 'enrollment:synthetic:a' as EnrollmentId,
            position: 'current',
            student: {
              kind: 'student',
              id: 'student:synthetic:a' as StudentId,
              label: 'Aluno Sintético A',
            },
            statusHistory: [],
          },
        ],
        assignments: [
          {
            id: 'assignment:synthetic:a' as TeachingAssignmentId,
            teacher: {
              kind: 'teacher',
              id: 'teacher:synthetic:a' as TeacherId,
              label: 'Professor Sintético A',
            },
            subject: {
              kind: 'subject',
              id: 'subject:synthetic:a' as SubjectId,
              label: 'Componente Sintético A',
            },
          },
        ],
      },
    };
    expect(isOperationalWorkspaceTransportResponseV1(ready)).toBe(true);
    expect(containsOperationalWorkspaceForbiddenClientFieldV1(ready)).toBe(false);
    expect(JSON.stringify(ready)).not.toMatch(/source|formula|note|authorityMode|confirmationOrigin/u);

    for (const response of [
      { contractVersion: 1, state: 'unavailable' },
      { contractVersion: 1, state: 'not-authorized' },
    ]) {
      expect(isOperationalWorkspaceTransportResponseV1(response)).toBe(true);
      expect(Object.keys(response).sort()).toEqual(['contractVersion', 'state']);
    }
  });

  it('preserves the exact global-search page and opaque continuation inside transport state', () => {
    const response: OperationalWorkspaceTransportResponseV1 = {
      contractVersion: 1,
      state: 'ready',
      context,
      search: {
        contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
        outcome: 'results',
        academicYearId: year2026,
        order: GLOBAL_SEARCH_ORDER_V1,
        limit: 20,
        items: [
          {
            kind: 'student',
            id: 'student:synthetic:a' as StudentId,
            displayName: 'Aluno Sintético A',
          },
        ],
        nextCursor: 'academic-global-search-v1.synthetic' as never,
      },
    };
    expect(isOperationalWorkspaceTransportResponseV1(response)).toBe(true);
    expect(response.state === 'ready' && 'search' in response ? response.search.nextCursor : null).toBe(
      'academic-global-search-v1.synthetic',
    );
  });
});
