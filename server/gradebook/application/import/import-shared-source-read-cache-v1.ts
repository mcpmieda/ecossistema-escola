import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

function sourceHashKey(
  context: Parameters<PersistenceUnitOfWorkV2['imports']['findSourceFileByHash']>[0],
  sha256: Parameters<PersistenceUnitOfWorkV2['imports']['findSourceFileByHash']>[1],
): string {
  return JSON.stringify([context.academicYearId, sha256]);
}

/**
 * Shares the immutable source-hash observation inside one import request.
 * Rejected reads are evicted so transient failures remain retryable and fail closed.
 */
export function createGradebookImportSharedSourceReadCacheV1(
  base: PersistenceUnitOfWorkV2,
): PersistenceUnitOfWorkV2 {
  const imports = base.imports;
  const sourceHashCache = new Map<string, ReturnType<typeof imports.findSourceFileByHash>>();

  return {
    ...base,
    imports: {
      ...imports,
      findSourceFileByHash: (context, sha256) => {
        const key = sourceHashKey(context, sha256);
        const existing = sourceHashCache.get(key);
        if (existing) return existing;
        const pending = imports.findSourceFileByHash(context, sha256).catch((cause) => {
          sourceHashCache.delete(key);
          throw cause;
        });
        sourceHashCache.set(key, pending);
        return pending;
      },
    },
  };
}
