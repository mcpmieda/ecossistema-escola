import { boundedGradebookImportDatabaseV1 } from './d1-bounded-import-transport-v1';
import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  VersionExpectationV1,
  VersionedWriteResultV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  inspectImportBootstrapTransactionRequestV2,
  type ImportBootstrapTransactionPortV2,
  type ImportBootstrapTransactionRequestV2,
  type PersistenceUnitOfWorkV2,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../composition/d1-persistence-unit-of-work-v1';
import {
  GradebookD1AtomicBatchRecorderV1,
  GradebookD1TransactionErrorV1,
  supportsAtomicBatch,
} from './d1-batch-promotion-transaction-v1';
import { createGradebookD1ImportBootstrapBulkUnitOfWorkV1 } from './d1-import-bootstrap-bulk-write-v1';
import type {
  D1WriteDatabaseV1,
  GradebookD1WriteAdapterOptionsV1,
} from '../write/d1-write-adapter-v1';

const MAX_BUFFERED_BULK_WRITES_V2 = 512;

interface DeferredAssociationWriteV2 {
  readonly context: AcademicPersistenceContextV1;
  readonly stream: LogicalSourceRecordAssociationStreamV1;
  readonly value: LogicalSourceRecordAssociationV1;
  readonly expectation: VersionExpectationV1;
  readonly expectedWrittenVersion: number;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bootstrapManifestVersions(
  request: ImportBootstrapTransactionRequestV2,
): ReadonlyMap<string, number> {
  if (request.sourceManifestVersions !== undefined) {
    return new Map(
      request.sourceManifestVersions.map(({ manifestId, version }) => [manifestId, version]),
    );
  }
  return new Map(request.plannedSourceFileManifestIds.map((id) => [id, 1]));
}

function createBoundedBulkUnitOfWorkV2(input: {
  readonly database: D1WriteDatabaseV1;
  readonly recorder: GradebookD1AtomicBatchRecorderV1;
  readonly baseUnitOfWork: PersistenceUnitOfWorkV2;
  readonly now: () => string;
}): { readonly unitOfWork: PersistenceUnitOfWorkV2; readonly flush: () => void } {
  const bulk = createGradebookD1ImportBootstrapBulkUnitOfWorkV1(input);
  const base = bulk.unitOfWork;
  let entities = 0;
  let academicRecords = 0;
  let associations = 0;

  const flush = () => {
    bulk.flush();
    entities = 0;
    academicRecords = 0;
    associations = 0;
  };

  const unitOfWork: PersistenceUnitOfWorkV2 = {
    ...base,
    entities: {
      ...base.entities,
      appendVersion: async (
        context: AcademicPersistenceContextV1,
        record: AcademicEntityRecordV1,
        expectation: VersionExpectationV1,
      ) => {
        const result = await base.entities.appendVersion(context, record, expectation);
        entities += 1;
        if (entities >= MAX_BUFFERED_BULK_WRITES_V2) flush();
        return result;
      },
    },
    academicRecords: {
      ...base.academicRecords,
      appendVersion: async (
        context: AcademicPersistenceContextV1,
        stream: AcademicRecordStreamV1,
        record: AcademicRecordV1,
        expectation: VersionExpectationV1,
      ) => {
        const result = await base.academicRecords.appendVersion(
          context,
          stream,
          record,
          expectation,
        );
        academicRecords += 1;
        if (academicRecords >= MAX_BUFFERED_BULK_WRITES_V2) flush();
        return result;
      },
    },
    logicalSourceRecords: {
      ...base.logicalSourceRecords,
      appendVersion: async (
        context: AcademicPersistenceContextV1,
        stream: LogicalSourceRecordAssociationStreamV1,
        value: LogicalSourceRecordAssociationV1,
        expectation: VersionExpectationV1,
      ) => {
        const result = await base.logicalSourceRecords.appendVersion(
          context,
          stream,
          value,
          expectation,
        );
        associations += 1;
        if (associations >= MAX_BUFFERED_BULK_WRITES_V2) flush();
        return result;
      },
    },
  };

  return { unitOfWork, flush };
}

function deferAssociationWritesV2(
  unitOfWork: PersistenceUnitOfWorkV2,
  now: () => string,
): {
  readonly unitOfWork: PersistenceUnitOfWorkV2;
  readonly flush: () => Promise<void>;
} {
  const repository = unitOfWork.logicalSourceRecords;
  const pending: DeferredAssociationWriteV2[] = [];
  const deferredRepository = {
    getCurrent: repository.getCurrent.bind(repository),
    listCurrentStreams: repository.listCurrentStreams.bind(repository),
    listVersions: repository.listVersions.bind(repository),
    async appendVersion(
      context: AcademicPersistenceContextV1,
      stream: LogicalSourceRecordAssociationStreamV1,
      value: LogicalSourceRecordAssociationV1,
      expectation: VersionExpectationV1,
    ): Promise<VersionedWriteResultV1<LogicalSourceRecordAssociationV1>> {
      const expectedWrittenVersion = (expectation.expectedVersion ?? 0) + 1;
      pending.push({ context, stream, value, expectation, expectedWrittenVersion });
      return {
        status: 'written',
        record: { value, version: expectedWrittenVersion, recordedAt: now() },
      };
    },
  };

  return {
    unitOfWork: { ...unitOfWork, logicalSourceRecords: deferredRepository },
    async flush() {
      for (const write of pending) {
        const result = await repository.appendVersion(
          write.context,
          write.stream,
          write.value,
          write.expectation,
        );
        if (result.status === 'version-conflict') {
          throw new GradebookD1TransactionErrorV1('batch-version-conflict');
        }
        if (
          result.record.version !== write.expectedWrittenVersion ||
          !sameValue(result.record.value, write.value)
        ) {
          throw new GradebookD1TransactionErrorV1('transaction-failed');
        }
      }
    },
  };
}

export class GradebookD1ImportBootstrapTransactionV2 implements ImportBootstrapTransactionPortV2 {
  private active = false;

