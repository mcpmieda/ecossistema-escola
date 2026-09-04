import type { GradebookImportPersistenceSummaryV2 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import {
  asGradebookImportPersistenceResponseV5,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
  type GradebookImportPersistenceRequestV5,
  type GradebookImportPersistenceResponseV5,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { materializeAssessmentDefinitionsV4 } from '../../../../src/features/gradebook/import/assessment-definition-materializer-v4';
import type { GradebookImportAnnualStateSourceV1 } from '../../persistence/d1/imports/d1-import-annual-state-source-v1';
import { planAcademicCatalogBootstrapV1 } from './academic-catalog-bootstrap-v1';
import {
  createGradebookImportPersistenceServiceV4,
  type GradebookImportPersistenceServiceDependenciesV4,
} from './import-persistence-service-v2';

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

function annualStateWithPlannedAssignments(
  base: GradebookImportAnnualStateSourceV1,
  planned: Awaited<ReturnType<typeof planAcademicCatalogBootstrapV1>>,
): GradebookImportAnnualStateSourceV1 {
  const assignments = planned.status === 'ready' ? planned.plannedAssignments : [];
  return {
    async listAssignments(input) {
      if (input.cursor !== null) return base.listAssignments(input);
      const existing = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        const page = await base.listAssignments({ ...input, cursor });
        existing.push(...page.items);
        if (page.nextCursor === null) break;
        if (seen.has(page.nextCursor)) throw new Error('annual-curriculum-cursor-cycle');
        seen.add(page.nextCursor);
        cursor = page.nextCursor;
        if (pageNumber === 9) throw new Error('annual-curriculum-too-large');
      }
      const merged = new Map(existing.map((assignment) => [assignment.id, assignment]));
      for (const assignment of assignments) {
        if (
          assignment.academicYearId === input.academicYearId &&
          assignment.classGroupId === input.classGroupId
        ) {
          merged.set(assignment.id, assignment);
        }
      }
      const items = [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
      if (items.length > input.limit) throw new Error('annual-curriculum-too-large');
      return { items, nextCursor: null };
    },
    loadCurrentAnnualResultsForClass: (input) => base.loadCurrentAnnualResultsForClass(input),
  };
}

export function createGradebookImportPersistenceServiceV5(
  dependencies: GradebookImportPersistenceServiceDependenciesV4,
) {
  return {
    async execute(
      request: GradebookImportPersistenceRequestV5,
    ): Promise<GradebookImportPersistenceResponseV5> {
      try {
        const catalog = await planAcademicCatalogBootstrapV1({
          request,
          unitOfWork: dependencies.unitOfWork,
        });
        if (catalog.status !== 'ready') return review();

        const planningUnitOfWork: PersistenceUnitOfWorkV2 = {
          ...dependencies.unitOfWork,
          entities: catalog.repository,
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
              for (const record of catalog.records) {
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
            annualStateSource: annualStateWithPlannedAssignments(
              dependencies.annualStateSource,
              catalog,
            ),
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
