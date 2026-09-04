import type {
  AcademicPersistenceContextV1,
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
    try {
      if (supportsAtomicBatch(this.database)) {
        const recorder = new GradebookD1AtomicBatchRecorderV1(this.database);
        const baseUnitOfWork = createGradebookD1PersistenceUnitOfWorkV2(recorder, {
          ...this.options,
          bootstrapManifestVersions: new Map(
            request.plannedSourceFileManifestIds.map((id) => [id, 1]),
          ),
        });
        const bulk = createGradebookD1ImportBootstrapBulkUnitOfWorkV1({
          database: this.database,
          recorder,
          baseUnitOfWork,
          now: () => this.now(),
        });
        const result = await operation(bulk.unitOfWork);
        bulk.flush();
        try {
          await recorder.commit();
        } catch {
          // Any optimistic mismatch or set-based write failure rolls the single D1 batch back.
          throw new GradebookD1TransactionErrorV1('batch-version-conflict');
        }
        return result;
      }

      await this.control('BEGIN IMMEDIATE');
      try {
        const baseUnitOfWork = createGradebookD1PersistenceUnitOfWorkV2(this.database, this.options);
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
