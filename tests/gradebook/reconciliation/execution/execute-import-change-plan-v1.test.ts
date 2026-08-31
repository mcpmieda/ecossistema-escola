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
  AcademicRecordV1,
  BatchPromotionRequestV1,
  BatchPromotionTransactionPortV1,
  LogicalSourceIdV1,
  LogicalSourceRelationV1,
  PersistenceUnitOfWorkV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
  type ImportChangeCountsV1,
  type ImportChangePlanItemV1,
  type ImportChangePlanV1,
  type ImportFileChangePlanStatusV1,
  type ImportFileChangePlanV1,
  type PlannedSourceFileWriteV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import { executeImportChangePlan } from '../../../../server/gradebook/application/import/execution/execute-import-change-plan-v1';
import { MemoryPersistenceAdapter } from '../../persistence/ports/memory-persistence-adapter';

const academicYearId = 'academic-year:2026' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const batchId = 'import-batch:execution:synthetic' as ImportBatchId;
const logicalSourceId = 'logical-source:execution:synthetic' as LogicalSourceIdV1;
const confirmedLogicalSource = {
  state: 'confirmed',
  logicalSourceId,
} satisfies LogicalSourceRelationV1;

function planReason(code: string) {
  return {
    code,
    message: `Razão sintética: ${code}`,
    diagnosticIds: [],
  } as const;
}

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
    confirmedTeacherId: 'teacher:execution:synthetic' as TeacherId,
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
    id: (input.technicalId ?? `grade-entry:execution:${input.key}`) as GradeEntryId,
    academicYearId,
    studentId: `student:execution:${input.key}` as StudentId,
    enrollmentId: `enrollment:execution:${input.key}` as EnrollmentId,
    assessmentComponentId: `assessment:execution:${input.key}` as AssessmentComponentId,
    value: comparedValue({
      fileName: input.fileName,
      sha256: input.sha256,
      value: input.value,
      cellAddress: `R${input.key}`,
    }),
    authorityMode: 'imported-source',
    ruleVersion: 'rule:execution:synthetic-v1',
    version: input.technicalVersion ?? 1,
  } satisfies GradeEntryV1;

  return { kind: 'grade-entry', value: record };
}

function versionedRecord(
  value: AcademicRecordV1,
  version: number,
): VersionedRecordV1<AcademicRecordV1> {
  return {
    value,
    version,
    recordedAt: `2026-08-31T10:${String(version).padStart(2, '0')}:00Z`,
  };
}

function countItems(items: readonly ImportChangePlanItemV1[]): ImportChangeCountsV1 {
  const counts: Record<ImportChangePlanItemV1['state'], number> = {
    unchanged: 0,
    new: 0,
    changed: 0,
    'missing-from-new-source': 0,
    blocked: 0,
  };
  for (const item of items) counts[item.state] += 1;
  return counts;
}

function sourceWrite(
  sourceManifest: SourceFileManifestV1,
  expectedVersion: number | null = null,
): PlannedSourceFileWriteV1 {
  return {
    kind: 'append-version',
    value: {
      manifest: sourceManifest,
      logicalSource: confirmedLogicalSource,
    },
    expectedVersion,
    reason: planReason('source-write'),
  };
}

function filePlan(input: {
  importFileId: string;
  manifest: SourceFileManifestV1 | null;
  status: ImportFileChangePlanStatusV1;
  items: readonly ImportChangePlanItemV1[];
  sourceFileWrite?: PlannedSourceFileWriteV1;
  batchFileStatus?: ImportFileChangePlanV1['batchFileStatus'];
  logicalSource?: LogicalSourceRelationV1;
}): ImportFileChangePlanV1 {
  const sourceFileWrite = input.sourceFileWrite ?? ({ kind: 'none' } as const);
  const counts = countItems(input.items);
  const sourceFileVersions = sourceFileWrite.kind === 'append-version' ? 1 : 0;
  const academicRecordVersions = counts.new + counts.changed;

  return {
    importFileId: input.importFileId as ImportFileId,
    sourceFileManifestId: input.manifest?.id ?? null,
    fileName: input.manifest?.fileName ?? 'arquivo-sintetico-bloqueado.xlsx',
    sha256: input.manifest?.sha256 ?? null,
    batchFileStatus: input.batchFileStatus ?? 'approved',
    logicalSource: input.logicalSource ?? confirmedLogicalSource,
    contentIdentity:
      input.status === 'unchanged'
        ? {
            state: 'known-identical',
            knownManifestId: input.manifest?.id ?? ('manifest:known' as SourceFileManifestId),
            knownManifestVersion: 1,
            observedFileNameChanged: false,
          }
        : { state: 'new-content' },
    status: input.status,
    diagnostics: [],
    reasons: [planReason(`file-${input.status}`)],
    items: input.items,
    counts,
    sourceFileWrite,
    estimatedWrites: {
      sourceFileVersions,
      academicRecordVersions,
      totalPlannedVersionWrites: sourceFileVersions + academicRecordVersions,
    },
  };
}

