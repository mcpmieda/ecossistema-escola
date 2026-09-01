import type {
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  AcademicRecordRepositoryV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  AuditPersistenceRepositoryV1,
  AuditRecordStreamV1,
  AuditRecordV1,
  BatchPromotionRequestV1,
  BatchPromotionTransactionPortV1,
  CursorPageRequestV1,
  CursorPageV1,
  ImportPersistenceRepositoryV1,
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  LogicalSourceRecordRepositoryV1,
  PersistenceUnitOfWorkV1,
  SourceFileVersionV1,
  VersionExpectationV1,
  VersionedRecordV1,
  VersionedWriteResultV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';

interface MemoryState {
  entities: Map<string, readonly VersionedRecordV1<AcademicEntityRecordV1>[]>;
  sourceFiles: Map<string, readonly VersionedRecordV1<SourceFileVersionV1>[]>;
  batches: Map<string, readonly VersionedRecordV1<ImportBatchResultV1>[]>;
  academicRecords: Map<string, readonly VersionedRecordV1<AcademicRecordV1>[]>;
  logicalSourceRecordAssociations: Map<
    string,
    readonly VersionedRecordV1<LogicalSourceRecordAssociationV1>[]
  >;
  auditRecords: Map<string, readonly VersionedRecordV1<AuditRecordV1>[]>;
}

function emptyState(): MemoryState {
  return {
    entities: new Map(),
    sourceFiles: new Map(),
    batches: new Map(),
    academicRecords: new Map(),
    logicalSourceRecordAssociations: new Map(),
    auditRecords: new Map(),
  };
}

function cloneHistoryMap<T>(
  source: Map<string, readonly VersionedRecordV1<T>[]>,
): Map<string, readonly VersionedRecordV1<T>[]> {
  return new Map([...source.entries()].map(([key, history]) => [key, [...history]]));
}

function cloneState(source: MemoryState): MemoryState {
  return {
    entities: cloneHistoryMap(source.entities),
    sourceFiles: cloneHistoryMap(source.sourceFiles),
    batches: cloneHistoryMap(source.batches),
    academicRecords: cloneHistoryMap(source.academicRecords),
    logicalSourceRecordAssociations: cloneHistoryMap(
      source.logicalSourceRecordAssociations,
    ),
    auditRecords: cloneHistoryMap(source.auditRecords),
  };
}

function latest<T>(
  history: readonly VersionedRecordV1<T>[] | undefined,
): VersionedRecordV1<T> | null {
  return history?.at(-1) ?? null;
}

function appendVersion<T>(
  store: Map<string, readonly VersionedRecordV1<T>[]>,
  key: string,
  value: T,
  expectation: VersionExpectationV1,
): VersionedWriteResultV1<T> {
  const history = store.get(key) ?? [];
  const currentVersion = latest(history)?.version ?? null;

  if (currentVersion !== expectation.expectedVersion) {
    return { status: 'version-conflict', currentVersion };
  }

  const record: VersionedRecordV1<T> = {
    value,
    version: (currentVersion ?? 0) + 1,
    recordedAt: `2026-08-31T18:00:${String(history.length).padStart(2, '0')}Z`,
  };

  store.set(key, [...history, record]);
  return { status: 'written', record };
}

function page<T>(items: readonly T[], request: CursorPageRequestV1): CursorPageV1<T> {
  if (!Number.isInteger(request.limit) || request.limit <= 0) {
    throw new Error('page limit must be a positive integer');
  }

  const offset = request.cursor ? Number.parseInt(request.cursor, 10) : 0;
  const selected = items.slice(offset, offset + request.limit);
  const nextOffset = offset + selected.length;

  return {
    items: selected,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
  };
}

function yearPrefix(context: AcademicPersistenceContextV1): string {
  return `${context.academicYearId}:`;
}

function entityReferenceId(reference: AcademicEntityReferenceV1): string {
  return reference.id;
}

function entityKey(
  context: AcademicPersistenceContextV1,
  kind: AcademicEntityRecordV1['kind'],
  id: string,
): string {
  return `${yearPrefix(context)}entity:${kind}:${id}`;
}

function entityRecordId(record: AcademicEntityRecordV1): string {
  return record.value.id;
}

function sourceFileKey(
  context: AcademicPersistenceContextV1,
  manifestId: SourceFileManifestId,
): string {
  return `${yearPrefix(context)}source-file:${manifestId}`;
}

function batchKey(context: AcademicPersistenceContextV1, batchId: ImportBatchId): string {
  return `${yearPrefix(context)}batch:${batchId}`;
}

function academicRecordKey(
  context: AcademicPersistenceContextV1,
  stream: AcademicRecordStreamV1,
): string {
  switch (stream.kind) {
    case 'grade-entry':
      return `${yearPrefix(context)}grade-entry:${stream.studentId}:${stream.enrollmentId}:${stream.assessmentComponentId}`;
    case 'term-result':
      return `${yearPrefix(context)}term-result:${stream.studentId}:${stream.enrollmentId}:${stream.teachingAssignmentId}:${stream.term}`;
    case 'final-recovery':
      return `${yearPrefix(context)}final-recovery:${stream.studentId}:${stream.enrollmentId}:${stream.teachingAssignmentId}:${stream.recoveredTerm}`;
    case 'annual-result':
      return `${yearPrefix(context)}annual-result:${stream.studentId}:${stream.enrollmentId}:${stream.teachingAssignmentId}`;
  }
}

function logicalSourceRecordAssociationKey(
  context: AcademicPersistenceContextV1,
  stream: LogicalSourceRecordAssociationStreamV1,
): string {
  return `${yearPrefix(context)}logical-source-record:${stream.logicalSourceId}:${stream.stableKey}`;
}

function logicalSourceRecordAssociationPrefix(
  context: AcademicPersistenceContextV1,
  logicalSourceId: LogicalSourceIdV1,
): string {
  return `${yearPrefix(context)}logical-source-record:${logicalSourceId}:`;
}

function auditRecordKey(
  context: AcademicPersistenceContextV1,
  stream: AuditRecordStreamV1,
): string {
  return `${yearPrefix(context)}audit:${stream.kind}:${stream.id}`;
}

function createEntitiesRepository(state: MemoryState): AcademicEntityRepositoryV1 {
  return {
    async get(context, reference) {
      return (
        latest(
          state.entities.get(
            entityKey(context, reference.kind, entityReferenceId(reference)),
          ),
        ) ?? null
      );
    },

    async list(context, kind, request) {
      const prefix = `${yearPrefix(context)}entity:${kind}:`;
      const items = [...state.entities.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, history]) => latest(history))
        .filter(
          (record): record is VersionedRecordV1<AcademicEntityRecordV1> =>
            record !== null,
        );
      return page(items, request);
    },

    async appendVersion(context, record, expectation) {
      return appendVersion(
        state.entities,
        entityKey(context, record.kind, entityRecordId(record)),
        record,
        expectation,
      );
    },
  };
}

