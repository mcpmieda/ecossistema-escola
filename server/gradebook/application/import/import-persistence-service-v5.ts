import type {
  AcademicYearId,
  ClassGroupId,
  TeacherId,
  TeachingAssignmentV1,
} from '../../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceSummaryV2 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import {
  asGradebookImportPersistenceResponseV5,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
  type GradebookImportPersistenceRequestV5,
  type GradebookImportPersistenceResponseV5,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import type { AnnualResultV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { materializeAssessmentDefinitionsV4 } from '../../../../src/features/gradebook/import/assessment-definition-materializer-v4';
import type { GradebookImportAnnualStateSourceV1 } from '../../persistence/d1/imports/d1-import-annual-state-source-v1';
import { planAcademicCatalogBootstrapV1 } from './academic-catalog-bootstrap-v1';
import { createGradebookImportCatalogBootstrapReadCacheV1 } from './import-catalog-bootstrap-read-cache-v1';
import {
  createGradebookImportPersistenceServiceV4,
  type GradebookImportPersistenceServiceDependenciesV4,
} from './import-persistence-service-v2';
import {
  createGradebookImportSharedSourceReadCacheV1,
  prewarmGradebookImportSharedSourceReadsV1,
} from './import-shared-source-read-cache-v1';

function emptySummary(): GradebookImportPersistenceSummaryV2 {
  const writeCounts = {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 0,
  };
  return {
    assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
    assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
    academicRecords: {
      unchanged: 0,
      new: 0,
      changed: 0,
      missingFromNewSource: 0,
      blocked: 0,
    },
    plannedWrites: writeCounts,
    committedWrites: writeCounts,
  };
}

function review(): GradebookImportPersistenceResponseV5 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
    state: 'review-required',
    summary: emptySummary(),
    issues: [{ code: 'invalid-academic-shape', scope: 'file' }],
  };
}

type CatalogSnapshotRepositoryV1 = AcademicEntityRepositoryV1 & {
  readonly getImportCatalogSnapshot?: (
    context: AcademicPersistenceContextV1,
  ) => Promise<readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null>;
};

function captureCatalogAssignmentsV1(base: AcademicEntityRepositoryV1): {
  readonly repository: CatalogSnapshotRepositoryV1;
  readonly assignments: () => readonly TeachingAssignmentV1[];
} {
  const assignments = new Map<string, TeachingAssignmentV1>();
  const capture = (entry: VersionedRecordV1<AcademicEntityRecordV1> | null): void => {
    if (entry?.value.kind === 'teaching-assignment') {
      assignments.set(entry.value.value.id, entry.value.value);
    }
  };
  const snapshotBase = base as CatalogSnapshotRepositoryV1;
  const repository: CatalogSnapshotRepositoryV1 = {
    async get(context, reference) {
      const entry = await base.get(context, reference);
      capture(entry as VersionedRecordV1<AcademicEntityRecordV1> | null);
      return entry;
    },
    async list(context, kind, page) {
      const result = await base.list(context, kind, page);
      for (const entry of result.items) {
        capture(entry as VersionedRecordV1<AcademicEntityRecordV1>);
      }
      return result;
    },
    appendVersion: (context, record, expectation) => base.appendVersion(context, record, expectation),
    ...(snapshotBase.getImportCatalogSnapshot
      ? {
          async getImportCatalogSnapshot(context: AcademicPersistenceContextV1) {
            const result = await snapshotBase.getImportCatalogSnapshot!(context);
            if (result) {
              for (const entry of result) capture(entry);
            }
            return result;
          },
        }
      : {}),
  };
  return {
    repository,
    assignments: () => [...assignments.values()],
  };
}

function mergedAssignmentsV1(
  loaded: readonly TeachingAssignmentV1[],
  planned: Awaited<ReturnType<typeof planAcademicCatalogBootstrapV1>>,
): readonly TeachingAssignmentV1[] {
  const merged = new Map(loaded.map((assignment) => [assignment.id, assignment]));
  if (planned.status === 'ready') {
    for (const assignment of planned.plannedAssignments) merged.set(assignment.id, assignment);
  }
  return [...merged.values()];
}