function derivePlanStatus(files: readonly ImportFileChangePlanV1[]): ImportChangePlanV1['status'] {
  const hasReady = files.some((file) => file.status === 'ready-for-promotion');
  const hasReview = files.some((file) => file.status === 'review-required');
  const hasBlocked = files.some((file) => file.status === 'blocked');
  if (hasReady && (hasReview || hasBlocked)) return 'partially-ready';
  if (hasReady) return 'ready-for-promotion';
  if (hasReview) return 'review-required';
  if (hasBlocked) return 'blocked';
  return 'no-changes';
}

function changePlan(
  files: readonly ImportFileChangePlanV1[],
  expectedBatchVersion = 1,
): ImportChangePlanV1 {
  const items = files.flatMap((file) => file.items);
  const counts = countItems(items);
  const readyFiles = files.filter((file) => file.status === 'ready-for-promotion');
  const reviewFiles = files.filter((file) => file.status === 'review-required');
  const sourceFileVersions = files.filter(
    (file) => file.sourceFileWrite.kind === 'append-version',
  ).length;
  const academicRecordVersions = files.reduce(
    (total, file) => total + file.counts.new + file.counts.changed,
    0,
  );
  const readyForPromotionVersionWrites = readyFiles.reduce(
    (total, file) => total + file.estimatedWrites.totalPlannedVersionWrites,
    0,
  );
  const pendingReviewVersionWrites = reviewFiles.reduce(
    (total, file) => total + file.estimatedWrites.totalPlannedVersionWrites,
    0,
  );

  return {
    importBatchId: batchId,
    academicYearId,
    expectedBatchVersion,
    status: derivePlanStatus(files),
    files,
    items,
    counts,
    estimatedWrites: {
      sourceFileVersions,
      academicRecordVersions,
      totalPlannedVersionWrites: sourceFileVersions + academicRecordVersions,
      readyForPromotionVersionWrites,
      pendingReviewVersionWrites,
      exactCloudflareQuota: false,
      basis: 'planned-version-appends-only',
    },
    promotionRequest: {
      importBatchId: batchId,
      approvedImportFileIds: readyFiles.map((file) => file.importFileId),
      expectedBatchVersion,
    },
    reviewRequiredImportFileIds: reviewFiles.map((file) => file.importFileId),
    blockedImportFileIds: files
      .filter((file) => file.status === 'blocked')
      .map((file) => file.importFileId),
    planningEvidence: {
      writesPerformed: 0,
      repositoriesExposeReadOperationsOnly: true,
      deterministicWithoutClockNetworkOrGlobalEnvironment: true,
    },
  };
}

function batchFile(
  importFileId: ImportFileId,
  sourceManifest: SourceFileManifestV1 | null,
  status: ImportBatchFileResultV1['status'] = 'approved',
): ImportBatchFileResultV1 {
  return {
    id: importFileId,
    sourceFile: {
      fileName: sourceManifest?.fileName ?? 'arquivo-sintetico-bloqueado.xlsx',
      extension: sourceManifest?.extension ?? 'xlsx',
      reportedMimeType: sourceManifest?.reportedMimeType ?? null,
      sizeBytes: sourceManifest?.sizeBytes ?? 128,
      lastModifiedAt: sourceManifest?.lastModifiedAt ?? null,
    },
    manifest: sourceManifest,
    status,
    diagnosticIds: [],
  };
}

