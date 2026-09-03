import type { AcademicYearId, TeacherId } from '../../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type { SourceFileManifestId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AcademicPersistenceContextV1,
  BatchPromotionRequestV1,
  CursorPageRequestV1,
  CursorPageV1,
  LogicalSourceIdV1,
  PersistenceUnitOfWorkV1,
} from './persistence-ports-v1';

export const TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2 = 'teacher-year-gradebook' as const;

/** Server-owned compatibility context for the current multi-sheet teacher workbook. */
export interface TeacherYearGradebookLogicalSourceContextV2 {
  readonly kind: typeof TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2;
  readonly academicYearId: AcademicYearId;
  readonly teacherId: TeacherId;
}

export interface LogicalSourceV2 {
  readonly id: LogicalSourceIdV1;
  readonly academicYearId: AcademicYearId;
  readonly teacherId: TeacherId;
  readonly sourceContext: typeof TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2;
  readonly createdAt: string;
}

export type LogicalSourceInitialWriteResultV2 =
  | {
      readonly status: 'created' | 'already-present';
      readonly value: LogicalSourceV2;
    }
  | {
      readonly status: 'resolution-conflict';
      readonly reason:
        | 'compatible-source-created-concurrently'
        | 'logical-source-id-collision'
        | 'incompatible-context';
    };

/**
 * Narrow lifecycle port backed by the existing `logical_sources` storage shape.
 * It deliberately offers no generic update or delete.
 */
export interface LogicalSourceRepositoryV2 {
  get(
    context: AcademicPersistenceContextV1,
    logicalSourceId: LogicalSourceIdV1,
  ): Promise<LogicalSourceV2 | null>;

  listByContext(
    context: AcademicPersistenceContextV1,
    sourceContext: TeacherYearGradebookLogicalSourceContextV2,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<LogicalSourceV2>>;

  /**
   * Creates the server-owned initial source inside the caller's transaction.
   * Repeating the same ID and context is idempotent. A competing compatible
   * source or incompatible/colliding identity must fail closed and roll back.
   */
  createInitial(
    context: AcademicPersistenceContextV1,
    source: LogicalSourceV2,
  ): Promise<LogicalSourceInitialWriteResultV2>;
}

export interface PersistenceUnitOfWorkV2 extends PersistenceUnitOfWorkV1 {
  readonly logicalSources: LogicalSourceRepositoryV2;
}

export type ImportBootstrapLogicalSourceV2 =
  | {
      readonly kind: 'reuse';
      readonly value: LogicalSourceV2;
    }
  | {
      readonly kind: 'create';
      readonly value: LogicalSourceV2;
    };

export interface ImportBootstrapBatchWriteV2 {
  readonly value: ImportBatchResultV1;
  /** A bounded request creates its own server-issued batch stream. */
  readonly expectedVersion: null;
}

/**
 * Server-built envelope. None of these IDs, CAS expectations, or decisions are
 * accepted from the browser transport.
 */
export interface ImportBootstrapTransactionRequestV2 {
  readonly logicalSource: ImportBootstrapLogicalSourceV2;
  readonly plannedSourceFileManifestIds: readonly SourceFileManifestId[];
  readonly batchWrite: ImportBootstrapBatchWriteV2;
  readonly promotionRequest: BatchPromotionRequestV1;
}

export interface ImportBootstrapTransactionPortV2 {
  /**
   * Opens one atomic unit of work for logical source (when new), planned source
   * versions, batch, assessment components, records, and associations. The
   * application owns this order; rejection leaves no partial commit.
   */
  runImportBootstrap<T>(
    context: AcademicPersistenceContextV1,
    request: ImportBootstrapTransactionRequestV2,
    operation: (unitOfWork: PersistenceUnitOfWorkV2) => Promise<T>,
  ): Promise<T>;
}

export type ImportBootstrapTransactionRequestInspectionV2 =
  | 'ready'
  | 'invalid-context'
  | 'invalid-logical-source'
  | 'invalid-batch-bootstrap'
  | 'duplicate-source-manifest';

export function inspectImportBootstrapTransactionRequestV2(
  context: AcademicPersistenceContextV1,
  request: ImportBootstrapTransactionRequestV2,
): ImportBootstrapTransactionRequestInspectionV2 {
  if (
    request.logicalSource.value.academicYearId !== context.academicYearId ||
    request.logicalSource.value.sourceContext !== TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2
  ) {
    return 'invalid-context';
  }
  if (
    request.logicalSource.value.id.trim().length === 0 ||
    request.logicalSource.value.teacherId.trim().length === 0 ||
    Number.isNaN(Date.parse(request.logicalSource.value.createdAt))
  ) {
    return 'invalid-logical-source';
  }
  if (
    request.batchWrite.expectedVersion !== null ||
    request.batchWrite.value.id !== request.promotionRequest.importBatchId ||
    request.promotionRequest.expectedBatchVersion !== 1 ||
    request.batchWrite.value.status !== 'approved'
  ) {
    return 'invalid-batch-bootstrap';
  }
  const approvedIds = new Set(
    request.batchWrite.value.files
      .filter((file) => file.status === 'approved')
      .map((file) => file.id),
  );
  if (
    new Set(request.promotionRequest.approvedImportFileIds).size !==
      request.promotionRequest.approvedImportFileIds.length ||
    request.promotionRequest.approvedImportFileIds.some((id) => !approvedIds.has(id))
  ) {
    return 'invalid-batch-bootstrap';
  }
  if (
    new Set(request.plannedSourceFileManifestIds).size !==
    request.plannedSourceFileManifestIds.length
  ) {
    return 'duplicate-source-manifest';
  }
  return 'ready';
}
