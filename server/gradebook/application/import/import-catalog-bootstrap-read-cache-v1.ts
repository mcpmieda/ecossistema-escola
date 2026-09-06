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

interface CatalogBootstrapSnapshotV1 {
  readonly academicYear: AcademicYearRecordV1 | null;
  readonly catalog: readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null;
  readonly assessmentComponents?: readonly AssessmentComponentRecordV1[] | null;
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
};

function contextKey(context: AcademicPersistenceContextV1): string {
  return context.academicYearId;
}

/**
 * Lets the canonical catalog planner keep its historical `get(academic-year)` followed by
 * `getImportCatalogSnapshot()` sequence while satisfying both reads from one server-owned
 * bootstrap snapshot when the persistence adapter exposes it. The same snapshot may also
 * satisfy the planner's assessment-component bulk read without changing its public contract.
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
    const pending = source.getImportCatalogBootstrapSnapshot(context);
    snapshotCache.set(key, pending);
    return pending;
  };

  return Object.assign({}, source, {
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
  });
}
