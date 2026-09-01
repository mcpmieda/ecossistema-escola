import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeacherId,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchFileResultV1,
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AssessmentComponentId,
  ComparedGradeValueV1,
  GradeEntryId,
  GradeEntryV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type { SourceCellEvidenceV1 } from '../../../../shared/gradebook-contracts/source/source-contract-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  BatchPromotionRequestV1,
  BatchPromotionTransactionPortV1,
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationV1,
  PersistenceUnitOfWorkV1,
  SourceFileVersionV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
  planImportReconciliation,
  type ImportChangePlanItemV1,
  type ImportChangePlanV1,
  type ImportFileChangePlanV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import { executeImportChangePlan } from '../../../../server/gradebook/application/import/execution/execute-import-change-plan-v1';
import { MemoryPersistenceAdapter } from '../../persistence/ports/memory-persistence-adapter';

const academicYearId = 'academic-year:2026' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const batchId = 'import-batch:association-execution:synthetic' as ImportBatchId;
const logicalSourceId = 'logical-source:association-execution:synthetic' as LogicalSourceIdV1;
const reviewLogicalSourceId = 'logical-source:association-execution:review' as LogicalSourceIdV1;

function manifest(input: {
  id: string;
  fileName: string;
  sha256: string;
  readAt?: string;
}): SourceFileManifestV1 {
  return {
    id: input.id as SourceFileManifestId,
    fileName: input.fileName,
    extension: 'xlsx',
    reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 2048,
    lastModifiedAt: '2026-08-31T10:00:00Z',
    sha256: input.sha256,
    sourceContractVersion: 1,
    parserVersion: 'synthetic-parser-v1',
    readAt: input.readAt ?? '2026-08-31T10:05:00Z',
    confirmedAcademicYearId: academicYearId,
    confirmedTeacherId: 'teacher:association-execution:synthetic' as TeacherId,
  };
}

function evidence(input: {
  fileName: string;
  sha256: string;
  value: number;
  cellAddress: string;
}): SourceCellEvidenceV1 {
  return {
    classification: 'manual-positive-number',
    rawValue: input.value,
    provenance: {
      fileName: input.fileName,
      fileSha256: input.sha256,
      sheetName: '6A1º',
      cellAddress: input.cellAddress,
    },
  };
}

function comparedValue(input: {
  fileName: string;
  sha256: string;
  value: number;
  cellAddress: string;
}): ComparedGradeValueV1 {
  return {
    imported: {
      value: { state: 'numeric', value: input.value },
      evidence: [evidence(input)],
    },
    calculated: {
      value: { state: 'numeric', value: input.value },
    },
  };
}

function gradeRecord(input: {
  key: string;
  value: number;
  fileName: string;
  sha256: string;
  technicalId?: string;
  technicalVersion?: number;
}): AcademicRecordV1 {
  const record = {
    id: (input.technicalId ?? `grade-entry:association-execution:${input.key}`) as GradeEntryId,
    academicYearId,
    studentId: `student:association-execution:${input.key}` as StudentId,
    enrollmentId: `enrollment:association-execution:${input.key}` as EnrollmentId,
    assessmentComponentId: `assessment:association-execution:${input.key}` as AssessmentComponentId,
    value: comparedValue({
      fileName: input.fileName,
      sha256: input.sha256,
      value: input.value,
      cellAddress: `R${input.key}`,
    }),
    authorityMode: 'imported-source',
    ruleVersion: 'rule:association-execution:synthetic-v1',
    version: input.technicalVersion ?? 1,
  } satisfies GradeEntryV1;

  return { kind: 'grade-entry', value: record };
}

function approvedFile(
  importFileId: ImportFileId,
  sourceManifest: SourceFileManifestV1,
): ImportBatchFileResultV1 {
  return {
    id: importFileId,
    sourceFile: {
      fileName: sourceManifest.fileName,
      extension: sourceManifest.extension,
      reportedMimeType: sourceManifest.reportedMimeType,
      sizeBytes: sourceManifest.sizeBytes,
      lastModifiedAt: sourceManifest.lastModifiedAt,
    },
    manifest: sourceManifest,
    status: 'approved',
    diagnosticIds: [],
  };
}