export async function createGradebookImportAnnualStateCacheV1(input: {
  readonly base: GradebookImportAnnualStateSourceV1;
  readonly academicYearId: AcademicYearId;
  readonly assignments: readonly TeachingAssignmentV1[];
  readonly classGroupIds: readonly ClassGroupId[];
  readonly preloadedAnnualByClass?: ReadonlyMap<ClassGroupId, readonly AnnualResultV1[]> | null;
}): Promise<GradebookImportAnnualStateSourceV1> {
  const assignments = new Map(input.assignments.map((assignment) => [assignment.id, assignment]));
  const classGroupIds = [...new Set(input.classGroupIds)];
  const relevantClassGroupIds = new Set<string>(classGroupIds);
  const annualByClass =
    input.preloadedAnnualByClass ??
    (input.base.loadCurrentAnnualResultsForClasses && classGroupIds.length > 0
      ? await input.base.loadCurrentAnnualResultsForClasses({
          academicYearId: input.academicYearId,
          classGroupIds,
        })
      : null);

  return {
    async listAssignments(page) {
      if (page.academicYearId !== input.academicYearId) {
        return input.base.listAssignments(page);
      }
      const matching = [...assignments.values()]
        .filter(
          (assignment) =>
            assignment.academicYearId === page.academicYearId &&
            assignment.classGroupId === page.classGroupId &&
            (page.cursor === null || assignment.id > page.cursor),
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const items = matching.slice(0, page.limit);
      const nextCursor = matching.length > page.limit ? (items.at(-1)?.id ?? null) : null;
      return { items, nextCursor };
    },
    async loadCurrentAnnualResultsForClass(request) {
      if (
        annualByClass &&
        request.academicYearId === input.academicYearId &&
        relevantClassGroupIds.has(request.classGroupId)
      ) {
        return annualByClass.get(request.classGroupId) ?? [];
      }
      return input.base.loadCurrentAnnualResultsForClass(request);
    },
    ...(input.base.loadCurrentAnnualResultsForClasses
      ? {
          async loadCurrentAnnualResultsForClasses(request: {
            readonly academicYearId: AcademicYearId;
            readonly classGroupIds: readonly ClassGroupId[];
          }): Promise<ReadonlyMap<ClassGroupId, readonly AnnualResultV1[]>> {
            const requested = [...new Set(request.classGroupIds)];
            if (
              annualByClass &&
              request.academicYearId === input.academicYearId &&
              requested.every((classGroupId) => relevantClassGroupIds.has(classGroupId))
            ) {
              return new Map(
                requested.map(
                  (classGroupId) => [classGroupId, annualByClass.get(classGroupId) ?? []] as const,
                ),
              );
            }
            return input.base.loadCurrentAnnualResultsForClasses!(request);
          },
        }
      : {}),
  };
}

type BulkEntityRepositoryV1 = PersistenceUnitOfWorkV2['entities'] & {
  readonly getMany?: (
    context: AcademicPersistenceContextV1,
    references: readonly AcademicEntityReferenceV1[],
  ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
};

type ReadyCatalogV1 = Extract<
  Awaited<ReturnType<typeof planAcademicCatalogBootstrapV1>>,
  { readonly status: 'ready' }
>;

export interface GradebookImportPersistenceServiceOptionsV5 {
  /**
   * Allows a newer wire adapter to add already-domain-valid catalog entities to the same atomic
   * import transaction. The callback cannot alter the academic request, CAS or persistence plan.
   */
  readonly additionalCatalogRecords?: (input: {
    readonly request: GradebookImportPersistenceRequestV5;
    readonly catalog: ReadyCatalogV1;
  }) => Promise<readonly AcademicEntityRecordV1[]>;
}

export function createGradebookImportPersistenceServiceV5(
  dependencies: GradebookImportPersistenceServiceDependenciesV4,
  options: GradebookImportPersistenceServiceOptionsV5 = {},
) {
  return {
    async execute(
      request: GradebookImportPersistenceRequestV5,
    ): Promise<GradebookImportPersistenceResponseV5> {
      try {
        const sharedUnitOfWork = createGradebookImportSharedSourceReadCacheV1(
          dependencies.unitOfWork,
        );
        const earlySourceHashWarmup = prewarmGradebookImportSharedSourceReadsV1({
          unitOfWork: sharedUnitOfWork,
          academicYearId: request.confirmedContext.academicYearId,
          sha256: request.manifest.sha256,
          teacherId: null,
        }).catch(() => undefined);
        const earlyAnnualResultsPrefetch = dependencies.annualStateSource.loadCurrentAnnualResultsForYear
          ? dependencies.annualStateSource
              .loadCurrentAnnualResultsForYear({
                academicYearId: request.confirmedContext.academicYearId,
              })
              .catch(() => null)
          : Promise.resolve(null);
        const catalogBootstrapEntities = createGradebookImportCatalogBootstrapReadCacheV1(
          sharedUnitOfWork.entities,
        );
        const capture = captureCatalogAssignmentsV1(catalogBootstrapEntities);
        const catalog = await planAcademicCatalogBootstrapV1({
          request,
          unitOfWork: { entities: capture.repository },
        });
        if (catalog.status !== 'ready') {
          void earlySourceHashWarmup;
          void earlyAnnualResultsPrefetch;
          return review();
        }

        const allAssignments = mergedAssignmentsV1(capture.assignments(), catalog);
        const assignmentsById = new Map(
          allAssignments.map((assignment) => [assignment.id, assignment]),
        );
        const classGroupIds: ClassGroupId[] = [];
        const seenClassGroupIds = new Set<string>();
        let commonTeacherId: TeacherId | null = null;
        let compatibleTeacherContext = true;
        for (const sheet of catalog.request.sheets) {
          const assignment = assignmentsById.get(sheet.teachingAssignmentId);
          if (!assignment) throw new Error('annual-assignment-cache-missing');
          if (!seenClassGroupIds.has(assignment.classGroupId)) {
            seenClassGroupIds.add(assignment.classGroupId);
            classGroupIds.push(assignment.classGroupId);
          }
          if (commonTeacherId === null) commonTeacherId = assignment.teacherId;
          else if (commonTeacherId !== assignment.teacherId) compatibleTeacherContext = false;
        }

        const annualStatePromise = earlyAnnualResultsPrefetch.then((preloadedAnnualByClass) =>
          createGradebookImportAnnualStateCacheV1({
            base: dependencies.annualStateSource,
            academicYearId: catalog.request.confirmedContext.academicYearId,
            assignments: allAssignments,
            classGroupIds,
            preloadedAnnualByClass,
          }),
        );
        const sourceWarmupPromise = prewarmGradebookImportSharedSourceReadsV1({
          unitOfWork: sharedUnitOfWork,
          academicYearId: catalog.request.confirmedContext.academicYearId,
          sha256: catalog.request.manifest.sha256,
          teacherId: compatibleTeacherContext ? commonTeacherId : null,
        });
        const [annualStateSource] = await Promise.all([annualStatePromise, sourceWarmupPromise]);

        const additionalRecords = options.additionalCatalogRecords
          ? await options.additionalCatalogRecords({ request, catalog })
          : [];
        const catalogRecords = [...catalog.records, ...additionalRecords];

        const sourceEntities = sharedUnitOfWork.entities as BulkEntityRepositoryV1;
        const planningEntities = Object.assign(
          {},
          catalog.repository,
          sourceEntities.getMany
            ? {
                getMany: (
                  context: AcademicPersistenceContextV1,
                  references: readonly AcademicEntityReferenceV1[],
                ) => sourceEntities.getMany!(context, references),
              }
            : {},
        );
        const planningUnitOfWork: PersistenceUnitOfWorkV2 = {
          ...sharedUnitOfWork,
          entities: planningEntities,
        };
        const transaction = {
          runImportBootstrap: async <T>(
            context: Parameters<
              GradebookImportPersistenceServiceDependenciesV4['transaction']['runImportBootstrap']
            >[0],
            envelope: Parameters<
              GradebookImportPersistenceServiceDependenciesV4['transaction']['runImportBootstrap']
            >[1],
            operation: (unitOfWork: PersistenceUnitOfWorkV2) => Promise<T>,
          ): Promise<T> =>
            dependencies.transaction.runImportBootstrap(context, envelope, async (unitOfWork) => {
              for (const record of catalogRecords) {
                const result = await unitOfWork.entities.appendVersion(context, record, {
                  expectedVersion: null,
                });
                if (result.status !== 'written')
                  throw new Error('academic-catalog-version-conflict');
              }
              return operation(unitOfWork);
            }),
        };
        const service = createGradebookImportPersistenceServiceV4(
          {
            ...dependencies,
            unitOfWork: planningUnitOfWork,
            transaction,
            annualStateSource,
          },
          { materializeAssessmentDefinitions: materializeAssessmentDefinitionsV4 },
        );
        return asGradebookImportPersistenceResponseV5(await service.execute(catalog.request));
      } catch {
        return {
          transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
          state: 'unavailable',
        };
      }
    },
  };
}
