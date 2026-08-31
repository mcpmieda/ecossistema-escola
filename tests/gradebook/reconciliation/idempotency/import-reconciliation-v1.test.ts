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
  ImportFileDiagnosticV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileDiagnosticId,
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
  LogicalSourceIdV1,
  SourceFileVersionV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
  planImportReconciliation,
  type ImportReconciliationRepositoriesV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';

const academicYearId = 'academic-year:2026' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const batchId = 'import-batch:reconciliation:synthetic' as ImportBatchId;
const logicalSourceA = 'logical-source:synthetic:teacher-a' as LogicalSourceIdV1;
const logicalSourceB = 'logical-source:synthetic:teacher-b' as LogicalSourceIdV1;

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
    confirmedTeacherId: 'teacher:synthetic:001' as TeacherId,
  };
}

function approvedFile(id: string, sourceManifest: SourceFileManifestV1): ImportBatchFileResultV1 {
  return {
    id: id as ImportFileId,
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

function failedFile(id: string, diagnosticId: ImportFileDiagnosticId): ImportBatchFileResultV1 {
  return {
    id: id as ImportFileId,
    sourceFile: {
      fileName: 'arquivo-sintetico-invalido.xlsx',
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
    },
    manifest: null,
    status: 'failed',
    diagnosticIds: [diagnosticId],
  };
}

function batch(
  files: readonly ImportBatchFileResultV1[],
  diagnostics: readonly ImportFileDiagnosticV1[] = [],
): ImportBatchResultV1 {
  const approvedFileCount = files.filter((file) => file.status === 'approved').length;
  const failedFileCount = files.filter((file) => file.status === 'failed').length;
  return {
    id: batchId,
    status: failedFileCount > 0 ? 'partially-approved' : 'approved',
    files,
    diagnostics,
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
      criticalErrorCount: diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'critical-error',
      ).length,
    },
  } as ImportBatchResultV1;
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
  ruleVersion?: string;
}): AcademicRecordV1 {
  const gradeEntry = {
    id: (input.technicalId ?? `grade-entry:${input.key}`) as GradeEntryId,
    academicYearId,
    studentId: `student:synthetic:${input.key}` as StudentId,
    enrollmentId: `enrollment:synthetic:${input.key}` as EnrollmentId,
    assessmentComponentId: `assessment:synthetic:${input.key}` as AssessmentComponentId,
    value: comparedValue({
      fileName: input.fileName,
      sha256: input.sha256,
      value: input.value,
      cellAddress: `R${input.key}`,
    }),
    authorityMode: 'imported-source',
    ruleVersion: input.ruleVersion ?? 'rule:synthetic-v1',
    version: input.technicalVersion ?? 1,
  } satisfies GradeEntryV1;

  return { kind: 'grade-entry', value: gradeEntry };
}

function versionedAcademicRecord(
  value: AcademicRecordV1,
  version: number,
): VersionedRecordV1<AcademicRecordV1> {
  return {
    value,
    version,
    recordedAt: `2026-08-31T10:${String(version).padStart(2, '0')}:00Z`,
  };
}

function versionedSource(
  value: SourceFileVersionV1,
  version: number,
): VersionedRecordV1<SourceFileVersionV1> {
  return {
    value,
    version,
    recordedAt: `2026-08-31T09:${String(version).padStart(2, '0')}:00Z`,
  };
}

class SyntheticReconciliationAdapter {
  private readonly sourceVersions: VersionedRecordV1<SourceFileVersionV1>[] = [];
  private readonly academicRecords = new Map<
    string,
    VersionedRecordV1<AcademicRecordV1>
  >();
  private readonly streamsByLogicalSource = new Map<
    LogicalSourceIdV1,
    readonly AcademicRecordStreamV1[]
  >();
  private readonly failingAcademicReads = new Set<string>();

