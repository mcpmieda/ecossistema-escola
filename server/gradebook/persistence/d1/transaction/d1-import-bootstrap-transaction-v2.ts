import type { AcademicPersistenceContextV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
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
import type {
  D1WriteDatabaseV1,
  GradebookD1WriteAdapterOptionsV1,
} from '../write/d1-write-adapter-v1';

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
        const result = await operation(
          createGradebookD1PersistenceUnitOfWorkV2(recorder, {
            ...this.options,
            bootstrapManifestVersions: new Map(
              request.plannedSourceFileManifestIds.map((id) => [id, 1]),
            ),
          }),
        );
        try {
          await recorder.commit();
        } catch {
          // A recorded optimistic guard or a concurrent bootstrap failed at D1 batch commit.
          throw new GradebookD1TransactionErrorV1('batch-version-conflict');
        }
        return result;
      }

      await this.control('BEGIN IMMEDIATE');
      try {
        const result = await operation(
          createGradebookD1PersistenceUnitOfWorkV2(this.database, this.options),
        );
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
