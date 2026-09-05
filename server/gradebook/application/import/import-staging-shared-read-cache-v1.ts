import type {
  AcademicEntityKindV1,
  AcademicEntityReferenceV1,
  AcademicPersistenceContextV1,
  CursorPageRequestV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

const CACHEABLE_LIST_KINDS = new Set<AcademicEntityKindV1>([
  'teacher',
  'class-group',
  'subject',
  'teaching-assignment',
]);

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

function getKey(
  context: AcademicPersistenceContextV1,
  reference: AcademicEntityReferenceV1,
): string {
  return JSON.stringify([context.academicYearId, reference.kind, reference.id]);
}

function listKey(
  context: AcademicPersistenceContextV1,
  kind: AcademicEntityKindV1,
  page: CursorPageRequestV1,
): string {
  return JSON.stringify([context.academicYearId, kind, page.limit, page.cursor ?? null]);
}

function sourceHashKey(context: AcademicPersistenceContextV1, sha256: string): string {
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
 * A prepare-all request plans several isolated chunks against the same official snapshot.
 * Staging captures writes in memory and does not promote them before finalize, so immutable
 * catalog/source reads may be shared for the lifetime of one HTTP request. Student/enrollment,
 * academic-record and association reads remain chunk-specific and are deliberately never cached.
 */
export function createGradebookImportStagingSharedReadCacheV1(
  base: PersistenceUnitOfWorkV2,
): PersistenceUnitOfWorkV2 {
  const source = base.entities;
  const imports = base.imports;
  const logicalSources = base.logicalSources;
  const getCache = new Map<string, ReturnType<typeof source.get>>();
  const listCache = new Map<string, ReturnType<typeof source.list>>();
  const sourceHashCache = new Map<string, ReturnType<typeof imports.findSourceFileByHash>>();
  const logicalSourceListCache = new Map<string, ReturnType<typeof logicalSources.listByContext>>();

  return {
    ...base,
    entities: Object.assign({}, source, {
      get: (
        context: Parameters<typeof source.get>[0],
        reference: Parameters<typeof source.get>[1],
      ) =>
        reference.kind === 'academic-year'
          ? memoized(getCache, getKey(context, reference), () => source.get(context, reference))
          : source.get(context, reference),
      list: (
        context: Parameters<typeof source.list>[0],
        kind: Parameters<typeof source.list>[1],
        page: Parameters<typeof source.list>[2],
      ) =>
        CACHEABLE_LIST_KINDS.has(kind)
          ? memoized(listCache, listKey(context, kind, page), () => source.list(context, kind, page))
          : source.list(context, kind, page),
    }),
    imports: {
      ...imports,
      findSourceFileByHash: (
        context: Parameters<typeof imports.findSourceFileByHash>[0],
        sha256: Parameters<typeof imports.findSourceFileByHash>[1],
      ) =>
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
