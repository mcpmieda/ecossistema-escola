import { describe, expect, it, vi } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1,
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
} from '../../../shared/gradebook-contracts/search/global-search-contract-v1';
import { createOperationalWorkspaceServiceV1 } from '../../../server/gradebook/application/operational-workspace/operational-workspace-service-v1';
import type { GradebookOperationalReadModelsV1 } from '../../../server/gradebook/application/read-models/composition/operational-read-models-v1';

const year2026 = 'academic-year:workspace-service:2026' as AcademicYearId;
const year2027 = 'academic-year:workspace-service:2027' as AcademicYearId;
const studentId = 'student:workspace-service:a' as StudentId;
const classGroupId = 'class-group:workspace-service:6a' as ClassGroupId;
const teacherId = 'teacher:workspace-service:a' as TeacherId;
const subjectId = 'subject:workspace-service:a' as SubjectId;
const enrollmentId = 'enrollment:workspace-service:a' as EnrollmentId;
const assignmentId = 'assignment:workspace-service:a' as TeachingAssignmentId;
const recordedAt = '2026-09-01T18:00:00.000Z';

function versioned<Value>(value: Value) {
  return { value, version: 1, recordedAt };
}

function readModels() {
  const students = {
    get: vi.fn(async (context, id) => {
      if (id !== studentId) return null;
      return {
        academicYearId: context.academicYearId,
        student: versioned({ id: studentId, displayName: 'Aluno Sintético A', sourceNames: [] }),
        enrollments: [
          {
            enrollment: versioned({
              id: enrollmentId,
              academicYearId: context.academicYearId,
              studentId,
              classGroupId,
              effectivePeriod: {},
              position: 'current',
            }),
            classGroup: versioned({
              id: classGroupId,
              academicYearId: context.academicYearId,
              code: '6A',
              grade: '6º ano',
              section: 'A',
            }),
            statusHistory: [],
          },
        ],
      };
    }),
  };
  const classGroups = {
    get: vi.fn(async (context, id) => {
      if (id !== classGroupId) return null;
      return {
        academicYearId: context.academicYearId,
        classGroup: versioned({
          id: classGroupId,
          academicYearId: context.academicYearId,
          code: '6A',
          grade: '6º ano',
          section: 'A',
        }),
        students: [
          {
            enrollment: versioned({
              id: enrollmentId,
              academicYearId: context.academicYearId,
              studentId,
              classGroupId,
              effectivePeriod: {},
              position: 'current',
            }),
            student: versioned({ id: studentId, displayName: 'Aluno Sintético A', sourceNames: [] }),
            statusHistory: [],
          },
        ],
        assignments: [
          {
            assignment: versioned({
              id: assignmentId,
              academicYearId: context.academicYearId,
              teacherId,
              classGroupId,
              subjectId,
              effectivePeriod: {},
              confirmationOrigin: 'imported-source',
            }),
            teacher: versioned({
              id: teacherId,
              displayName: 'Professor Sintético A',
              sourceNames: [],
              status: 'active',
            }),
            subject: versioned({
              id: subjectId,
              code: 'MAT',
              displayName: 'Componente Sintético A',
              shortName: 'MAT',
              status: 'active',
            }),
            assessmentComponents: [],
          },
        ],
      };
    }),
  };
  const teachers = {
    get: vi.fn(async (context, id) => {
      if (id !== teacherId) return null;
      return {
        academicYearId: context.academicYearId,
        teacher: versioned({
          id: teacherId,
          displayName: 'Professor Sintético A',
          sourceNames: [],
          status: 'active',
        }),
        assignments: [
          {
            assignment: versioned({
              id: assignmentId,
              academicYearId: context.academicYearId,
              teacherId,
              classGroupId,
              subjectId,
              effectivePeriod: {},
              confirmationOrigin: 'imported-source',
            }),
            classGroup: versioned({
              id: classGroupId,
              academicYearId: context.academicYearId,
              code: '6A',
              grade: '6º ano',
              section: 'A',
            }),
            subject: versioned({
              id: subjectId,
              code: 'MAT',
              displayName: 'Componente Sintético A',
              shortName: 'MAT',
              status: 'active',
            }),
            assessmentComponents: [],
          },
        ],
      };
    }),
  };
  const subjects = {
    get: vi.fn(async (context, id) => {
      if (id !== subjectId) return null;
      return {
        academicYearId: context.academicYearId,
        subject: versioned({
          id: subjectId,
          code: 'MAT',
          displayName: 'Componente Sintético A',
          shortName: 'MAT',
          status: 'active',
        }),
        assignments: [
          {
            assignment: versioned({
              id: assignmentId,
              academicYearId: context.academicYearId,
              teacherId,
              classGroupId,
              subjectId,
              effectivePeriod: {},
              confirmationOrigin: 'imported-source',
            }),
            classGroup: versioned({
              id: classGroupId,
              academicYearId: context.academicYearId,
              code: '6A',
              grade: '6º ano',
              section: 'A',
            }),
            teacher: versioned({
              id: teacherId,
              displayName: 'Professor Sintético A',
              sourceNames: [],
              status: 'active',
            }),
            assessmentComponents: [],
          },
        ],
      };
    }),
  };
  const search = {
    authorizationPolicy: GLOBAL_SEARCH_AUTHORIZATION_POLICY_V1,
    search: vi.fn(async (request) => ({
      contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
      outcome: 'results' as const,
      academicYearId: request.academicYearId,
      order: GLOBAL_SEARCH_ORDER_V1,
      limit: request.page.limit,
      items: [
        { kind: 'student' as const, id: studentId, displayName: 'Aluno Sintético A' },
      ] as const,
      nextCursor: null,
    })),
  };
  return { students, classGroups, teachers, subjects, search } as GradebookOperationalReadModelsV1;
}

