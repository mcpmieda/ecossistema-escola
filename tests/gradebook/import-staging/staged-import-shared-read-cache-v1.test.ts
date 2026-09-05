import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type {
  AcademicEntityKindV1,
  AcademicEntityReferenceV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { createGradebookImportStagingSharedReadCacheV1 } from '../../../server/gradebook/application/import/import-staging-shared-read-cache-v1';

const context = { academicYearId: 'academic-year:staging-cache:2026' as AcademicYearId };

function fixture() {
  const listCalls = new Map<AcademicEntityKindV1, number>();
  const getCalls = new Map<AcademicEntityReferenceV1['kind'], number>();
  let failTeacherList = false;

  const entities = {
    async get(_context: unknown, reference: AcademicEntityReferenceV1) {
      getCalls.set(reference.kind, (getCalls.get(reference.kind) ?? 0) + 1);
      await Promise.resolve();
      return null;
    },
    async list(_context: unknown, kind: AcademicEntityKindV1) {
      listCalls.set(kind, (listCalls.get(kind) ?? 0) + 1);
      await Promise.resolve();
      if (kind === 'teacher' && failTeacherList) {
        failTeacherList = false;
        throw new Error('transient-list-failure');
      }
      return { items: [], nextCursor: null };
    },
    async appendVersion() {
      throw new Error('not-used');
    },
  };

  return {
    cached: createGradebookImportStagingSharedReadCacheV1({ entities } as unknown as PersistenceUnitOfWorkV2),
    getCalls,
    listCalls,
    failNextTeacherList: () => {
      failTeacherList = true;
    },
  };
}

describe('staged import shared read cache', () => {
  it('shares one immutable catalog page across concurrent chunks', async () => {
    const value = fixture();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        value.cached.entities.list(context, 'teacher', { limit: 100, cursor: null }),
      ),
    );
    await Promise.all(
      Array.from({ length: 5 }, () =>
        value.cached.entities.list(context, 'class-group', { limit: 100, cursor: null }),
      ),
    );

    expect(value.listCalls.get('teacher')).toBe(1);
    expect(value.listCalls.get('class-group')).toBe(1);
  });

  it('never shares student or enrollment lists between chunks', async () => {
    const value = fixture();
    await Promise.all([
      value.cached.entities.list(context, 'student', { limit: 100, cursor: null }),
      value.cached.entities.list(context, 'student', { limit: 100, cursor: null }),
      value.cached.entities.list(context, 'enrollment', { limit: 100, cursor: null }),
      value.cached.entities.list(context, 'enrollment', { limit: 100, cursor: null }),
    ]);

    expect(value.listCalls.get('student')).toBe(2);
    expect(value.listCalls.get('enrollment')).toBe(2);
  });

  it('shares the academic-year get but not unrelated entity gets', async () => {
    const value = fixture();
    const yearReference = { kind: 'academic-year' as const, id: context.academicYearId };
    await Promise.all(
      Array.from({ length: 5 }, () => value.cached.entities.get(context, yearReference)),
    );

    const teacherReference = {
      kind: 'teacher' as const,
      id: 'teacher:staging-cache' as never,
    };
    await Promise.all([
      value.cached.entities.get(context, teacherReference),
      value.cached.entities.get(context, teacherReference),
    ]);

    expect(value.getCalls.get('academic-year')).toBe(1);
    expect(value.getCalls.get('teacher')).toBe(2);
  });

  it('evicts rejected reads so a transient failure can recover', async () => {
    const value = fixture();
    value.failNextTeacherList();

    await expect(
      value.cached.entities.list(context, 'teacher', { limit: 100, cursor: null }),
    ).rejects.toThrow('transient-list-failure');
    await expect(
      value.cached.entities.list(context, 'teacher', { limit: 100, cursor: null }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(value.listCalls.get('teacher')).toBe(2);
  });
});
