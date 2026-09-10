import type { AcademicYearId, TeacherId } from '../../../../shared/gradebook-contracts/entities';
import {
  TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
  type PersistenceUnitOfWorkV2,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

function memoized<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load().catch((cause) => {
    cache.delete(key);
    throw cause;
  });
  cache.set(key, pending);
  return pending;
}

function sourceHashKey(
  context: Parameters<PersistenceUnitOfWorkV2['imports']['findSourceFileByHash']>[0],
  sha256: Parameters<PersistenceUnitOfWorkV2['imports']['findSourceFileByHash']>[1],
): string {
  return JSON.stringify([context.academicYearId, sha256]);
}

function logicalSourceListKey(
  context: Parameters<PersistenceUnitOfWorkV2['logicalSources']['listByContext']>[0],
  sourceContext: Parameters<PersistenceUnitOfWorkV2['logicalSources']['listByContext']>[1],
  page: Parameters<PersistenceUnitOfWorkV2['logicalSources']['listByContext']>[2],
): string {
  return JSON.stringify([
    context.academicYearId,
    sourceContext.kind,
    sourceContext.academicYearId,
    sourceContext.teacherId,
    page.limit,
    page.cursor ?? null,
  ]);
}

/**
 * Shares immutable source observations inside one import request.
 * Rejected reads are evicted so transient failures remain retryable and fail closed.
 */
export function createGradebookImportSharedSourceReadCacheV1(
  base: PersistenceUnitOfWorkV2,
): PersistenceUnitOfWorkV2 {
  const imports = base.imports;
  const logicalSources = base.logicalSources;
  const sourceHashCache = new Map<string, ReturnType<typeof imports.findSourceFileByHash>>();
  const logicalSourceListCache = new Map<
    string,
    ReturnType<typeof logicalSources.listByContext>
  >();

  return {
    ...base,
    imports: {
      ...imports,
      findSourceFileByHash: (context, sha256) =>
        memoized(sourceHashCache, sourceHashKey(context, sha256), () =>
          imports.findSourceFileByHash(context, sha256),
        ),
    },
    logicalSources: {
      get: (context, logicalSourceId) => logicalSources.get(context, logicalSourceId),
      listByContext: (context, sourceContext, page) =>
        memoized(
          logicalSourceListCache,
          logicalSourceListKey(context, sourceContext, page),
          () => logicalSources.listByContext(context, sourceContext, page),
        ),
      createInitial: (context, logicalSource) =>
        logicalSources.createInitial(context, logicalSource),
    },
  };
}

/**
 * Starts immutable source reads opportunistically. Failures are intentionally ignored here:
 * the cache evicts rejected reads and the canonical flow retries them only if it reaches that read,
 * preserving review/error precedence while allowing useful overlap with independent D1 work.
 */
export async function prewarmGradebookImportSharedSourceReadsV1(input: {
  readonly unitOfWork: PersistenceUnitOfWorkV2;
  readonly academicYearId: AcademicYearId;
  readonly sha256: string;
  readonly teacherId: TeacherId | null;
}): Promise<void> {
  const context = { academicYearId: input.academicYearId };
  const reads: Promise<unknown>[] = [
    input.unitOfWork.imports.findSourceFileByHash(context, input.sha256),
  ];
  if (input.teacherId !== null) {
    reads.push(
      input.unitOfWork.logicalSources.listByContext(
        context,
        {
          kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
          academicYearId: input.academicYearId,
          teacherId: input.teacherId,
        },
        { limit: 2 },
      ),
    );
  }
  await Promise.allSettled(reads);
}