function service(models = readModels()) {
  return {
    models,
    value: createOperationalWorkspaceServiceV1({
      academicYears: {
        list: async () => [
          { id: year2027, label: '2027' },
          { id: year2026, label: '2026' },
        ],
      },
      readModels: models,
    }),
  };
}

describe('operational workspace application service v1', () => {
  it('bootstraps persisted years without selecting one automatically', async () => {
    const { value } = service();
    await expect(value.execute({ contractVersion: 1, operation: 'bootstrap' })).resolves.toEqual({
      contractVersion: 1,
      state: 'ready',
      availableAcademicYears: [
        { id: year2027, label: '2027' },
        { id: year2026, label: '2026' },
      ],
    });
  });

  it('projects all four existing read models with opaque navigation fields only', async () => {
    const { value } = service();
    const requests = [
      { contractVersion: 1 as const, operation: 'student' as const, academicYearId: year2026, id: studentId },
      { contractVersion: 1 as const, operation: 'class-group' as const, academicYearId: year2026, id: classGroupId },
      { contractVersion: 1 as const, operation: 'teacher' as const, academicYearId: year2026, id: teacherId },
      { contractVersion: 1 as const, operation: 'subject' as const, academicYearId: year2026, id: subjectId },
    ];
    const responses = [];
    for (const request of requests) responses.push(await value.execute(request));

    expect(responses.map((response) => (response.state === 'ready' && 'view' in response ? response.view.kind : null))).toEqual([
      'student',
      'class-group',
      'teacher',
      'subject',
    ]);
    const serialized = JSON.stringify(responses);
    expect(serialized).not.toMatch(/sourceNames|sourceText|assessmentComponents|confirmationOrigin|authorityMode|formula|note/u);
    expect(serialized).toContain('Aluno Sintético A');
    expect(serialized).toContain('Professor Sintético A');
  });

  it('preserves explicit annual isolation when the user switches years', async () => {
    const { value, models } = service();
    await value.execute({
      contractVersion: 1,
      operation: 'student',
      academicYearId: year2027,
      id: studentId,
    });
    expect(models.students.get).toHaveBeenCalledWith({ academicYearId: year2027 }, studentId);
  });

  it('delegates search unchanged to the existing search read model', async () => {
    const { value, models } = service();
    const request = {
      contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
      academicYearId: year2026,
      query: 'Aluno Sintético',
      scope: { kinds: ['student', 'class-group', 'teacher', 'subject'] as const },
      page: { limit: 20, cursor: null },
      order: GLOBAL_SEARCH_ORDER_V1,
    };
    const response = await value.execute({ contractVersion: 1, operation: 'search', request });

    expect(models.search.search).toHaveBeenCalledTimes(1);
    expect(models.search.search).toHaveBeenCalledWith(request);
    expect(response.state).toBe('ready');
  });

  it('fails closed for an academic year not present in the server catalog', async () => {
    const { value, models } = service();
    const response = await value.execute({
      contractVersion: 1,
      operation: 'student',
      academicYearId: 'academic-year:workspace-service:absent' as AcademicYearId,
      id: studentId,
    });
    expect(response).toEqual({ contractVersion: 1, state: 'unavailable' });
    expect(models.students.get).not.toHaveBeenCalled();
  });
});