function importBatch(files: readonly ImportBatchFileResultV1[]): ImportBatchResultV1 {
  const approvedFileCount = files.filter((file) => file.status === 'approved').length;
  const reviewRequiredFileCount = files.filter(
    (file) => file.status === 'review-required',
  ).length;
  const rejectedFileCount = files.filter((file) => file.status === 'rejected').length;
  const failedFileCount = files.filter((file) => file.status === 'failed').length;
  const hasExcluded = reviewRequiredFileCount + rejectedFileCount + failedFileCount > 0;

  return {
    id: batchId,
    status: hasExcluded ? 'partially-approved' : 'approved',
    files,
    diagnostics: [],
    receivedAt: '2026-08-31T10:00:00Z',
    updatedAt: '2026-08-31T10:10:00Z',
    summary: {
      totalFileCount: files.length,
      processedFileCount: files.length,
      approvedFileCount,
      reviewRequiredFileCount,
      rejectedFileCount,
      failedFileCount,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: failedFileCount + rejectedFileCount,
      criticalErrorCount: 0,
    },
  } as ImportBatchResultV1;
}

async function seedBatch(
  adapter: MemoryPersistenceAdapter,
  files: readonly ImportBatchFileResultV1[],
): Promise<void> {
  const result = await adapter.unitOfWork.imports.appendImportBatchVersion(
    context,
    importBatch(files),
    { expectedVersion: null },
  );
  expect(result.status).toBe('written');
}

