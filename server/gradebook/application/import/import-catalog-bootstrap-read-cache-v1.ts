import type {
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

type AcademicYearRecordV1 = VersionedRecordV1<
  Extract<AcademicEntityRecordV1, { readonly kind: 'academic-year' }>
>;
type AssessmentComponentRecordV1 = VersionedRecordV1<
  Extract<AcademicEntityRecordV1, { readonly kind: 'assessment-component' }>
>;
type StudentStatusEventRecordV1 = VersionedRecordV1<
  Extract<AcademicEntityRecordV1, { readonly kind: 'student-status-event' }>
>;

interface CatalogBootstrapSnapshotV1 {
  readonly academicYear: AcademicYearRecordV1 | null;
  readonly catalog: readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null;
  readonly assessmentComponents?: readonly AssessmentComponentRecordV1[] | null;
  readonly studentStatusEvents?: readonly StudentStatusEventRecordV1[] | null;
}

type CatalogBootstrapRepositoryV1 = AcademicEntityRepositoryV1 & {
  readonly getImportCatalogSnapshot?: (
    context: AcademicPersistenceContextV1,
  ) => Promise<readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null>;
  readonly getImportCatalogBootstrapSnapshot?: (
    context: AcademicPersistenceContextV1,
  ) => Promise<CatalogBootstrapSnapshotV1>;
  readonly getMany?: (
    context: AcademicPersistenceContextV1,
    references: readonly AcademicEntityReferenceV1[],
  ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
  readonly getStudentStatusEventsMany?: (
    context: AcademicPersistenceContextV1,
    ids: readonly string[],
  ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
};

export interface GradebookImportBatchCatalogReadCacheV1 {
  readonly wrap: (base: AcademicEntityRepositoryV1) => AcademicEntityRepositoryV1;
  readonly commit: (input: {
    readonly context: AcademicPersistenceContextV1;
    readonly records: readonly VersionedRecordV1<AcademicEntityRecordV1>[];
  }) => void;
}

function contextKey(context: AcademicPersistenceContextV1): string {
  return context.academicYearId;
}

function referenceKey(reference: AcademicEntityReferenceV1): string {
  return `${reference.kind}:${String(reference.id)}`;
}

function recordKey(record: VersionedRecordV1<AcademicEntityRecordV1>): string {
  return `${record.value.kind}:${String(record.value.value.id)}`;
}

function mergeRecords<T extends VersionedRecordV1<AcademicEntityRecordV1>>(
  base: readonly T[],
  overlay: readonly VersionedRecordV1<AcademicEntityRecordV1>[],
  accepts: (record: VersionedRecordV1<AcademicEntityRecordV1>) => boolean,
): readonly T[] {
  const merged = new Map<string, VersionedRecordV1<AcademicEntityRecordV1>>(
    base.map((record) => [recordKey(record), record]),
  );
  for (const record of overlay) {
    if (accepts(record)) merged.set(recordKey(record), record);
  }
  return [...merged.values()] as T[];
}

function isCatalogRecord(record: VersionedRecordV1<AcademicEntityRecordV1>): boolean {
  return (
    record.value.kind !== 'academic-year' &&
    record.value.kind !== 'assessment-component' &&
    record.value.kind !== 'student-status-event'
  );
}

/**
 * Lets the canonical catalog planner keep its historical `get(academic-year)` followed by
 * `getImportCatalogSnapshot()` sequence while satisfying both reads from one server-owned
 * bootstrap snapshot when the persistence adapter exposes it. The same snapshot may also
 * satisfy assessment-component and student-status bulk reads without changing public contracts.
 */
export function createGradebookImportCatalogBootstrapReadCacheV1(
  base: AcademicEntityRepositoryV1,
): CatalogBootstrapRepositoryV1 {
  const source = base as CatalogBootstrapRepositoryV1;
  const snapshotCache = new Map<string, Promise<CatalogBootstrapSnapshotV1>>();

  const bootstrapSnapshot = (
    context: AcademicPersistenceContextV1,
  ): Promise<CatalogBootstrapSnapshotV1> | null => {
    if (typeof source.getImportCatalogBootstrapSnapshot !== 'function') return null;
    const key = contextKey(context);
    const existing = snapshotCache.get(key);
    if (existing) return existing;
    const pending = source.getImportCatalogBootstrapSnapshot(context).catch((cause) => {
      snapshotCache.delete(key);
      throw cause;
    });
    snapshotCache.set(key, pending);
    return pending;
  };

  return Object.assign({}, source, {
    ...(typeof source.getImportCatalogBootstrapSnapshot === 'function'
      ? {
          async getImportCatalogBootstrapSnapshot(context: AcademicPersistenceContextV1) {
            return bootstrapSnapshot(context)!;
          },
        }
      : {}),
    async get(
      context: Parameters<AcademicEntityRepositoryV1['get']>[0],
      reference: Parameters<AcademicEntityRepositoryV1['get']>[1],
    ) {
      const pending =
        reference.kind === 'academic-year' && reference.id === context.academicYearId
          ? bootstrapSnapshot(context)
          : null;
      if (pending) return (await pending).academicYear;
      return source.get(context, reference);
    },
    ...(typeof source.getImportCatalogSnapshot === 'function' ||
    typeof source.getImportCatalogBootstrapSnapshot === 'function'
      ? {
          async getImportCatalogSnapshot(context: AcademicPersistenceContextV1) {
            const pending = bootstrapSnapshot(context);
            if (pending) return (await pending).catalog;
            return source.getImportCatalogSnapshot!(context);
          },
        }
      : {}),
    ...(typeof source.getMany === 'function'
      ? {
          async getMany(
            context: AcademicPersistenceContextV1,
            references: readonly AcademicEntityReferenceV1[],
          ) {
            const assessmentOnly =
              references.length > 0 &&
              references.every((reference) => reference.kind === 'assessment-component');
            const pending = assessmentOnly ? bootstrapSnapshot(context) : null;
            if (pending) {
              const components = (await pending).assessmentComponents;
              if (components !== undefined && components !== null) {
                const byId = new Map<string, AssessmentComponentRecordV1>(
                  components.map((record) => [record.value.value.id, record]),
                );
                return references.map((reference) => byId.get(String(reference.id)) ?? null);
              }
            }
            return source.getMany!(context, references);
          },
        }
      : {}),
    ...(typeof source.getStudentStatusEventsMany === 'function'
      ? {
          async getStudentStatusEventsMany(
            context: AcademicPersistenceContextV1,
            ids: readonly string[],
          ) {
            if (ids.length === 0) return [];
            if (new Set(ids).size !== ids.length || ids.some((id) => id.length === 0)) {
              throw new TypeError('student-status-bulk-request-invalid');
            }
            const pending = bootstrapSnapshot(context);
            if (pending) {
              const events = (await pending).studentStatusEvents;
              if (events !== undefined && events !== null) {
                const byId = new Map<string, StudentStatusEventRecordV1>(
                  events.map((record) => [record.value.value.id, record]),
                );
                return ids.map((id) => byId.get(id) ?? null);
              }
            }
            return source.getStudentStatusEventsMany!(context, ids);
          },
        }
      : {}),
  });
}

/**
 * Shares one physical bootstrap snapshot across every file in one V7 request. Each attempt keeps
 * its own D1 repository wrapper so transient observation remains item-scoped. Only records from a
 * transaction that actually committed are layered over the immutable physical snapshot.
 */
export function createGradebookImportBatchCatalogReadCacheV1(): GradebookImportBatchCatalogReadCacheV1 {
  const snapshotCache = new Map<string, Promise<CatalogBootstrapSnapshotV1>>();
  const committed = new Map<string, Map<string, VersionedRecordV1<AcademicEntityRecordV1>>>();

  const overlayFor = (
    context: AcademicPersistenceContextV1,
  ): Map<string, VersionedRecordV1<AcademicEntityRecordV1>> => {
    const key = contextKey(context);
    const existing = committed.get(key);
    if (existing) return existing;
    const created = new Map<string, VersionedRecordV1<AcademicEntityRecordV1>>();
    committed.set(key, created);
    return created;
  };

  const overlayRecords = (
    context: AcademicPersistenceContextV1,
  ): readonly VersionedRecordV1<AcademicEntityRecordV1>[] => [...overlayFor(context).values()];

  const physicalSnapshot = (
    source: CatalogBootstrapRepositoryV1,
    context: AcademicPersistenceContextV1,
  ): Promise<CatalogBootstrapSnapshotV1> | null => {
    if (typeof source.getImportCatalogBootstrapSnapshot !== 'function') return null;
    const key = contextKey(context);
    const existing = snapshotCache.get(key);
    if (existing) return existing;
    const pending = source.getImportCatalogBootstrapSnapshot(context).catch((cause) => {
      snapshotCache.delete(key);
      throw cause;
    });
    snapshotCache.set(key, pending);
    return pending;
  };

  const mergedSnapshot = async (
    source: CatalogBootstrapRepositoryV1,
    context: AcademicPersistenceContextV1,
  ): Promise<CatalogBootstrapSnapshotV1> => {
    const pending = physicalSnapshot(source, context);
    if (!pending) throw new TypeError('catalog-bootstrap-snapshot-unavailable');
    const snapshot = await pending;
    const overlay = overlayRecords(context);
    const academicYear =
      (overlay.find(
        (record): record is AcademicYearRecordV1 =>
          record.value.kind === 'academic-year' && record.value.value.id === context.academicYearId,
      ) ?? snapshot.academicYear);
    return {
      academicYear,
      catalog:
        snapshot.catalog === null ? null : mergeRecords(snapshot.catalog, overlay, isCatalogRecord),
      ...(snapshot.assessmentComponents === undefined
        ? {}
        : {
            assessmentComponents:
              snapshot.assessmentComponents === null
                ? null
                : (mergeRecords(
                    snapshot.assessmentComponents,
                    overlay,
                    (record) => record.value.kind === 'assessment-component',
                  ) as readonly AssessmentComponentRecordV1[]),
          }),
      ...(snapshot.studentStatusEvents === undefined
        ? {}
        : {
            studentStatusEvents:
              snapshot.studentStatusEvents === null
                ? null
                : (mergeRecords(
                    snapshot.studentStatusEvents,
                    overlay,
                    (record) => record.value.kind === 'student-status-event',
                  ) as readonly StudentStatusEventRecordV1[]),
          }),
    };
  };

  return {
    wrap(base) {
      const source = base as CatalogBootstrapRepositoryV1;
      return Object.assign({}, source, {
        ...(typeof source.getImportCatalogBootstrapSnapshot === 'function'
          ? {
              getImportCatalogBootstrapSnapshot: (context: AcademicPersistenceContextV1) =>
                mergedSnapshot(source, context),
            }
          : {}),
        async get(context: AcademicPersistenceContextV1, reference: AcademicEntityReferenceV1) {
          const overlaid = overlayFor(context).get(referenceKey(reference));
          if (overlaid) return overlaid;
          if (
            reference.kind === 'academic-year' &&
            reference.id === context.academicYearId &&
            typeof source.getImportCatalogBootstrapSnapshot === 'function'
          ) {
            return (await mergedSnapshot(source, context)).academicYear;
          }
          return source.get(context, reference);
        },
        ...(typeof source.getImportCatalogSnapshot === 'function' ||
        typeof source.getImportCatalogBootstrapSnapshot === 'function'
          ? {
              async getImportCatalogSnapshot(context: AcademicPersistenceContextV1) {
                if (typeof source.getImportCatalogBootstrapSnapshot === 'function') {
                  return (await mergedSnapshot(source, context)).catalog;
                }
                const catalog = await source.getImportCatalogSnapshot!(context);
                return catalog === null
                  ? null
                  : mergeRecords(catalog, overlayRecords(context), isCatalogRecord);
              },
            }
          : {}),
        ...(typeof source.getMany === 'function'
          ? {
              async getMany(
                context: AcademicPersistenceContextV1,
                references: readonly AcademicEntityReferenceV1[],
              ) {
                const assessmentOnly =
                  references.length > 0 &&
                  references.every((reference) => reference.kind === 'assessment-component');
                if (
                  assessmentOnly &&
                  typeof source.getImportCatalogBootstrapSnapshot === 'function'
                ) {
                  const components = (await mergedSnapshot(source, context)).assessmentComponents;
                  if (components !== undefined && components !== null) {
                    const byId = new Map<string, AssessmentComponentRecordV1>(
                      components.map((record) => [record.value.value.id, record]),
                    );
                    return references.map((reference) => byId.get(String(reference.id)) ?? null);
                  }
                }
                const loaded = await source.getMany!(context, references);
                return references.map(
                  (reference, index) =>
                    overlayFor(context).get(referenceKey(reference)) ?? loaded[index] ?? null,
                );
              },
            }
          : {}),
        ...(typeof source.getStudentStatusEventsMany === 'function'
          ? {
              async getStudentStatusEventsMany(
                context: AcademicPersistenceContextV1,
                ids: readonly string[],
              ) {
                if (ids.length === 0) return [];
                if (new Set(ids).size !== ids.length || ids.some((id) => id.length === 0)) {
                  throw new TypeError('student-status-bulk-request-invalid');
                }
                if (typeof source.getImportCatalogBootstrapSnapshot === 'function') {
                  const events = (await mergedSnapshot(source, context)).studentStatusEvents;
                  if (events !== undefined && events !== null) {
                    const byId = new Map<string, StudentStatusEventRecordV1>(
                      events.map((record) => [record.value.value.id, record]),
                    );
                    return ids.map((id) => byId.get(id) ?? null);
                  }
                }
                const loaded = await source.getStudentStatusEventsMany!(context, ids);
                return ids.map((id, index) => {
                  const overlaid = overlayFor(context).get(`student-status-event:${id}`);
                  return overlaid ?? loaded[index] ?? null;
                });
              },
            }
          : {}),
      });
    },
    commit({ context, records }) {
      const overlay = overlayFor(context);
      for (const record of records) overlay.set(recordKey(record), record);
    },
  };
}
