import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { PersistenceUnitOfWorkV2 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { createGradebookImportSharedSourceReadCacheV1 } from '../../../server/gradebook/application/import/import-shared-source-read-cache-v1';

const contextA = { academicYearId: 'academic-year:source-cache:a' as AcademicYearId };
const contextB = { academicYearId: 'academic-year:source-cache:b' as AcademicYearId };

function fixture() {
  let calls = 0;
  let failNext = false;
  const imports = {
    async findSourceFileByHash() {
      calls += 1;
      await Promise.resolve();
      if (failNext) {
        failNext = false;
        throw new Error('transient-source-read');
      }
      return null;
    },
  };
  const cached = createGradebookImportSharedSourceReadCacheV1({
    imports,
  } as unknown as PersistenceUnitOfWorkV2);
  return {
    cached,
    calls: () => calls,
    failNext: () => {
      failNext = true;
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

    expect(value.calls()).toBe(1);
  });

  it('does not share reads across different hashes or academic years', async () => {
    const value = fixture();

    await value.cached.imports.findSourceFileByHash(contextA, 'a'.repeat(64));
    await value.cached.imports.findSourceFileByHash(contextA, 'b'.repeat(64));
    await value.cached.imports.findSourceFileByHash(contextB, 'a'.repeat(64));

    expect(value.calls()).toBe(3);
  });

  it('evicts a rejected read so a transient failure can recover', async () => {
    const value = fixture();
    const hash = 'c'.repeat(64);
    value.failNext();

    await expect(value.cached.imports.findSourceFileByHash(contextA, hash)).rejects.toThrow(
      'transient-source-read',
    );
    await expect(value.cached.imports.findSourceFileByHash(contextA, hash)).resolves.toBeNull();

    expect(value.calls()).toBe(2);
  });
});
