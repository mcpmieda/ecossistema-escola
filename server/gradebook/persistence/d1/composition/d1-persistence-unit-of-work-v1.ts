import type { PersistenceUnitOfWorkV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { createGradebookD1AuditRepositoryV1 } from '../audit/d1-audit-repository-v1';
import { createGradebookD1AcademicEntityRepositoryV1 } from '../entities/d1-academic-entity-repository-v1';
import { createGradebookD1ImportRepositoryExtensionV1 } from '../imports/d1-import-repository-extension-v1';
import { createGradebookD1LogicalSourceRepositoryV2 } from '../imports/d1-logical-source-repository-v2';
import { createGradebookD1ImportPlanningBulkReadAdapterV1 } from '../read/d1-import-planning-bulk-read-v1';
import { createGradebookD1StudentStatusBulkReadV1 } from '../read/d1-student-status-bulk-read-v1';
import {
  createGradebookD1WriteUnitOfWorkV1,
  type D1WriteDatabaseV1,
} from '../write/d1-write-adapter-v1';

export interface GradebookD1PersistenceUnitOfWorkOptionsV1 {
  readonly now?: () => string;
  readonly maximumPageSize?: number;
  readonly bootstrapManifestVersions?: ReadonlyMap<string, number>;
}

export function createGradebookD1PersistenceUnitOfWorkV1(
  database: D1WriteDatabaseV1,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1 = {},
): PersistenceUnitOfWorkV1 {
  const integrated = createGradebookD1WriteUnitOfWorkV1(database, { now: options.now });
  const academicEntities = createGradebookD1AcademicEntityRepositoryV1(database, options);
  const importExtension = createGradebookD1ImportRepositoryExtensionV1(database, options);
  const audit = createGradebookD1AuditRepositoryV1(database, options);
  const planningBulkReads = createGradebookD1ImportPlanningBulkReadAdapterV1(database);
  const studentStatusBulkReads = createGradebookD1StudentStatusBulkReadV1(database);

  const entities = Object.assign(
    {
      get: (context: Parameters<typeof academicEntities.get>[0], reference: Parameters<typeof academicEntities.get>[1]) =>
        reference.kind === 'academic-year'
          ? integrated.entities.get(context, reference)
          : academicEntities.get(context, reference),
      list: (context: Parameters<typeof academicEntities.list>[0], kind: Parameters<typeof academicEntities.list>[1], page: Parameters<typeof academicEntities.list>[2]) =>
        kind === 'academic-year'
          ? integrated.entities.list(context, kind, page)
          : academicEntities.list(context, kind, page),
      appendVersion: (
        context: Parameters<typeof academicEntities.appendVersion>[0],
        record: Parameters<typeof academicEntities.appendVersion>[1],
        expectation: Parameters<typeof academicEntities.appendVersion>[2],
      ) =>
        record.kind === 'academic-year'
          ? integrated.entities.appendVersion(context, record, expectation)
          : academicEntities.appendVersion(context, record, expectation),
    },
    planningBulkReads.entities,
    studentStatusBulkReads,
  );
  const academicRecords = Object.assign({}, integrated.academicRecords, planningBulkReads.academicRecords);
  const logicalSourceRecords = Object.assign(
    {},
    integrated.logicalSourceRecords,
    planningBulkReads.logicalSourceRecords,
  );

  return {
    entities,
    imports: {
      findSourceFileByHash: integrated.imports.findSourceFileByHash,
      getSourceFileVersion: integrated.imports.getSourceFileVersion,
      listLogicalSourceVersions: importExtension.listLogicalSourceVersions,
      appendSourceFileVersion: integrated.imports.appendSourceFileVersion,
      getImportBatch: importExtension.getImportBatch,
      appendImportBatchVersion: importExtension.appendImportBatchVersion,
    },
    academicRecords,
    logicalSourceRecords,
    audit,
  };
}

export function createGradebookD1PersistenceUnitOfWorkV2(
  database: D1WriteDatabaseV1,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1 = {},
): PersistenceUnitOfWorkV2 {
  return {
    ...createGradebookD1PersistenceUnitOfWorkV1(database, options),
    logicalSources: createGradebookD1LogicalSourceRepositoryV2(database),
  };
}