function failedFile(importFileId: ImportFileId): ImportBatchFileResultV1 {
  return {
    id: importFileId,
    sourceFile: {
      fileName: 'arquivo-sintetico-bloqueado.xlsx',
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
    },
    manifest: null,
    status: 'failed',
    diagnosticIds: [],
  };
}

function batch(
  fileOrFiles: ImportBatchFileResultV1 | readonly ImportBatchFileResultV1[],
): ImportBatchResultV1 {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  const approvedFileCount = files.filter((file) => file.status === 'approved').length;
  const failedFileCount = files.filter((file) => file.status === 'failed').length;
  return {
    id: batchId,
    status: failedFileCount > 0 ? 'partially-approved' : 'approved',
    files,
    diagnostics: [],
    receivedAt: '2026-08-31T10:00:00Z',
    updatedAt: '2026-08-31T10:10:00Z',
    summary: {
      totalFileCount: files.length,
      processedFileCount: files.length,
      approvedFileCount,
      reviewRequiredFileCount: 0,
      rejectedFileCount: 0,
      failedFileCount,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: failedFileCount,
      criticalErrorCount: 0,
    },
  } as ImportBatchResultV1;
}

function association(
  stream: AcademicRecordStreamV1,
  sourceManifestId: SourceFileManifestId,
  sourceManifestVersion: number,
  state: LogicalSourceRecordAssociationV1['state'] = 'active',
  associationLogicalSourceId: LogicalSourceIdV1 = logicalSourceId,
): LogicalSourceRecordAssociationV1 {
  return {
    academicYearId,
    logicalSourceId: associationLogicalSourceId,
    academicRecordStream: stream,
    stableKey: academicRecordStreamKeyV1(stream),
    state,
    sourceManifestId,
    sourceManifestVersion,
  };
}

function planningRepositories(adapter: MemoryPersistenceAdapter) {
  return {
    imports: adapter.unitOfWork.imports,
    academicRecords: adapter.unitOfWork.academicRecords,
    logicalSourceRecords: adapter.unitOfWork.logicalSourceRecords,
  };
}

async function seedBatch(
  adapter: MemoryPersistenceAdapter,
  importFileOrFiles: ImportBatchFileResultV1 | readonly ImportBatchFileResultV1[],
): Promise<void> {
  const result = await adapter.unitOfWork.imports.appendImportBatchVersion(
    context,
    batch(importFileOrFiles),
    { expectedVersion: null },
  );
  expect(result.status).toBe('written');
}

async function seedSource(
  adapter: MemoryPersistenceAdapter,
  sourceManifest: SourceFileManifestV1,
  sourceLogicalSourceId: LogicalSourceIdV1 = logicalSourceId,
): Promise<void> {
  const value = {
    manifest: sourceManifest,
    logicalSource: { state: 'confirmed', logicalSourceId: sourceLogicalSourceId },
  } satisfies SourceFileVersionV1;
  const result = await adapter.unitOfWork.imports.appendSourceFileVersion(context, value, {
    expectedVersion: null,
  });
  expect(result.status).toBe('written');
}

async function seedRecordAndAssociation(input: {
  adapter: MemoryPersistenceAdapter;
  record: AcademicRecordV1;
  sourceManifestId: SourceFileManifestId;
  sourceManifestVersion: number;
  logicalSourceId?: LogicalSourceIdV1;
}): Promise<AcademicRecordStreamV1> {
  const sourceLogicalSourceId = input.logicalSourceId ?? logicalSourceId;
  const stream = academicRecordStreamForV1(input.record);
  const recordWrite = await input.adapter.unitOfWork.academicRecords.appendVersion(
    context,
    stream,
    input.record,
    { expectedVersion: null },
  );
  expect(recordWrite.status).toBe('written');
  const associationWrite = await input.adapter.unitOfWork.logicalSourceRecords.appendVersion(
    context,
    logicalSourceRecordAssociationStreamForV1(sourceLogicalSourceId, stream),
    association(
      stream,
      input.sourceManifestId,
      input.sourceManifestVersion,
      'active',
      sourceLogicalSourceId,
    ),
    { expectedVersion: null },
  );
  expect(associationWrite.status).toBe('written');
  return stream;
}

