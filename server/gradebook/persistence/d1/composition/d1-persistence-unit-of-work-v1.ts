import type { PersistenceUnitOfWorkV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { createGradebookD1AuditRepositoryV1 } from '../audit/d1-audit-repository-v1';
import { createGradebookD1AcademicEntityRepositoryV1 } from '../entities/d1-academic-entity-repository-v1';
import { createGradebookD1ImportRepositoryExtensionV1 } from '../imports/d1-import-repository-extension-v1';
import {
  createGradebookD1WriteUnitOfWorkV1,
  type D1WriteDatabaseV1,
} from '../write/d1-write-adapter-v1';

export interface GradebookD1PersistenceUnitOfWorkOptionsV1 {
  readonly now?: () => string;
  readonly maximumPageSize?: number;
}

/**
 * Composes exactly one provider for every operation covered by migrations 0001–0003.
 * The existing write adapter remains the owner of academic-year, source, academic-record
 * and logical-source-association operations.
 */
export function createGradebookD1PersistenceUnitOfWorkV1(
  database: D1WriteDatabaseV1,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1 = {},
): PersistenceUnitOfWorkV1 {
  const integrated = createGradebookD1WriteUnitOfWorkV1(database, { now: options.now });
  const academicEntities = createGradebookD1AcademicEntityRepositoryV1(database, options);
  const importExtension = createGradebookD1ImportRepositoryExtensionV1(database, options);
  const audit = createGradebookD1AuditRepositoryV1(database, options);

  return {
    entities: {
      get: (context, reference) =>
        reference.kind === 'academic-year'
          ? integrated.entities.get(context, reference)
          : academicEntities.get(context, reference),
      list: (context, kind, page) =>
        kind === 'academic-year'
          ? integrated.entities.list(context, kind, page)
          : academicEntities.list(context, kind, page),
      appendVersion: (context, record, expectation) =>
        record.kind === 'academic-year'
          ? integrated.entities.appendVersion(context, record, expectation)
          : academicEntities.appendVersion(context, record, expectation),
    },
    imports: {
      findSourceFileByHash: integrated.imports.findSourceFileByHash,
      getSourceFileVersion: integrated.imports.getSourceFileVersion,
      listLogicalSourceVersions: importExtension.listLogicalSourceVersions,
      appendSourceFileVersion: integrated.imports.appendSourceFileVersion,
      getImportBatch: importExtension.getImportBatch,
      appendImportBatchVersion: importExtension.appendImportBatchVersion,
    },
    academicRecords: integrated.academicRecords,
    logicalSourceRecords: integrated.logicalSourceRecords,
    audit,
  };
}