  readonly academicReadKeys: string[] = [];
  readonly logicalSourceReadIds: LogicalSourceIdV1[] = [];
  readonly sourceHashReads: string[] = [];
  readonly sourceManifestReads: SourceFileManifestId[] = [];
  writeCalls = 0;

  readonly imports = {
    findSourceFileByHash: async (
      _context: AcademicPersistenceContextV1,
      sha256: string,
    ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> => {
      this.sourceHashReads.push(sha256);
      return this.sourceVersions.find((record) => record.value.manifest.sha256 === sha256) ?? null;
    },
    getSourceFileVersion: async (
      _context: AcademicPersistenceContextV1,
      manifestId: SourceFileManifestId,
    ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> => {
      this.sourceManifestReads.push(manifestId);
      return (
        [...this.sourceVersions]
          .reverse()
          .find((record) => record.value.manifest.id === manifestId) ?? null
      );
    },
    appendSourceFileVersion: async (): Promise<never> => {
      this.writeCalls += 1;
      throw new Error('planning must not write source versions');
    },
  };

  readonly records = {
    getCurrent: async (
      _context: AcademicPersistenceContextV1,
      stream: AcademicRecordStreamV1,
    ): Promise<VersionedRecordV1<AcademicRecordV1> | null> => {
      const key = academicRecordStreamKeyV1(stream);
      this.academicReadKeys.push(key);
      if (this.failingAcademicReads.has(key)) throw new Error('synthetic read failure');
      return this.academicRecords.get(key) ?? null;
    },
    appendVersion: async (): Promise<never> => {
      this.writeCalls += 1;
      throw new Error('planning must not write academic versions');
    },
  };

  readonly logicalSourceRecords = {
    listCurrentStreams: async (
      _context: AcademicPersistenceContextV1,
      logicalSourceId: LogicalSourceIdV1,
    ): Promise<readonly AcademicRecordStreamV1[]> => {
      this.logicalSourceReadIds.push(logicalSourceId);
      return this.streamsByLogicalSource.get(logicalSourceId) ?? [];
    },
  };

  get repositories(): ImportReconciliationRepositoriesV1 {
    return {
      imports: this.imports,
      academicRecords: this.records,
      logicalSourceRecords: this.logicalSourceRecords,
    };
  }

  seedSource(value: SourceFileVersionV1, version = 1): void {
    this.sourceVersions.push(versionedSource(value, version));
  }

  seedAcademicRecord(record: AcademicRecordV1, version: number): AcademicRecordStreamV1 {
    const stream = academicRecordStreamForV1(record);
    this.academicRecords.set(
      academicRecordStreamKeyV1(stream),
      versionedAcademicRecord(record, version),
    );
    return stream;
  }

  setLogicalSourceStreams(
    logicalSourceId: LogicalSourceIdV1,
    streams: readonly AcademicRecordStreamV1[],
  ): void {
    this.streamsByLogicalSource.set(logicalSourceId, streams);
  }

  failAcademicRead(stream: AcademicRecordStreamV1): void {
    this.failingAcademicReads.add(academicRecordStreamKeyV1(stream));
  }
}

function fileInput(input: {
  importFileId: ImportFileId;
  logicalSourceId?: LogicalSourceIdV1;
  candidateLogicalSourceIds?: readonly LogicalSourceIdV1[];
  records: readonly AcademicRecordV1[];
}) {
  const logicalSource = input.candidateLogicalSourceIds
    ? ({
        state: 'candidate',
        candidateLogicalSourceIds: input.candidateLogicalSourceIds,
      } as const)
    : input.logicalSourceId
      ? ({ state: 'confirmed', logicalSourceId: input.logicalSourceId } as const)
      : ({ state: 'unmatched' } as const);

  return {
    importFileId: input.importFileId,
    logicalSource,
    records: input.records,
  };
}

function itemByState<TState extends 'new' | 'changed' | 'missing-from-new-source'>(
  items: Awaited<ReturnType<typeof planImportReconciliation>>['items'],
  state: TState,
): Extract<(typeof items)[number], { readonly state: TState }> {
  const item = items.find((candidate) => candidate.state === state);
  if (!item || item.state !== state) throw new Error(`missing ${state} item`);
  return item as Extract<(typeof items)[number], { readonly state: TState }>;
}

describe('idempotent import reconciliation v1', () => {
  it('short-circuits a known hash and records only renamed source metadata', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const knownManifest = manifest({
      id: 'manifest:known',
      fileName: 'notas-professor.xlsx',
      sha256: 'hash-identical',
    });
    adapter.seedSource(
      {
        manifest: knownManifest,
        logicalSource: { state: 'confirmed', logicalSourceId: logicalSourceA },
      },
      4,
    );

    const sameNameManifest = manifest({
      id: 'manifest:same-name-observation',
      fileName: knownManifest.fileName,
      sha256: knownManifest.sha256,
      readAt: '2026-08-31T11:00:00Z',
    });
    const sameNameFile = approvedFile('import-file:same-name', sameNameManifest);
    const incomingRecord = gradeRecord({
      key: '10',
      value: 9,
      fileName: sameNameManifest.fileName,
      sha256: sameNameManifest.sha256,
    });

    const noOpPlan = await planImportReconciliation(
      {
        context,
        batch: batch([sameNameFile]),
        expectedBatchVersion: 3,
        files: [
          fileInput({
            importFileId: sameNameFile.id,
            logicalSourceId: logicalSourceB,
            records: [incomingRecord],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(noOpPlan.status).toBe('no-changes');
    expect(noOpPlan.counts).toEqual({
      unchanged: 1,
      new: 0,
      changed: 0,
      'missing-from-new-source': 0,
      blocked: 0,
    });
    expect(noOpPlan.estimatedWrites).toMatchObject({
      academicRecordVersions: 0,
      sourceFileVersions: 0,
      totalPlannedVersionWrites: 0,
    });
    expect(noOpPlan.files[0]?.logicalSource).toEqual({
      state: 'confirmed',
      logicalSourceId: logicalSourceA,
    });
    expect(noOpPlan.files[0]?.sourceFileWrite).toEqual({ kind: 'none' });
    expect(adapter.academicReadKeys).toEqual([]);
    expect(adapter.logicalSourceReadIds).toEqual([]);

    const renamedManifest = manifest({
      id: 'manifest:renamed-observation',
      fileName: 'notas-professor-renomeado.xlsx',
      sha256: knownManifest.sha256,
      readAt: '2026-08-31T12:00:00Z',
    });
    const renamedFile = approvedFile('import-file:renamed', renamedManifest);
    const renamedPlan = await planImportReconciliation(
      {
        context,
        batch: batch([renamedFile]),
        expectedBatchVersion: 4,
        files: [
          fileInput({
            importFileId: renamedFile.id,
            logicalSourceId: logicalSourceB,
            records: [incomingRecord],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(renamedPlan.status).toBe('ready-for-promotion');
    expect(renamedPlan.estimatedWrites).toMatchObject({
      academicRecordVersions: 0,
      sourceFileVersions: 1,
      totalPlannedVersionWrites: 1,
    });
    expect(renamedPlan.promotionRequest).toEqual({
      importBatchId: batchId,
      approvedImportFileIds: [renamedFile.id],
      expectedBatchVersion: 4,
    });

    const sourceWrite = renamedPlan.files[0]?.sourceFileWrite;
    expect(sourceWrite?.kind).toBe('append-version');
    if (sourceWrite?.kind !== 'append-version') throw new Error('missing renamed source write');
    expect(sourceWrite.expectedVersion).toBeNull();
    expect(sourceWrite.value.manifest.fileName).toBe(renamedManifest.fileName);
    expect(sourceWrite.value.logicalSource).toEqual({
      state: 'confirmed',
      logicalSourceId: logicalSourceA,
    });
    expect(adapter.academicReadKeys).toEqual([]);
    expect(adapter.writeCalls).toBe(0);
    expect(renamedPlan.planningEvidence.writesPerformed).toBe(0);
  });

  it('compares a confirmed source by stable academic keys and plans only semantic changes', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const incomingManifest = manifest({
      id: 'manifest:incremental',
      fileName: 'professor-atualizado.xlsx',
      sha256: 'hash-new-content',
    });
    adapter.seedSource(
      {
        manifest: manifest({
          id: incomingManifest.id,
          fileName: 'professor-versao-anterior.xlsx',
          sha256: 'hash-old-content',
          readAt: '2026-08-30T10:00:00Z',
        }),
        logicalSource: { state: 'confirmed', logicalSourceId: logicalSourceA },
      },
      4,
    );

    const unchangedCurrent = gradeRecord({
      key: '11',
      value: 8,
      fileName: 'professor-versao-anterior.xlsx',
      sha256: 'hash-old-content',
      technicalId: 'grade-entry:old:11',
      technicalVersion: 2,
    });
    const unchangedIncoming = gradeRecord({
      key: '11',
      value: 8,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:new:11',
      technicalVersion: 99,
    });
    const changedCurrent = gradeRecord({
      key: '12',
      value: 5,
      fileName: 'professor-versao-anterior.xlsx',
      sha256: 'hash-old-content',
    });
    const changedIncoming = gradeRecord({
      key: '12',
      value: 6,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:new:12',
    });
    const missingCurrent = gradeRecord({
      key: '13',
      value: 4,
      fileName: 'professor-versao-anterior.xlsx',
      sha256: 'hash-old-content',
    });
    const replicatedCurrent = gradeRecord({
      key: '14',
      value: 7,
      fileName: 'turma-origem.xlsx',
      sha256: 'hash-transfer-origin',
    });
    const replicatedIncoming = gradeRecord({
      key: '14',
      value: 7,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:destination-copy:14',
    });
    const newIncoming = gradeRecord({
      key: '15',
      value: 9,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
    });

    const unchangedStream = adapter.seedAcademicRecord(unchangedCurrent, 2);
    const changedStream = adapter.seedAcademicRecord(changedCurrent, 7);
    const missingStream = adapter.seedAcademicRecord(missingCurrent, 3);
    adapter.seedAcademicRecord(replicatedCurrent, 5);
    adapter.setLogicalSourceStreams(logicalSourceA, [missingStream, changedStream, unchangedStream]);

    const importFile = approvedFile('import-file:incremental', incomingManifest);
    const inputRecords = [newIncoming, changedIncoming, replicatedIncoming, unchangedIncoming];
    const firstPlan = await planImportReconciliation(
      {
        context,
        batch: batch([importFile]),
        expectedBatchVersion: 6,
        files: [
          fileInput({
            importFileId: importFile.id,
            logicalSourceId: logicalSourceA,
            records: inputRecords,
          }),
        ],
      },
      adapter.repositories,
    );

    expect(firstPlan.status).toBe('review-required');
    expect(firstPlan.counts).toEqual({
      unchanged: 2,
      new: 1,
      changed: 1,
      'missing-from-new-source': 1,
      blocked: 0,
    });
    expect(firstPlan.reviewRequiredImportFileIds).toEqual([importFile.id]);
    expect(firstPlan.promotionRequest.approvedImportFileIds).toEqual([]);
    expect(firstPlan.estimatedWrites).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 2,
      totalPlannedVersionWrites: 3,
      readyForPromotionVersionWrites: 0,
      pendingReviewVersionWrites: 3,
      exactCloudflareQuota: false,
      basis: 'planned-version-appends-only',
    });

    const newItem = itemByState(firstPlan.items, 'new');
    expect(newItem.expectedVersion).toBeNull();
    expect(newItem.stableKey).toBe(
      academicRecordStreamKeyV1(academicRecordStreamForV1(newIncoming)),
    );

    const changedItem = itemByState(firstPlan.items, 'changed');
    expect(changedItem.expectedVersion).toBe(7);
    expect(changedItem.currentRecord.value).toEqual(changedCurrent);
    expect(changedItem.incomingRecord).toEqual(changedIncoming);

    const missingItem = itemByState(firstPlan.items, 'missing-from-new-source');
    expect(missingItem.expectedVersion).toBe(3);
    expect(missingItem.currentRecord.value).toEqual(missingCurrent);
    expect(missingItem.reason.code).toBe('academic-record-missing-from-new-source');

    const filePlan = firstPlan.files[0];
    expect(filePlan?.sourceFileWrite.kind).toBe('append-version');
    if (filePlan?.sourceFileWrite.kind !== 'append-version') {
      throw new Error('missing incremental source write');
    }
    expect(filePlan.sourceFileWrite.expectedVersion).toBe(4);

    adapter.setLogicalSourceStreams(logicalSourceA, [unchangedStream, changedStream, missingStream]);
    const secondPlan = await planImportReconciliation(
      {
        context,
        batch: batch([importFile]),
        expectedBatchVersion: 6,
        files: [
          fileInput({
            importFileId: importFile.id,
            logicalSourceId: logicalSourceA,
            records: [...inputRecords].reverse(),
          }),
        ],
      },
      adapter.repositories,
    );

    expect(secondPlan).toEqual(firstPlan);
    expect(firstPlan.items.map((item) => item.stableKey ?? '')).toEqual(
      [...firstPlan.items.map((item) => item.stableKey ?? '')].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    expect(adapter.writeCalls).toBe(0);
  });

  it('requires review for a new hash with candidate logical sources and plans no writes', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const sourceManifest = manifest({
      id: 'manifest:ambiguous',
      fileName: 'professor-sintetico.xlsx',
      sha256: 'hash-ambiguous-new',
    });
    const importFile = approvedFile('import-file:ambiguous', sourceManifest);

    const plan = await planImportReconciliation(
      {
        context,
        batch: batch([importFile]),
        expectedBatchVersion: 2,
        files: [
          fileInput({
            importFileId: importFile.id,
            candidateLogicalSourceIds: [logicalSourceA, logicalSourceB],
            records: [
              gradeRecord({
                key: '20',
                value: 8,
                fileName: sourceManifest.fileName,
                sha256: sourceManifest.sha256,
              }),
            ],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(plan.status).toBe('review-required');
    expect(plan.counts.blocked).toBe(1);
    expect(plan.files[0]?.logicalSource).toEqual({
      state: 'candidate',
      candidateLogicalSourceIds: [logicalSourceA, logicalSourceB],
    });
    expect(plan.files[0]?.items[0]?.reason.code).toBe(
      'candidate-logical-source-requires-review',
    );
    expect(plan.promotionRequest.approvedImportFileIds).toEqual([]);
    expect(plan.estimatedWrites.totalPlannedVersionWrites).toBe(0);
    expect(adapter.logicalSourceReadIds).toEqual([]);
    expect(adapter.academicReadKeys).toEqual([]);
    expect(adapter.sourceManifestReads).toEqual([]);
    expect(adapter.writeCalls).toBe(0);
  });

  it('isolates a failed file with critical diagnostics while preserving an approved plan', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const failedFileId = 'import-file:a-failed' as ImportFileId;
    const diagnosticId = 'diagnostic:critical:synthetic' as ImportFileDiagnosticId;
    const diagnostic = {
      id: diagnosticId,
      importBatchId: batchId,
      importFileId: failedFileId,
      severity: 'critical-error',
      code: 'synthetic-invalid-file',
      message: 'Arquivo sintético inválido.',
      location: { kind: 'file' },
    } satisfies ImportFileDiagnosticV1;
    const invalidFile = failedFile(failedFileId, diagnosticId);

    const validManifest = manifest({
      id: 'manifest:valid',
      fileName: 'arquivo-sintetico-valido.xlsx',
      sha256: 'hash-valid-new',
    });
    const validFile = approvedFile('import-file:b-valid', validManifest);
    const validRecord = gradeRecord({
      key: '30',
      value: 10,
      fileName: validManifest.fileName,
      sha256: validManifest.sha256,
    });

    const plan = await planImportReconciliation(
      {
        context,
        batch: batch([validFile, invalidFile], [diagnostic]),
        expectedBatchVersion: 9,
        files: [
          fileInput({
            importFileId: validFile.id,
            logicalSourceId: logicalSourceA,
            records: [validRecord],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(plan.status).toBe('partially-ready');
    expect(plan.files.map((file) => file.importFileId)).toEqual([
      invalidFile.id,
      validFile.id,
    ]);
    expect(plan.counts).toMatchObject({ blocked: 1, new: 1 });
    expect(plan.blockedImportFileIds).toEqual([invalidFile.id]);
    expect(plan.promotionRequest).toEqual({
      importBatchId: batchId,
      approvedImportFileIds: [validFile.id],
      expectedBatchVersion: 9,
    });
    expect(plan.files[0]?.diagnostics).toEqual([diagnostic]);
    expect(plan.files[0]?.reasons[0]?.diagnosticIds).toEqual([diagnosticId]);
    expect(plan.estimatedWrites).toMatchObject({
      sourceFileVersions: 1,
      academicRecordVersions: 1,
      totalPlannedVersionWrites: 2,
      readyForPromotionVersionWrites: 2,
    });
    expect(adapter.writeCalls).toBe(0);
  });

  it('isolates a repository read failure without discarding another approved file', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const blockedManifest = manifest({
      id: 'manifest:a-read-failure',
      fileName: 'arquivo-a.xlsx',
      sha256: 'hash-a-new',
    });
    const readyManifest = manifest({
      id: 'manifest:b-ready',
      fileName: 'arquivo-b.xlsx',
      sha256: 'hash-b-new',
    });
    const blockedFile = approvedFile('import-file:a-read-failure', blockedManifest);
    const readyFile = approvedFile('import-file:b-ready', readyManifest);
    const blockedRecord = gradeRecord({
      key: '40',
      value: 6,
      fileName: blockedManifest.fileName,
      sha256: blockedManifest.sha256,
    });
    const readyRecord = gradeRecord({
      key: '41',
      value: 7,
      fileName: readyManifest.fileName,
      sha256: readyManifest.sha256,
    });
    adapter.failAcademicRead(academicRecordStreamForV1(blockedRecord));

    const plan = await planImportReconciliation(
      {
        context,
        batch: batch([readyFile, blockedFile]),
        expectedBatchVersion: 5,
        files: [
          fileInput({
            importFileId: blockedFile.id,
            logicalSourceId: logicalSourceA,
            records: [blockedRecord],
          }),
          fileInput({
            importFileId: readyFile.id,
            logicalSourceId: logicalSourceB,
            records: [readyRecord],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(plan.status).toBe('partially-ready');
    expect(plan.blockedImportFileIds).toEqual([blockedFile.id]);
    expect(plan.promotionRequest.approvedImportFileIds).toEqual([readyFile.id]);
    expect(plan.files[0]?.reasons[0]?.code).toBe('reconciliation-read-failed');
    expect(plan.files[0]?.estimatedWrites.totalPlannedVersionWrites).toBe(0);
    expect(plan.files[1]?.counts.new).toBe(1);
    expect(adapter.writeCalls).toBe(0);
  });

  it('does not depend on clock, network, D1 or global environment during planning', async () => {
    const source = readFileSync(
      'server/gradebook/application/import/import-reconciliation-v1.ts',
      'utf8',
    );

    expect(source).not.toContain('Date.now');
    expect(source).not.toContain('new Date');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('D1Database');
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('Math.random');
  });
});