async function planIncrementalChange(input: {
  adapter: MemoryPersistenceAdapter;
  oldManifest: SourceFileManifestV1;
  incomingManifest: SourceFileManifestV1;
  currentRecord: AcademicRecordV1;
  incomingRecords: readonly AcademicRecordV1[];
  importFileId: ImportFileId;
}): Promise<ImportChangePlanV1> {
  await seedSource(input.adapter, input.oldManifest);
  await seedRecordAndAssociation({
    adapter: input.adapter,
    record: input.currentRecord,
    sourceManifestId: input.oldManifest.id,
    sourceManifestVersion: 1,
  });
  const importFile = approvedFile(input.importFileId, input.incomingManifest);
  await seedBatch(input.adapter, importFile);

  return planImportReconciliation(
    {
      context,
      batch: batch(importFile),
      expectedBatchVersion: 1,
      files: [
        {
          importFileId: input.importFileId,
          logicalSource: { state: 'confirmed', logicalSourceId },
          records: input.incomingRecords,
        },
      ],
    },
    planningRepositories(input.adapter),
  );
}

class CountingTransactionPort implements BatchPromotionTransactionPortV1 {
  calls = 0;

  constructor(private readonly delegate: BatchPromotionTransactionPortV1) {}

  async runBatchPromotion<T>(
    transactionContext: AcademicPersistenceContextV1,
    request: BatchPromotionRequestV1,
    operation: (unitOfWork: PersistenceUnitOfWorkV1) => Promise<T>,
  ): Promise<T> {
    this.calls += 1;
    return this.delegate.runBatchPromotion(transactionContext, request, operation);
  }
}

class FailingTransactionPort implements BatchPromotionTransactionPortV1 {
  async runBatchPromotion<T>(
    _context: AcademicPersistenceContextV1,
    _request: BatchPromotionRequestV1,
    _operation: (unitOfWork: PersistenceUnitOfWorkV1) => Promise<T>,
  ): Promise<T> {
    throw new Error('SENSITIVE_SYNTHETIC_PAYLOAD');
  }
}

