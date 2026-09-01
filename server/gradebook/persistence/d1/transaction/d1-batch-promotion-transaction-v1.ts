import type {
  AcademicPersistenceContextV1,
  BatchPromotionRequestV1,
  BatchPromotionTransactionPortV1,
  PersistenceUnitOfWorkV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  createGradebookD1WriteUnitOfWorkV1,
  type D1WriteDatabaseV1,
  type GradebookD1WriteAdapterOptionsV1,
} from '../write/d1-write-adapter-v1';

type D1TransactionRowV1 = Record<string, unknown>;

export type GradebookD1TransactionErrorCodeV1 =
  | 'batch-version-conflict'
  | 'file-not-approved'
  | 'invalid-request'
  | 'nested-transaction'
  | 'transaction-failed';

const ERROR_MESSAGES: Record<GradebookD1TransactionErrorCodeV1, string> = {
  'batch-version-conflict': 'O lote acadêmico não está na versão esperada para promoção.',
  'file-not-approved': 'A promoção contém arquivo sem aprovação persistida.',
  'invalid-request': 'A requisição de promoção possui formato incompatível.',
  'nested-transaction': 'Já existe uma promoção ativa nesta conexão local.',
  'transaction-failed': 'A promoção transacional local falhou sem confirmar alterações.',
};

export class GradebookD1TransactionErrorV1 extends Error {
  readonly code: GradebookD1TransactionErrorCodeV1;

  constructor(code: GradebookD1TransactionErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1TransactionErrorV1';
    this.code = code;
  }
}

function fail(code: GradebookD1TransactionErrorCodeV1): never {
  throw new GradebookD1TransactionErrorV1(code);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validRequest(
  context: AcademicPersistenceContextV1,
  request: BatchPromotionRequestV1,
): boolean {
  return (
    nonEmptyString(context.academicYearId) &&
    nonEmptyString(request.importBatchId) &&
    positiveInteger(request.expectedBatchVersion) &&
    request.approvedImportFileIds.every(nonEmptyString) &&
    new Set(request.approvedImportFileIds).size === request.approvedImportFileIds.length
  );
}

export class GradebookD1BatchPromotionTransactionV1 implements BatchPromotionTransactionPortV1 {
  private active = false;
  private readonly unitOfWork: PersistenceUnitOfWorkV1;

  constructor(
    private readonly database: D1WriteDatabaseV1,
    options: GradebookD1WriteAdapterOptionsV1 = {},
  ) {
    this.unitOfWork = createGradebookD1WriteUnitOfWorkV1(database, options);
  }

  private async control(statement: string): Promise<void> {
    try {
      await this.database.exec(statement);
    } catch {
      fail('transaction-failed');
    }
  }

  private async rollback(): Promise<void> {
    try {
      await this.database.exec('ROLLBACK');
    } catch {
      fail('transaction-failed');
    }
  }

  private async assertPromotable(
    context: AcademicPersistenceContextV1,
    request: BatchPromotionRequestV1,
  ): Promise<void> {
    let current: D1TransactionRowV1 | null;
    try {
      current = await this.database
        .prepare(
          `SELECT s.current_version
           FROM import_batch_streams s
           INNER JOIN import_batch_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.import_batch_id = s.import_batch_id
            AND v.version = s.current_version
           WHERE s.academic_year_id = ? AND s.import_batch_id = ?`,
        )
        .bind(context.academicYearId, request.importBatchId)
        .first<D1TransactionRowV1>();
    } catch {
      fail('transaction-failed');
    }

    if (!current || current.current_version !== request.expectedBatchVersion) {
      fail('batch-version-conflict');
    }

    if (request.approvedImportFileIds.length === 0) return;

    let rows: readonly D1TransactionRowV1[];
    try {
      const result = await this.database
        .prepare(
          `SELECT import_file_id, status
           FROM import_batch_files
           WHERE academic_year_id = ? AND import_batch_id = ? AND batch_version = ?`,
        )
        .bind(context.academicYearId, request.importBatchId, request.expectedBatchVersion)
        .all<D1TransactionRowV1>();
      rows = result.results;
    } catch {
      fail('transaction-failed');
    }

    const approved = new Set(
      rows
        .filter(({ status }) => status === 'approved')
        .map(({ import_file_id }) => import_file_id)
        .filter(nonEmptyString),
    );
    if (request.approvedImportFileIds.some((id) => !approved.has(id))) {
      fail('file-not-approved');
    }
  }

  async runBatchPromotion<T>(
    context: AcademicPersistenceContextV1,
    request: BatchPromotionRequestV1,
    operation: (unitOfWork: PersistenceUnitOfWorkV1) => Promise<T>,
  ): Promise<T> {
    if (!validRequest(context, request)) return fail('invalid-request');
    if (this.active) return fail('nested-transaction');

    this.active = true;
    try {
      await this.control('BEGIN IMMEDIATE');

      try {
        await this.assertPromotable(context, request);
        const result = await operation(this.unitOfWork);
        await this.control('COMMIT');
        return result;
      } catch (cause) {
        await this.rollback();
        throw cause;
      }
    } finally {
      this.active = false;
    }
  }
}