  constructor(
    private readonly database: D1WriteDatabaseV1,
    private readonly options: GradebookD1WriteAdapterOptionsV1 = {},
  ) {}

  private async control(statement: string): Promise<void> {
    try {
      await this.database.exec(statement);
    } catch {
      throw new GradebookD1TransactionErrorV1('transaction-failed');
    }
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  async runImportBootstrap<T>(
    context: AcademicPersistenceContextV1,
    request: ImportBootstrapTransactionRequestV2,
    operation: (unitOfWork: PersistenceUnitOfWorkV2) => Promise<T>,
  ): Promise<T> {
    if (inspectImportBootstrapTransactionRequestV2(context, request) !== 'ready') {
      throw new GradebookD1TransactionErrorV1('invalid-request');
    }
    if (this.active) throw new GradebookD1TransactionErrorV1('nested-transaction');
    this.active = true;
    const manifestVersions = bootstrapManifestVersions(request);
    try {
      if (supportsAtomicBatch(this.database)) {
        const bounded = boundedGradebookImportDatabaseV1(this.database, context.academicYearId);
        if (!supportsAtomicBatch(bounded))
          throw new GradebookD1TransactionErrorV1('transaction-failed');
        const recorder = new GradebookD1AtomicBatchRecorderV1(bounded);
        const baseUnitOfWork = createGradebookD1PersistenceUnitOfWorkV2(recorder, {
          ...this.options,
          bootstrapManifestVersions: manifestVersions,
        });
        const bulk = createBoundedBulkUnitOfWorkV2({
          database: bounded,
          recorder,
          baseUnitOfWork,
          now: () => this.now(),
        });
        const result = await operation(bulk.unitOfWork);
        bulk.flush();
        await recorder.commit();
        return result;
      }

      await this.control('BEGIN IMMEDIATE');
      try {
        const baseUnitOfWork = createGradebookD1PersistenceUnitOfWorkV2(this.database, {
          ...this.options,
          bootstrapManifestVersions: manifestVersions,
        });
        const ordered = deferAssociationWritesV2(baseUnitOfWork, () => this.now());
        const result = await operation(ordered.unitOfWork);
        await ordered.flush();
        await this.control('COMMIT');
        return result;
      } catch (cause) {
        try {
          await this.control('ROLLBACK');
        } catch {
          throw new GradebookD1TransactionErrorV1('transaction-failed');
        }
        throw cause;
      }
    } finally {
      this.active = false;
    }
  }
}
