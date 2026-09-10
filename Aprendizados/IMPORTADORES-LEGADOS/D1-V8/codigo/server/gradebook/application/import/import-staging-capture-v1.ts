import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  SourceFileVersionV1,
  VersionExpectationV1,
  VersionedWriteResultV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  inspectImportBootstrapTransactionRequestV2,
  type ImportBootstrapTransactionPortV2,
  type ImportBootstrapTransactionRequestV2,
  type LogicalSourceV2,
  type PersistenceUnitOfWorkV2,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { academicRecordStreamKeyV1 } from './import-reconciliation-v1';

export interface StagedEntityWriteV1 {
  readonly record: AcademicEntityRecordV1;
  readonly expectedVersion: number | null;
  readonly recordedAt: string;
}

export interface StagedAcademicRecordWriteV1 {
  readonly streamKey: string;
  readonly stream: AcademicRecordStreamV1;
  readonly record: AcademicRecordV1;
  readonly expectedVersion: number | null;
  readonly recordedAt: string;
}

export interface StagedAssociationWriteV1 {
  readonly streamKey: string;
  readonly stream: LogicalSourceRecordAssociationStreamV1;
  readonly value: LogicalSourceRecordAssociationV1;
  readonly expectedVersion: number | null;
  readonly recordedAt: string;
}

export interface StagedSourceFileWriteV1 {
  readonly value: SourceFileVersionV1;
  readonly expectedVersion: number | null;
}

export interface StagedImportBatchWriteV1 {
  readonly value: Parameters<PersistenceUnitOfWorkV2['imports']['appendImportBatchVersion']>[1];
  readonly expectedVersion: number | null;
}

export interface StagedImportMetaWritesV1 {
  readonly transactionRequest: ImportBootstrapTransactionRequestV2;
  readonly logicalSourceCreates: readonly LogicalSourceV2[];
  readonly sourceFileWrites: readonly StagedSourceFileWriteV1[];
  readonly importBatchWrites: readonly StagedImportBatchWriteV1[];
}

export interface StagedImportWritePayloadV1 {
  readonly entities: readonly StagedEntityWriteV1[];
  readonly academicRecords: readonly StagedAcademicRecordWriteV1[];
  readonly associations: readonly StagedAssociationWriteV1[];
}

export interface StagedImportCaptureV1 {
  readonly meta: StagedImportMetaWritesV1;
  readonly payload: StagedImportWritePayloadV1;
}

function written<T>(
  value: T,
  expectation: VersionExpectationV1,
  recordedAt: string,
): VersionedWriteResultV1<T> {
  return {
    status: 'written',
    record: {
      value,
      version: (expectation.expectedVersion ?? 0) + 1,
      recordedAt,
    },
  };
}

export class GradebookImportStagingCaptureTransactionV1 implements ImportBootstrapTransactionPortV2 {
  private active = false;
  private captured: StagedImportCaptureV1 | null = null;

  constructor(
    private readonly baseUnitOfWork: PersistenceUnitOfWorkV2,
    private readonly now: () => string,
  ) {}

  takeCapture(): StagedImportCaptureV1 {
    if (!this.captured) throw new Error('staged-import-capture-unavailable');
    return this.captured;
  }

  async runImportBootstrap<T>(
    context: AcademicPersistenceContextV1,
    request: ImportBootstrapTransactionRequestV2,
    operation: (unitOfWork: PersistenceUnitOfWorkV2) => Promise<T>,
  ): Promise<T> {
    if (inspectImportBootstrapTransactionRequestV2(context, request) !== 'ready') {
      throw new Error('staged-import-invalid-bootstrap-request');
    }
    if (this.active) throw new Error('staged-import-nested-capture');
    this.active = true;
    this.captured = null;

    const entities: StagedEntityWriteV1[] = [];
    const academicRecords: StagedAcademicRecordWriteV1[] = [];
    const associations: StagedAssociationWriteV1[] = [];
    const logicalSourceCreates: LogicalSourceV2[] = [];
    const sourceFileWrites: StagedSourceFileWriteV1[] = [];
    const importBatchWrites: StagedImportBatchWriteV1[] = [];

    const unitOfWork: PersistenceUnitOfWorkV2 = {
      ...this.baseUnitOfWork,
      entities: {
        ...this.baseUnitOfWork.entities,
        appendVersion: async (writeContext, record, expectation) => {
          const recordedAt = this.now();
          entities.push({ record, expectedVersion: expectation.expectedVersion, recordedAt });
          return written(record, expectation, recordedAt);
        },
      },
      imports: {
        ...this.baseUnitOfWork.imports,
        appendSourceFileVersion: async (writeContext, value, expectation) => {
          if (writeContext.academicYearId !== context.academicYearId) {
            throw new Error('staged-import-context-mismatch');
          }
          sourceFileWrites.push({ value, expectedVersion: expectation.expectedVersion });
          return written(value, expectation, this.now());
        },
        appendImportBatchVersion: async (writeContext, value, expectation) => {
          if (writeContext.academicYearId !== context.academicYearId) {
            throw new Error('staged-import-context-mismatch');
          }
          importBatchWrites.push({ value, expectedVersion: expectation.expectedVersion });
          return written(value, expectation, this.now());
        },
      },
      academicRecords: {
        ...this.baseUnitOfWork.academicRecords,
        appendVersion: async (writeContext, stream, record, expectation) => {
          if (writeContext.academicYearId !== context.academicYearId) {
            throw new Error('staged-import-context-mismatch');
          }
          const recordedAt = this.now();
          academicRecords.push({
            streamKey: academicRecordStreamKeyV1(stream),
            stream,
            record,
            expectedVersion: expectation.expectedVersion,
            recordedAt,
          });
          return written(record, expectation, recordedAt);
        },
      },
      logicalSourceRecords: {
        ...this.baseUnitOfWork.logicalSourceRecords,
        appendVersion: async (writeContext, stream, value, expectation) => {
          if (writeContext.academicYearId !== context.academicYearId) {
            throw new Error('staged-import-context-mismatch');
          }
          const recordedAt = this.now();
          associations.push({
            streamKey: stream.stableKey,
            stream,
            value,
            expectedVersion: expectation.expectedVersion,
            recordedAt,
          });
          return written(value, expectation, recordedAt);
        },
      },
      logicalSources: {
        ...this.baseUnitOfWork.logicalSources,
        createInitial: async (writeContext, source) => {
          if (
            writeContext.academicYearId !== context.academicYearId ||
            request.logicalSource.kind !== 'create' ||
            request.logicalSource.value.id !== source.id
          ) {
            throw new Error('staged-import-logical-source-mismatch');
          }
          logicalSourceCreates.push(source);
          return { status: 'created', value: source };
        },
      },
    };

    try {
      const result = await operation(unitOfWork);
      this.captured = {
        meta: {
          transactionRequest: request,
          logicalSourceCreates,
          sourceFileWrites,
          importBatchWrites,
        },
        payload: { entities, academicRecords, associations },
      };
      return result;
    } finally {
      this.active = false;
    }
  }
}