describe('transactional import change plan executor with source associations v1', () => {
  it('returns no-changes without opening a transaction for an identical hash', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const sourceManifest = manifest({
      id: 'manifest:association-execution:no-op',
      fileName: 'notas-sinteticas.xlsx',
      sha256: 'hash-identical',
    });
    await seedSource(adapter, sourceManifest);
    const importFileId = 'import-file:association-execution:no-op' as ImportFileId;
    const importFile = approvedFile(importFileId, sourceManifest);
    await seedBatch(adapter, importFile);
    const incoming = gradeRecord({
      key: '10',
      value: 8,
      fileName: sourceManifest.fileName,
      sha256: sourceManifest.sha256,
    });
    const plan = await planImportReconciliation(
      {
        context,
        batch: batch(importFile),
        expectedBatchVersion: 1,
        files: [
          {
            importFileId,
            logicalSource: { state: 'confirmed', logicalSourceId },
            records: [incoming],
          },
        ],
      },
      planningRepositories(adapter),
    );
    const transactionPort = new CountingTransactionPort(adapter);

    const result = await executeImportChangePlan(plan, transactionPort);

    expect(result).toMatchObject({
      status: 'no-changes',
      transactionStarted: false,
      transactionCommitted: false,
      plannedWrites: {
        sourceFileVersions: 0,
        academicRecordVersions: 0,
        logicalSourceRecordAssociationVersions: 0,
        totalVersionWrites: 0,
      },
    });
    expect(transactionPort.calls).toBe(0);
  });

  it('commits source, academic records and associations in one transaction', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const oldManifest = manifest({
      id: 'manifest:association-execution:commit',
      fileName: 'notas-v1.xlsx',
      sha256: 'hash-v1',
    });
    const incomingManifest = {
      ...oldManifest,
      fileName: 'notas-v2.xlsx',
      sha256: 'hash-v2',
      readAt: '2026-08-31T11:00:00Z',
    };
    const currentRecord = gradeRecord({
      key: '20',
      value: 5,
      fileName: oldManifest.fileName,
      sha256: oldManifest.sha256,
      technicalId: 'grade-entry:association-execution:20:v1',
    });
    const changedRecord = gradeRecord({
      key: '20',
      value: 6,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:association-execution:20:v2',
      technicalVersion: 2,
    });
    const newRecord = gradeRecord({
      key: '21',
      value: 9,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
    });
    const importFileId = 'import-file:association-execution:commit' as ImportFileId;
    const plan = await planIncrementalChange({
      adapter,
      oldManifest,
      incomingManifest,
      currentRecord,
      incomingRecords: [changedRecord, newRecord],
      importFileId,
    });

    const result = await executeImportChangePlan(plan, adapter);

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected applied result');
    expect(result.plannedWrites).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 2,
      logicalSourceRecordAssociationVersions: 2,
      totalVersionWrites: 5,
    });
    expect(result.committedWrites).toEqual(result.plannedWrites);
    expect(result.appliedVersions.logicalSourceRecordAssociations).toHaveLength(2);
    expect(
      result.appliedVersions.logicalSourceRecordAssociations.map((entry) => ({
        state: entry.state,
        sourceManifestId: entry.sourceManifestId,
        sourceManifestVersion: entry.sourceManifestVersion,
      })),
    ).toEqual([
      {
        state: 'active',
        sourceManifestId: incomingManifest.id,
        sourceManifestVersion: 2,
      },
      {
        state: 'active',
        sourceManifestId: incomingManifest.id,
        sourceManifestVersion: 2,
      },
    ]);

    for (const record of [changedRecord, newRecord]) {
      const stream = academicRecordStreamForV1(record);
      const currentAssociation = await adapter.unitOfWork.logicalSourceRecords.getCurrent(
        context,
        logicalSourceRecordAssociationStreamForV1(logicalSourceId, stream),
      );
      expect(currentAssociation?.value).toMatchObject({
        academicYearId,
        logicalSourceId,
        stableKey: academicRecordStreamKeyV1(stream),
        state: 'active',
        sourceManifestId: incomingManifest.id,
        sourceManifestVersion: 2,
      });
    }
  });

  it('promotes only ready files and leaves missing or blocked items without appends', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const readyManifest = manifest({
      id: 'manifest:association-execution:ready',
      fileName: 'arquivo-pronto.xlsx',
      sha256: 'hash-ready',
    });
    const reviewPreviousManifest = manifest({
      id: 'manifest:association-execution:review',
      fileName: 'arquivo-revisao-v1.xlsx',
      sha256: 'hash-review-v1',
    });
    const reviewIncomingManifest = {
      ...reviewPreviousManifest,
      fileName: 'arquivo-revisao-v2.xlsx',
      sha256: 'hash-review-v2',
      readAt: '2026-08-31T11:00:00Z',
    };
    const readyRecord = gradeRecord({
      key: '25',
      value: 9,
      fileName: readyManifest.fileName,
      sha256: readyManifest.sha256,
    });
    const missingRecord = gradeRecord({
      key: '26',
      value: 4,
      fileName: reviewPreviousManifest.fileName,
      sha256: reviewPreviousManifest.sha256,
    });
    await seedSource(adapter, reviewPreviousManifest, reviewLogicalSourceId);
    const missingStream = await seedRecordAndAssociation({
      adapter,
      record: missingRecord,
      sourceManifestId: reviewPreviousManifest.id,
      sourceManifestVersion: 1,
      logicalSourceId: reviewLogicalSourceId,
    });

    const readyFileId = 'import-file:association-execution:ready' as ImportFileId;
    const reviewFileId = 'import-file:association-execution:review' as ImportFileId;
    const blockedFileId = 'import-file:association-execution:blocked' as ImportFileId;
    const readyFile = approvedFile(readyFileId, readyManifest);
    const reviewFile = approvedFile(reviewFileId, reviewIncomingManifest);
    const blockedFile = failedFile(blockedFileId);
    const importFiles = [readyFile, reviewFile, blockedFile];
    await seedBatch(adapter, importFiles);

    const plan = await planImportReconciliation(
      {
        context,
        batch: batch(importFiles),
        expectedBatchVersion: 1,
        files: [
          {
            importFileId: readyFileId,
            logicalSource: { state: 'confirmed', logicalSourceId },
            records: [readyRecord],
          },
          {
            importFileId: reviewFileId,
            logicalSource: {
              state: 'confirmed',
              logicalSourceId: reviewLogicalSourceId,
            },
            records: [],
          },
        ],
      },
      planningRepositories(adapter),
    );

    expect(plan.status).toBe('partially-ready');
    expect(plan.promotionRequest.approvedImportFileIds).toEqual([readyFileId]);
    expect(plan.reviewRequiredImportFileIds).toEqual([reviewFileId]);
    expect(plan.blockedImportFileIds).toEqual([blockedFileId]);

    const result = await executeImportChangePlan(plan, adapter);

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected applied result');
    expect(result.plannedWrites).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 1,
      logicalSourceRecordAssociationVersions: 1,
      totalVersionWrites: 3,
    });
    expect(result.committedWrites).toEqual(result.plannedWrites);
    expect(result.appliedVersions.sourceFiles.map((entry) => entry.importFileId)).toEqual([
      readyFileId,
    ]);
    expect(result.appliedVersions.academicRecords.map((entry) => entry.importFileId)).toEqual([
      readyFileId,
    ]);
    expect(
      result.appliedVersions.logicalSourceRecordAssociations.map((entry) => entry.importFileId),
    ).toEqual([readyFileId]);

    const readyStream = academicRecordStreamForV1(readyRecord);
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, readyStream)).toMatchObject(
      { version: 1 },
    );
    expect(
      await adapter.unitOfWork.logicalSourceRecords.getCurrent(
        context,
        logicalSourceRecordAssociationStreamForV1(logicalSourceId, readyStream),
      ),
    ).toMatchObject({ version: 1 });
    expect(
      await adapter.unitOfWork.imports.getSourceFileVersion(context, reviewPreviousManifest.id),
    ).toMatchObject({
      version: 1,
      value: { manifest: { sha256: reviewPreviousManifest.sha256 } },
    });
    expect(
      await adapter.unitOfWork.academicRecords.getCurrent(context, missingStream),
    ).toMatchObject({ version: 1 });
    expect(
      await adapter.unitOfWork.logicalSourceRecords.getCurrent(
        context,
        logicalSourceRecordAssociationStreamForV1(reviewLogicalSourceId, missingStream),
      ),
    ).toMatchObject({ version: 1 });
  });

  it('reports an association conflict and rolls back earlier source and record appends', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const oldManifest = manifest({
      id: 'manifest:association-execution:conflict',
      fileName: 'notas-v1.xlsx',
      sha256: 'hash-conflict-v1',
    });
    const incomingManifest = {
      ...oldManifest,
      fileName: 'notas-v2.xlsx',
      sha256: 'hash-conflict-v2',
      readAt: '2026-08-31T11:00:00Z',
    };
    const currentRecord = gradeRecord({
      key: '30',
      value: 5,
      fileName: oldManifest.fileName,
      sha256: oldManifest.sha256,
      technicalId: 'grade-entry:association-execution:30:v1',
    });
    const changedRecord = gradeRecord({
      key: '30',
      value: 6,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:association-execution:30:v2',
      technicalVersion: 2,
    });
    const importFileId = 'import-file:association-execution:conflict' as ImportFileId;
    const plan = await planIncrementalChange({
      adapter,
      oldManifest,
      incomingManifest,
      currentRecord,
      incomingRecords: [changedRecord],
      importFileId,
    });
    const stream = academicRecordStreamForV1(currentRecord);
    const associationStream = logicalSourceRecordAssociationStreamForV1(logicalSourceId, stream);
    const concurrentWrite = await adapter.unitOfWork.logicalSourceRecords.appendVersion(
      context,
      associationStream,
      association(stream, oldManifest.id, 1, 'inactive'),
      { expectedVersion: 1 },
    );
    expect(concurrentWrite.status).toBe('written');

    const result = await executeImportChangePlan(plan, adapter);

    expect(result.status).toBe('version-conflict');
    if (result.status !== 'version-conflict') throw new Error('expected conflict result');
    expect(result.conflict).toEqual({
      scope: 'logical-source-record-association',
      importFileId,
      stableKey: academicRecordStreamKeyV1(stream),
      expectedVersion: 1,
      currentVersion: 2,
    });
    expect(result.attemptedWritesBeforeRollback).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 1,
      logicalSourceRecordAssociationVersions: 0,
      totalVersionWrites: 2,
    });
    expect(
      await adapter.unitOfWork.imports.getSourceFileVersion(context, oldManifest.id),
    ).toMatchObject({ version: 1 });
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, stream)).toMatchObject({
      version: 1,
    });
    expect(
      await adapter.unitOfWork.logicalSourceRecords.getCurrent(context, associationStream),
    ).toMatchObject({ version: 2, value: { state: 'inactive' } });
  });

  it('rejects tampered association provenance before opening the transaction', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const oldManifest = manifest({
      id: 'manifest:association-execution:tampered',
      fileName: 'notas-v1.xlsx',
      sha256: 'hash-tampered-v1',
    });
    const incomingManifest = {
      ...oldManifest,
      fileName: 'notas-v2.xlsx',
      sha256: 'hash-tampered-v2',
      readAt: '2026-08-31T11:00:00Z',
    };
    const currentRecord = gradeRecord({
      key: '40',
      value: 5,
      fileName: oldManifest.fileName,
      sha256: oldManifest.sha256,
    });
    const changedRecord = gradeRecord({
      key: '40',
      value: 6,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:association-execution:40:v2',
      technicalVersion: 2,
    });
    const importFileId = 'import-file:association-execution:tampered' as ImportFileId;
    const validPlan = await planIncrementalChange({
      adapter,
      oldManifest,
      incomingManifest,
      currentRecord,
      incomingRecords: [changedRecord],
      importFileId,
    });
    const file = validPlan.files[0];
    const item = file?.items[0];
    if (!file || !item || (item.state !== 'new' && item.state !== 'changed')) {
      throw new Error('missing writable item');
    }
    const tamperedItem = {
      ...item,
      associationWrite: {
        ...item.associationWrite,
        value: {
          ...item.associationWrite.value,
          sourceManifestVersion: 999,
        },
      },
    } satisfies ImportChangePlanItemV1;
    const tamperedFile = {
      ...file,
      items: [tamperedItem],
    } satisfies ImportFileChangePlanV1;
    const tamperedPlan = {
      ...validPlan,
      files: [tamperedFile],
      items: [tamperedItem],
    } satisfies ImportChangePlanV1;
    const transactionPort = new CountingTransactionPort(adapter);

    const result = await executeImportChangePlan(tamperedPlan, transactionPort);

    expect(result.status).toBe('rejected-invalid-plan');
    if (result.status !== 'rejected-invalid-plan') {
      throw new Error('expected invalid plan result');
    }
    expect(result.validationIssues.map((issue) => issue.code)).toContain(
      'association-source-provenance-mismatch',
    );
    expect(result.transactionStarted).toBe(false);
    expect(transactionPort.calls).toBe(0);
  });

  it('sanitizes transaction failures and keeps provider APIs out of the executor', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const oldManifest = manifest({
      id: 'manifest:association-execution:failure',
      fileName: 'notas-v1.xlsx',
      sha256: 'hash-failure-v1',
    });
    const incomingManifest = {
      ...oldManifest,
      fileName: 'notas-v2.xlsx',
      sha256: 'hash-failure-v2',
      readAt: '2026-08-31T11:00:00Z',
    };
    const currentRecord = gradeRecord({
      key: '50',
      value: 5,
      fileName: oldManifest.fileName,
      sha256: oldManifest.sha256,
    });
    const changedRecord = gradeRecord({
      key: '50',
      value: 6,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
    });
    const plan = await planIncrementalChange({
      adapter,
      oldManifest,
      incomingManifest,
      currentRecord,
      incomingRecords: [changedRecord],
      importFileId: 'import-file:association-execution:failure' as ImportFileId,
    });

    const result = await executeImportChangePlan(plan, new FailingTransactionPort());

    expect(result.status).toBe('transaction-failed');
    if (result.status !== 'transaction-failed') throw new Error('expected failure');
    expect(result.failure).toEqual({
      code: 'transaction-failed',
      message: 'A promoção transacional falhou sem confirmar alterações.',
    });
    expect(JSON.stringify(result)).not.toContain('SENSITIVE_SYNTHETIC_PAYLOAD');

    const source = readFileSync(
      'server/gradebook/application/import/execution/execute-import-change-plan-v1.ts',
      'utf8',
    );
    expect(source).not.toContain('D1Database');
    expect(source).not.toContain('@cloudflare');
    expect(source).not.toContain('wrangler');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('Date.now');
    expect(source).not.toContain('new Date');
    expect(source).not.toContain('React');
    expect(source).not.toContain('HeroUI');
  });
});
