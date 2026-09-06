import { describe, expect, it } from 'vitest';
import type { AcademicYearId, TeacherId } from '../../../shared/gradebook-contracts/entities';
import {
  TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
  type PersistenceUnitOfWorkV2,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import {
  createGradebookImportSharedSourceReadCacheV1,
  prewarmGradebookImportSharedSourceReadsV1,
} from '../../../server/gradebook/application/import/import-shared-source-read-cache-v1';

const contextA = { academicYearId: 'academic-year:source-cache:a' as AcademicYearId };
const contextB = { academicYearId: 'academic-year:source-cache:b' as AcademicYearId };
const teacherA = 'teacher:source-cache:a' as TeacherId;
const teacherB = 'teacher:source-cache:b' as TeacherId;

function sourceContext(context = contextA, teacherId = teacherA) {
  return {
    kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
    academicYearId: context.academicYearId,
    teacherId,
  };
}

function fixture() {
  let sourceCalls = 0;
  let logicalSourceCalls = 0;
  let failNextSource = false;
  let failNextLogicalSource = false;
  const imports = {
    async findSourceFileByHash() {
      sourceCalls += 1;
      await Promise.resolve();
      if (failNextSource) {
        failNextSource = false;
        throw new Error('transient-source-read');
      }
      return null;
    },
  };
  const logicalSources = {
    async get() {
      throw new Error('not-used');
    },
    async listByContext() {
      logicalSourceCalls += 1;
      await Promise.resolve();
      if (failNextLogicalSource) {
        failNextLogicalSource = false;
        throw new Error('transient-logical-source-read');
      }
      return { items: [], nextCursor: null };
    },
    async createInitial() {
      throw new Error('not-used');
    },
  };
  const cached = createGradebookImportSharedSourceReadCacheV1({
    imports,
    logicalSources,
  } as unknown as PersistenceUnitOfWorkV2);
  return {
    cached,
    sourceCalls: () => sourceCalls,
    logicalSourceCalls: () => logicalSourceCalls,
    failNextSource: () => {
      failNextSource = true;
    },
    failNextLogicalSource: () => {
      failNextLogicalSource = true;
    },
  };
}

describe('import shared source read cache', () => {
  it('shares concurrent and sequential reads for the same academic year and hash', async () => {
    const value = fixture();
    const hash = 'a'.repeat(64);

    await Promise.all([
      value.cached.imports.findSourceFileByHash(contextA, hash),
      value.cached.imports.findSourceFileByHash(contextA, hash),
    ]);
    await value.cached.imports.findSourceFileByHash(contextA, hash);

    expect(value.sourceCalls()).toBe(1);
  });

  it('does not share source-file reads across different hashes or academic years', async () => {
    const value = fixture();

    await value.cached.imports.findSourceFileByHash(contextA, 'a'.repeat(64));
    await value.cached.imports.findSourceFileByHash(contextA, 'b'.repeat(64));
    await value.cached.imports.findSourceFileByHash(contextB, 'a'.repeat(64));

    expect(value.sourceCalls()).toBe(3);
  });

  it('evicts a rejected source-file read so a transient failure can recover', async () => {
    const value = fixture();
    const hash = 'c'.repeat(64);
    value.failNextSource();

    await expect(value.cached.imports.findSourceFileByHash(contextA, hash)).rejects.toThrow(
      'transient-source-read',
    );
    await expect(value.cached.imports.findSourceFileByHash(contextA, hash)).resolves.toBeNull();

    expect(value.sourceCalls()).toBe(2);
  });

  it('shares logical-source context reads only for the exact year, teacher and page', async () => {
    const value = fixture();

    await Promise.all([
      value.cached.logicalSources.listByContext(contextA, sourceContext(), { limit: 2 }),
      value.cached.logicalSources.listByContext(contextA, sourceContext(), { limit: 2 }),
    ]);
    await value.cached.logicalSources.listByContext(contextA, sourceContext(), { limit: 2 });
    await value.cached.logicalSources.listByContext(contextA, sourceContext(contextA, teacherB), {
      limit: 2,
    });
    await value.cached.logicalSources.listByContext(contextB, sourceContext(contextB, teacherA), {
      limit: 2,
    });
    await value.cached.logicalSources.listByContext(contextA, sourceContext(), { limit: 1 });

    expect(value.logicalSourceCalls()).toBe(4);
  });

  it('evicts a rejected logical-source read so the canonical retry can recover', async () => {
    const value = fixture();
    value.failNextLogicalSource();

    await expect(
      value.cached.logicalSources.listByContext(contextA, sourceContext(), { limit: 2 }),
    ).rejects.toThrow('transient-logical-source-read');
    await expect(
      value.cached.logicalSources.listByContext(contextA, sourceContext(), { limit: 2 }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(value.logicalSourceCalls()).toBe(2);
  });

  it('warms source-file and logical-source reads together and absorbs transient warm-up failures', async () => {
    const value = fixture();
    value.failNextSource();
    value.failNextLogicalSource();

    const warming = prewarmGradebookImportSharedSourceReadsV1({
      unitOfWork: value.cached,
      academicYearId: contextA.academicYearId,
      sha256: 'd'.repeat(64),
      teacherId: teacherA,
    });

    expect(value.sourceCalls()).toBe(1);
    expect(value.logicalSourceCalls()).toBe(1);
    await expect(warming).resolves.toBeUndefined();

    await expect(
      value.cached.imports.findSourceFileByHash(contextA, 'd'.repeat(64)),
    ).resolves.toBeNull();
    await expect(
      value.cached.logicalSources.listByContext(contextA, sourceContext(), { limit: 2 }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(value.sourceCalls()).toBe(2);
    expect(value.logicalSourceCalls()).toBe(2);
  });
});
