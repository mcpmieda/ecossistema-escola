import type {
  PersistenceUnitOfWorkV1,
  VersionedWriteResultV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../d1/composition/d1-persistence-unit-of-work-v1';
import type { GradebookD1PersistenceUnitOfWorkOptionsV1 } from '../d1/composition/d1-persistence-unit-of-work-v1';
import type { D1WriteDatabaseV1 } from '../d1/write/d1-write-adapter-v1';
import type { GradebookPostgresDatabaseV1 } from './postgres-database-v1';

type AsyncWriteV1<T> = () => Promise<VersionedWriteResultV1<T>>;

function transactionalWrite<T>(
  database: GradebookPostgresDatabaseV1,
  operation: (unitOfWork: PersistenceUnitOfWorkV2) => AsyncWriteV1<T>,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1,
): Promise<VersionedWriteResultV1<T>> {
  return database.transaction((transactionDatabase) =>
    operation(createGradebookD1PersistenceUnitOfWorkV2(transactionDatabase, options))(),
  );
}

function transactionalUnitOfWorkV2(
  database: GradebookPostgresDatabaseV1,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1,
): PersistenceUnitOfWorkV2 {
  const reads = createGradebookD1PersistenceUnitOfWorkV2(database, options);

  return {
    entities: {
      get: reads.entities.get.bind(reads.entities),
      list: reads.entities.list.bind(reads.entities),
      appendVersion: (context, record, expectation) =>
        transactionalWrite(
          database,
          (unit) => () => unit.entities.appendVersion(context, record, expectation),
          options,
        ),
    },
    imports: {
      findSourceFileByHash: reads.imports.findSourceFileByHash.bind(reads.imports),
      getSourceFileVersion: reads.imports.getSourceFileVersion.bind(reads.imports),
      listLogicalSourceVersions: reads.imports.listLogicalSourceVersions.bind(reads.imports),
      getImportBatch: reads.imports.getImportBatch.bind(reads.imports),
      appendSourceFileVersion: (context, value, expectation) =>
        transactionalWrite(
          database,
          (unit) => () => unit.imports.appendSourceFileVersion(context, value, expectation),
          options,
        ),
      appendImportBatchVersion: (context, value, expectation) =>
        transactionalWrite(
          database,
          (unit) => () => unit.imports.appendImportBatchVersion(context, value, expectation),
          options,
        ),
    },
    academicRecords: {
      getCurrent: reads.academicRecords.getCurrent.bind(reads.academicRecords),
      listVersions: reads.academicRecords.listVersions.bind(reads.academicRecords),
      appendVersion: (context, stream, record, expectation) =>
        transactionalWrite(
          database,
          (unit) => () => unit.academicRecords.appendVersion(context, stream, record, expectation),
          options,
        ),
    },
    logicalSourceRecords: {
      getCurrent: reads.logicalSourceRecords.getCurrent.bind(reads.logicalSourceRecords),
      listCurrentStreams: reads.logicalSourceRecords.listCurrentStreams.bind(
        reads.logicalSourceRecords,
      ),
      listVersions: reads.logicalSourceRecords.listVersions.bind(reads.logicalSourceRecords),
      appendVersion: (context, stream, association, expectation) =>
        transactionalWrite(
          database,
          (unit) => () =>
            unit.logicalSourceRecords.appendVersion(context, stream, association, expectation),
          options,
        ),
    },
    audit: {
      getCurrent: reads.audit.getCurrent.bind(reads.audit),
      listVersions: reads.audit.listVersions.bind(reads.audit),
      appendVersion: (context, stream, record, expectation) =>
        transactionalWrite(
          database,
          (unit) => () => unit.audit.appendVersion(context, stream, record, expectation),
          options,
        ),
    },
    logicalSources: {
      get: reads.logicalSources.get.bind(reads.logicalSources),
      listByContext: reads.logicalSources.listByContext.bind(reads.logicalSources),
      createInitial: (context, source) =>
        database.transaction((transactionDatabase) =>
          createGradebookD1PersistenceUnitOfWorkV2(
            transactionDatabase,
            options,
          ).logicalSources.createInitial(context, source),
        ),
    },
  };
}

/**
 * PostgreSQL implementation of the existing provider-independent persistence
 * ports. Reads use the Hyperdrive-backed connection and every standalone write
 * receives a real PostgreSQL transaction. Import orchestration should use the
 * dedicated bootstrap transaction adapter so all families commit together.
 */
export function createGradebookPostgresPersistenceUnitOfWorkV2(
  database: GradebookPostgresDatabaseV1,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1 = {},
): PersistenceUnitOfWorkV2 {
  return transactionalUnitOfWorkV2(database, options);
}

export function createGradebookPostgresPersistenceUnitOfWorkV1(
  database: GradebookPostgresDatabaseV1,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1 = {},
): PersistenceUnitOfWorkV1 {
  return createGradebookPostgresPersistenceUnitOfWorkV2(database, options);
}

export function createGradebookPostgresTransactionalUnitOfWorkV2(
  database: D1WriteDatabaseV1,
  options: GradebookD1PersistenceUnitOfWorkOptionsV1 = {},
): PersistenceUnitOfWorkV2 {
  return createGradebookD1PersistenceUnitOfWorkV2(database, options);
}