async function appendAcademicVersion(
  adapter: MemoryPersistenceAdapter,
  record: AcademicRecordV1,
  expectedVersion: number | null,
) {
  return adapter.unitOfWork.academicRecords.appendVersion(
    context,
    academicRecordStreamForV1(record),
    record,
    { expectedVersion },
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

describe('transactional import change plan executor v1', () => {
  it('returns no-changes without opening a transaction for an identical hash plan', async () => {
    const sourceManifest = manifest({
      id: 'manifest:no-op',
      fileName: 'notas-sinteticas.xlsx',
      sha256: 'hash-identical',
    });
    const incoming = gradeRecord({
      key: '10',
      value: 8,
      fileName: sourceManifest.fileName,
      sha256: sourceManifest.sha256,
    });
    const stream = academicRecordStreamForV1(incoming);
    const importFileId = 'import-file:no-op' as ImportFileId;
    const plan = changePlan([
      filePlan({
        importFileId,
        manifest: sourceManifest,
        status: 'unchanged',
        items: [
          {
            state: 'unchanged',
            importFileId,
            stableKey: academicRecordStreamKeyV1(stream),
            stream,
            incomingRecord: incoming,
            currentVersion: null,
            reason: planReason('identical-content'),
          },
        ],
      }),
    ]);
    const transactionPort = new CountingTransactionPort(new MemoryPersistenceAdapter());

    const result = await executeImportChangePlan(plan, transactionPort);

    expect(result).toMatchObject({
      status: 'no-changes',
      transactionStarted: false,
      transactionCommitted: false,
      plannedWrites: {
        sourceFileVersions: 0,
        academicRecordVersions: 0,
        totalVersionWrites: 0,
      },
      committedWrites: {
        sourceFileVersions: 0,
        academicRecordVersions: 0,
        totalVersionWrites: 0,
      },
    });
    expect(transactionPort.calls).toBe(0);
  });

  it('commits only the planned source metadata append for a renamed identical file', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const sourceManifest = manifest({
      id: 'manifest:renamed',
      fileName: 'notas-sinteticas-renomeadas.xlsx',
      sha256: 'hash-identical-renamed',
    });
    const incoming = gradeRecord({
      key: '11',
      value: 7,
      fileName: sourceManifest.fileName,
      sha256: sourceManifest.sha256,
    });
    const stream = academicRecordStreamForV1(incoming);
    const importFileId = 'import-file:renamed' as ImportFileId;
    const plan = changePlan([
      filePlan({
        importFileId,
        manifest: sourceManifest,
        status: 'ready-for-promotion',
        sourceFileWrite: sourceWrite(sourceManifest),
        items: [
          {
            state: 'unchanged',
            importFileId,
            stableKey: academicRecordStreamKeyV1(stream),
            stream,
            incomingRecord: incoming,
            currentVersion: null,
            reason: planReason('renamed-identical-content'),
          },
        ],
      }),
    ]);
    await seedBatch(adapter, [batchFile(importFileId, sourceManifest)]);

    const result = await executeImportChangePlan(plan, adapter);

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected applied result');
    expect(result.committedWrites).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 0,
      totalVersionWrites: 1,
    });
    expect(result.appliedVersions).toEqual({
      sourceFiles: [
        {
          importFileId,
          sourceFileManifestId: sourceManifest.id,
          version: 1,
        },
      ],
      academicRecords: [],
    });
    expect(
      await adapter.unitOfWork.imports.getSourceFileVersion(context, sourceManifest.id),
    ).toMatchObject({ version: 1 });
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, stream)).toBeNull();
  });

  it('commits new and changed items while excluding unchanged, missing and blocked files', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const readyManifest = manifest({
      id: 'manifest:ready',
      fileName: 'arquivo-pronto.xlsx',
      sha256: 'hash-ready',
    });
    const reviewManifest = manifest({
      id: 'manifest:review',
      fileName: 'arquivo-revisao.xlsx',
      sha256: 'hash-review',
    });
    const newRecord = gradeRecord({
      key: '20',
      value: 9,
      fileName: readyManifest.fileName,
      sha256: readyManifest.sha256,
    });
    const changedPrevious = gradeRecord({
      key: '21',
      value: 5,
      fileName: 'arquivo-anterior.xlsx',
      sha256: 'hash-anterior',
      technicalId: 'grade-entry:execution:21:v1',
    });
    const changedIncoming = gradeRecord({
      key: '21',
      value: 6,
      fileName: readyManifest.fileName,
      sha256: readyManifest.sha256,
      technicalId: 'grade-entry:execution:21:v2',
      technicalVersion: 2,
    });
    const unchangedRecord = gradeRecord({
      key: '22',
      value: 8,
      fileName: readyManifest.fileName,
      sha256: readyManifest.sha256,
    });
    const missingRecord = gradeRecord({
      key: '23',
      value: 4,
      fileName: 'arquivo-anterior.xlsx',
      sha256: 'hash-anterior',
    });

    const changedSeed = await appendAcademicVersion(adapter, changedPrevious, null);
    const unchangedSeed = await appendAcademicVersion(adapter, unchangedRecord, null);
    const missingSeed = await appendAcademicVersion(adapter, missingRecord, null);
    expect(changedSeed.status).toBe('written');
    expect(unchangedSeed.status).toBe('written');
    expect(missingSeed.status).toBe('written');

    const readyFileId = 'import-file:ready' as ImportFileId;
    const reviewFileId = 'import-file:review' as ImportFileId;
    const blockedFileId = 'import-file:blocked' as ImportFileId;
    const changedStream = academicRecordStreamForV1(changedIncoming);
    const unchangedStream = academicRecordStreamForV1(unchangedRecord);
    const missingStream = academicRecordStreamForV1(missingRecord);
    const newStream = academicRecordStreamForV1(newRecord);
    const readyFilePlan = filePlan({
      importFileId: readyFileId,
      manifest: readyManifest,
      status: 'ready-for-promotion',
      sourceFileWrite: sourceWrite(readyManifest),
      items: [
        {
          state: 'new',
          importFileId: readyFileId,
          stableKey: academicRecordStreamKeyV1(newStream),
          stream: newStream,
          incomingRecord: newRecord,
          expectedVersion: null,
          reason: planReason('new-record'),
        },
        {
          state: 'changed',
          importFileId: readyFileId,
          stableKey: academicRecordStreamKeyV1(changedStream),
          stream: changedStream,
          incomingRecord: changedIncoming,
          currentRecord: versionedRecord(changedPrevious, 1),
          expectedVersion: 1,
          reason: planReason('changed-record'),
        },
        {
          state: 'unchanged',
          importFileId: readyFileId,
          stableKey: academicRecordStreamKeyV1(unchangedStream),
          stream: unchangedStream,
          incomingRecord: unchangedRecord,
          currentVersion: 1,
          reason: planReason('unchanged-record'),
        },
      ],
    });
    const reviewFilePlan = filePlan({
      importFileId: reviewFileId,
      manifest: reviewManifest,
      status: 'review-required',
      sourceFileWrite: sourceWrite(reviewManifest),
      items: [
        {
          state: 'missing-from-new-source',
          importFileId: reviewFileId,
          stableKey: academicRecordStreamKeyV1(missingStream),
          stream: missingStream,
          currentRecord: versionedRecord(missingRecord, 1),
          expectedVersion: 1,
          reason: planReason('missing-record'),
        },
      ],
    });
    const blockedFilePlan = filePlan({
      importFileId: blockedFileId,
      manifest: null,
      status: 'blocked',
      batchFileStatus: 'failed',
      logicalSource: { state: 'unmatched' },
      items: [
        {
          state: 'blocked',
          importFileId: blockedFileId,
          reason: planReason('blocked-file'),
        },
      ],
    });
    const plan = changePlan([readyFilePlan, reviewFilePlan, blockedFilePlan]);
    await seedBatch(adapter, [
      batchFile(readyFileId, readyManifest),
      batchFile(reviewFileId, reviewManifest),
      batchFile(blockedFileId, null, 'failed'),
    ]);

    const result = await executeImportChangePlan(plan, adapter);

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected applied result');
    expect(result.plannedWrites).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 2,
      totalVersionWrites: 3,
    });
    expect(result.committedWrites).toEqual(result.plannedWrites);
    expect(result.appliedVersions.sourceFiles).toEqual([
      {
        importFileId: readyFileId,
        sourceFileManifestId: readyManifest.id,
        version: 1,
      },
    ]);
    expect(result.appliedVersions.academicRecords).toEqual([
      {
        importFileId: readyFileId,
        changeState: 'new',
        stableKey: academicRecordStreamKeyV1(newStream),
        recordKind: 'grade-entry',
        version: 1,
      },
      {
        importFileId: readyFileId,
        changeState: 'changed',
        stableKey: academicRecordStreamKeyV1(changedStream),
        recordKind: 'grade-entry',
        version: 2,
      },
    ]);
    expect((await adapter.unitOfWork.academicRecords.getCurrent(context, newStream))?.version).toBe(
      1,
    );
    expect(
      (await adapter.unitOfWork.academicRecords.getCurrent(context, changedStream))?.version,
    ).toBe(2);
    expect(
      (await adapter.unitOfWork.academicRecords.getCurrent(context, unchangedStream))?.version,
    ).toBe(1);
    expect(
      (await adapter.unitOfWork.academicRecords.getCurrent(context, missingStream))?.version,
    ).toBe(1);
    expect(
      await adapter.unitOfWork.imports.getSourceFileVersion(context, reviewManifest.id),
    ).toBeNull();
  });

  it('returns an explicit conflict and rolls back source and academic appends', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const sourceManifest = manifest({
      id: 'manifest:rollback',
      fileName: 'arquivo-rollback.xlsx',
      sha256: 'hash-rollback',
    });
    const newRecord = gradeRecord({
      key: '30',
      value: 10,
      fileName: sourceManifest.fileName,
      sha256: sourceManifest.sha256,
    });
    const changedV1 = gradeRecord({
      key: '31',
      value: 5,
      fileName: 'arquivo-v1.xlsx',
      sha256: 'hash-v1',
      technicalId: 'grade-entry:execution:31:v1',
    });
    const changedV2 = gradeRecord({
      key: '31',
      value: 5.5,
      fileName: 'arquivo-v2.xlsx',
      sha256: 'hash-v2',
      technicalId: 'grade-entry:execution:31:v2',
      technicalVersion: 2,
    });
    const changedIncoming = gradeRecord({
      key: '31',
      value: 6,
      fileName: sourceManifest.fileName,
      sha256: sourceManifest.sha256,
      technicalId: 'grade-entry:execution:31:v3',
      technicalVersion: 3,
    });
    expect((await appendAcademicVersion(adapter, changedV1, null)).status).toBe('written');
    expect((await appendAcademicVersion(adapter, changedV2, 1)).status).toBe('written');

    const importFileId = 'import-file:rollback' as ImportFileId;
    const newStream = academicRecordStreamForV1(newRecord);
    const changedStream = academicRecordStreamForV1(changedIncoming);
    const plan = changePlan([
      filePlan({
        importFileId,
        manifest: sourceManifest,
        status: 'ready-for-promotion',
        sourceFileWrite: sourceWrite(sourceManifest),
        items: [
          {
            state: 'new',
            importFileId,
            stableKey: academicRecordStreamKeyV1(newStream),
            stream: newStream,
            incomingRecord: newRecord,
            expectedVersion: null,
            reason: planReason('new-before-conflict'),
          },
          {
            state: 'changed',
            importFileId,
            stableKey: academicRecordStreamKeyV1(changedStream),
            stream: changedStream,
            incomingRecord: changedIncoming,
            currentRecord: versionedRecord(changedV1, 1),
            expectedVersion: 1,
            reason: planReason('stale-change'),
          },
        ],
      }),
    ]);
    await seedBatch(adapter, [batchFile(importFileId, sourceManifest)]);

    const result = await executeImportChangePlan(plan, adapter);

    expect(result.status).toBe('version-conflict');
    if (result.status !== 'version-conflict') throw new Error('expected conflict result');
    expect(result.conflict).toEqual({
      scope: 'academic-record',
      importFileId,
      stableKey: academicRecordStreamKeyV1(changedStream),
      expectedVersion: 1,
      currentVersion: 2,
    });
    expect(result.attemptedWritesBeforeRollback).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 1,
      totalVersionWrites: 2,
    });
    expect(result.committedWrites).toEqual({
      sourceFileVersions: 0,
      academicRecordVersions: 0,
      totalVersionWrites: 0,
    });
    expect(
      await adapter.unitOfWork.imports.getSourceFileVersion(context, sourceManifest.id),
    ).toBeNull();
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, newStream)).toBeNull();
    expect(
      (await adapter.unitOfWork.academicRecords.getCurrent(context, changedStream))?.version,
    ).toBe(2);
  });

  it('rejects tampered promotion membership and write estimates before the transaction', async () => {
    const sourceManifest = manifest({
      id: 'manifest:tampered',
      fileName: 'arquivo-adulterado.xlsx',
      sha256: 'hash-tampered',
    });
    const importFileId = 'import-file:tampered' as ImportFileId;
    const reviewFileId = 'import-file:review-not-approved' as ImportFileId;
    const ready = filePlan({
      importFileId,
      manifest: sourceManifest,
      status: 'ready-for-promotion',
      sourceFileWrite: sourceWrite(sourceManifest),
      items: [],
    });
    const review = filePlan({
      importFileId: reviewFileId,
      manifest: sourceManifest,
      status: 'review-required',
      sourceFileWrite: sourceWrite(sourceManifest),
      items: [],
    });
    const validPlan = changePlan([ready, review]);
    const tamperedPlan = {
      ...validPlan,
      promotionRequest: {
        ...validPlan.promotionRequest,
        approvedImportFileIds: [importFileId, reviewFileId],
      },
      estimatedWrites: {
        ...validPlan.estimatedWrites,
        readyForPromotionVersionWrites: 99,
      },
    } as ImportChangePlanV1;
    const transactionPort = new CountingTransactionPort(new MemoryPersistenceAdapter());

    const result = await executeImportChangePlan(tamperedPlan, transactionPort);

    expect(result.status).toBe('rejected-invalid-plan');
    if (result.status !== 'rejected-invalid-plan') {
      throw new Error('expected invalid plan result');
    }
    expect(result.transactionStarted).toBe(false);
    expect(result.validationIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['promotion-request-mismatch', 'plan-write-estimate-mismatch']),
    );
    expect(transactionPort.calls).toBe(0);
  });

  it('sanitizes transaction failures and keeps provider-specific APIs out of the executor', async () => {
    const sourceManifest = manifest({
      id: 'manifest:failure',
      fileName: 'arquivo-falha.xlsx',
      sha256: 'hash-failure',
    });
    const importFileId = 'import-file:failure' as ImportFileId;
    const plan = changePlan([
      filePlan({
        importFileId,
        manifest: sourceManifest,
        status: 'ready-for-promotion',
        sourceFileWrite: sourceWrite(sourceManifest),
        items: [],
      }),
    ]);

    const result = await executeImportChangePlan(plan, new FailingTransactionPort());

    expect(result.status).toBe('transaction-failed');
    if (result.status !== 'transaction-failed') throw new Error('expected transaction failure');
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