function createImportsRepository(state: MemoryState): ImportPersistenceRepositoryV1 {
  return {
    async findSourceFileByHash(context, sha256) {
      const prefix = `${yearPrefix(context)}source-file:`;
      for (const [key, history] of state.sourceFiles.entries()) {
        if (!key.startsWith(prefix)) continue;
        const record = latest(history);
        if (record?.value.manifest.sha256 === sha256) return record;
      }
      return null;
    },

    async getSourceFileVersion(context, manifestId) {
      return latest(state.sourceFiles.get(sourceFileKey(context, manifestId)));
    },

    async listLogicalSourceVersions(context, logicalSourceId: LogicalSourceIdV1, request) {
      const prefix = `${yearPrefix(context)}source-file:`;
      const items = [...state.sourceFiles.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, history]) => latest(history))
        .filter(
          (record): record is VersionedRecordV1<SourceFileVersionV1> =>
            record !== null,
        )
        .filter(
          ({ value }) =>
            value.logicalSource.state === 'confirmed' &&
            value.logicalSource.logicalSourceId === logicalSourceId,
        )
        .sort((left, right) =>
          left.value.manifest.readAt.localeCompare(right.value.manifest.readAt),
        );
      return page(items, request);
    },

    async appendSourceFileVersion(context, sourceFileVersion, expectation) {
      return appendVersion(
        state.sourceFiles,
        sourceFileKey(context, sourceFileVersion.manifest.id),
        sourceFileVersion,
        expectation,
      );
    },

    async getImportBatch(context, importBatchId) {
      return latest(state.batches.get(batchKey(context, importBatchId)));
    },

    async appendImportBatchVersion(context, batch, expectation) {
      return appendVersion(state.batches, batchKey(context, batch.id), batch, expectation);
    },
  };
}

