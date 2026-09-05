import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import { createGradebookImportStagingBoundedCatalogV1 } from '../../../server/gradebook/application/import/import-staging-bounded-catalog-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

const academicYearId = 'academic-year:bounded-cache:2026' as AcademicYearId;
const classGroupId = 'class-group:bounded-cache:9a';
const studentId = 'student:bounded-cache:1';
const enrollmentId = 'enrollment:bounded-cache:1';
const instant = '2026-09-05T15:00:00.000Z';

function request(): GradebookImportPersistenceRequestV6 {
  return {
    confirmedContext: { academicYearId },
    rosters: [
      {
        classGroupLabel: '9A',
        students: [[1, 'Estudante Sintético', 'ATIVO']],
      },
    ],
    courses: [{ classGroupLabel: '9A' }],
  } as unknown as GradebookImportPersistenceRequestV6;
}

function fixture() {
  const baseGetCalls: string[] = [];
  const student = {
    value: {
      kind: 'student' as const,
      value: {
        id: studentId as never,
        displayName: 'Estudante Sintético',
        sourceNames: ['Estudante Sintético'],
      },
    },
    version: 1,
    recordedAt: instant,
  };
  const enrollment = {
    value: {
      kind: 'enrollment' as const,
      value: {
        id: enrollmentId as never,
        academicYearId,
        studentId: studentId as never,
        classGroupId: classGroupId as never,
        effectivePeriod: {},
        position: 'current' as const,
        sourcePosition: 1,
      },
    },
    version: 1,
    recordedAt: instant,
  };
  const classGroup = {
    value: {
      kind: 'class-group' as const,
      value: {
        id: classGroupId as never,
        academicYearId,
        code: '9A',
        grade: '9',
        section: 'A',
      },
    },
    version: 1,
    recordedAt: instant,
  };

  const entities = {
    async get(_context: unknown, reference: { kind: string; id: string }) {
      baseGetCalls.push(`${reference.kind}:${reference.id}`);
      return null;
    },
    async list(_context: unknown, kind: string) {
      return kind === 'class-group'
        ? { items: [classGroup], nextCursor: null }
        : { items: [], nextCursor: null };
    },
    async appendVersion() {
      throw new Error('not-used');
    },
    async getImportRosterMany() {
      return [{ state: 'ready' as const, student, enrollment }];
    },
  };

  return {
    base: { entities } as unknown as PersistenceUnitOfWorkV2,
    baseGetCalls,
    student,
    enrollment,
  };
}

describe('staged import bounded catalog', () => {
  it('reuses bulk roster records for later student and enrollment gets', async () => {
    const value = fixture();
    const bounded = await createGradebookImportStagingBoundedCatalogV1(value.base, request());
    const context = { academicYearId };

    await expect(
      bounded.entities.get(context, { kind: 'student', id: studentId as never }),
    ).resolves.toEqual(value.student);
    await expect(
      bounded.entities.get(context, { kind: 'enrollment', id: enrollmentId as never }),
    ).resolves.toEqual(value.enrollment);

    expect(value.baseGetCalls).toEqual([]);
  });

  it('keeps fallback gets for references outside the resolved roster', async () => {
    const value = fixture();
    const bounded = await createGradebookImportStagingBoundedCatalogV1(value.base, request());
    const context = { academicYearId };

    await expect(
      bounded.entities.get(context, { kind: 'student', id: 'student:outside' as never }),
    ).resolves.toBeNull();

    expect(value.baseGetCalls).toEqual(['student:student:outside']);
  });
});