function createAcademicRecordsRepository(state: MemoryState): AcademicRecordRepositoryV1 {
  return {
    async getCurrent(context, stream) {
      return latest(state.academicRecords.get(academicRecordKey(context, stream)));
    },

    async listVersions(context, stream, request) {
      return page(
        state.academicRecords.get(academicRecordKey(context, stream)) ?? [],
        request,
      );
    },

    async appendVersion(context, stream, record, expectation) {
      return appendVersion(
        state.academicRecords,
        academicRecordKey(context, stream),
        record,
        expectation,
      );
    },
  };
}

function createLogicalSourceRecordsRepository(
  state: MemoryState,
): LogicalSourceRecordRepositoryV1 {
  return {
    async getCurrent(context, stream) {
      return latest(
        state.logicalSourceRecordAssociations.get(
          logicalSourceRecordAssociationKey(context, stream),
        ),
      );
    },

    async listCurrentStreams(context, logicalSourceId) {
      const prefix = logicalSourceRecordAssociationPrefix(context, logicalSourceId);
      return [...state.logicalSourceRecordAssociations.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, history]) => latest(history))
        .filter(
          (
            record,
          ): record is VersionedRecordV1<LogicalSourceRecordAssociationV1> =>
            record?.value.state === 'active',
        )
        .sort((left, right) =>
          left.value.stableKey.localeCompare(right.value.stableKey),
        )
        .map(({ value }) => value.academicRecordStream);
    },

    async listVersions(context, stream, request) {
      return page(
        state.logicalSourceRecordAssociations.get(
          logicalSourceRecordAssociationKey(context, stream),
        ) ?? [],
        request,
      );
    },

    async appendVersion(context, stream, association, expectation) {
      return appendVersion(
        state.logicalSourceRecordAssociations,
        logicalSourceRecordAssociationKey(context, stream),
        association,
        expectation,
      );
    },
  };
}

function createAuditRepository(state: MemoryState): AuditPersistenceRepositoryV1 {
  return {
    async getCurrent(context, stream) {
      return latest(state.auditRecords.get(auditRecordKey(context, stream)));
    },

    async listVersions(context, stream, request) {
      return page(state.auditRecords.get(auditRecordKey(context, stream)) ?? [], request);
    },

    async appendVersion(context, stream, record, expectation) {
      return appendVersion(
        state.auditRecords,
        auditRecordKey(context, stream),
        record,
        expectation,
      );
    },
  };
}

function createUnitOfWork(state: MemoryState): PersistenceUnitOfWorkV1 {
  return {
    entities: createEntitiesRepository(state),
    imports: createImportsRepository(state),
    academicRecords: createAcademicRecordsRepository(state),
    logicalSourceRecords: createLogicalSourceRecordsRepository(state),
    audit: createAuditRepository(state),
  };
}

export class MemoryPersistenceAdapter implements BatchPromotionTransactionPortV1 {
  private state = emptyState();

  get unitOfWork(): PersistenceUnitOfWorkV1 {
    return createUnitOfWork(this.state);
  }

  async runBatchPromotion<T>(
    context: AcademicPersistenceContextV1,
    request: BatchPromotionRequestV1,
    operation: (unitOfWork: PersistenceUnitOfWorkV1) => Promise<T>,
  ): Promise<T> {
    const currentBatch = await this.unitOfWork.imports.getImportBatch(
      context,
      request.importBatchId,
    );

    if (!currentBatch || currentBatch.version !== request.expectedBatchVersion) {
      throw new Error('batch version conflict');
    }

    const approvedIds = new Set(
      currentBatch.value.files
        .filter((file) => file.status === 'approved')
        .map((file) => file.id),
    );

    if (request.approvedImportFileIds.some((id) => !approvedIds.has(id))) {
      throw new Error('promotion request contains a file that is not approved');
    }

    const transactionState = cloneState(this.state);
    const result = await operation(createUnitOfWork(transactionState));
    this.state = transactionState;
    return result;
  }
}
