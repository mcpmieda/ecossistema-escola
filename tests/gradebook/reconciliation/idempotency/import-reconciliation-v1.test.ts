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
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  SourceFileVersionV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
  planImportReconciliation,
  type ImportReconciliationRepositoriesV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';

const academicYearId = 'academic-year:2026' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const batchId = 'import-batch:association-planner:synthetic' as ImportBatchId;
const logicalSourceA = 'logical-source:association:teacher-a' as LogicalSourceIdV1;
const logicalSourceB = 'logical-source:association:teacher-b' as LogicalSourceIdV1;

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

function batch(files: readonly ImportBatchFileResultV1[]): ImportBatchResultV1 {
  return {
    id: batchId,
    status: 'approved',
    files,
    diagnostics: [],
    receivedAt: '2026-08-31T10:00:00Z',
    updatedAt: '2026-08-31T10:10:00Z',
    summary: {
      totalFileCount: files.length,
      processedFileCount: files.length,
      approvedFileCount: files.length,
      reviewRequiredFileCount: 0,
      rejectedFileCount: 0,
      failedFileCount: 0,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 0,
      criticalErrorCount: 0,
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
}): AcademicRecordV1 {
  const gradeEntry = {
    id: (input.technicalId ?? `grade-entry:association:${input.key}`) as GradeEntryId,
    academicYearId,
    studentId: `student:association:${input.key}` as StudentId,
    enrollmentId: `enrollment:association:${input.key}` as EnrollmentId,
    assessmentComponentId:
      `assessment:association:${input.key}` as AssessmentComponentId,
    value: comparedValue({
      fileName: input.fileName,
      sha256: input.sha256,
      value: input.value,
      cellAddress: `R${input.key}`,
    }),
    authorityMode: 'imported-source',
    ruleVersion: 'rule:association:synthetic-v1',
    version: input.technicalVersion ?? 1,
  } satisfies GradeEntryV1;

  return { kind: 'grade-entry', value: gradeEntry };
}

function versioned<T>(value: T, version: number): VersionedRecordV1<T> {
  return {
    value,
    version,
    recordedAt: `2026-08-31T10:${String(version).padStart(2, '0')}:00Z`,
  };
}

function association(
  logicalSourceId: LogicalSourceIdV1,
  stream: AcademicRecordStreamV1,
  sourceManifestId: SourceFileManifestId,
  sourceManifestVersion: number,
): LogicalSourceRecordAssociationV1 {
  return {
    academicYearId,
    logicalSourceId,
    academicRecordStream: stream,
    stableKey: academicRecordStreamKeyV1(stream),
    state: 'active',
    sourceManifestId,
    sourceManifestVersion,
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
  private readonly associations = new Map<
    string,
    VersionedRecordV1<LogicalSourceRecordAssociationV1>
  >();

  readonly associationReadKeys: string[] = [];
  readonly logicalSourceReadIds: LogicalSourceIdV1[] = [];
  readonly academicReadKeys: string[] = [];
  writeCalls = 0;

  readonly imports = {
    findSourceFileByHash: async (
      _context: AcademicPersistenceContextV1,
      sha256: string,
    ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> =>
      this.sourceVersions.find((record) => record.value.manifest.sha256 === sha256) ??
      null,
    getSourceFileVersion: async (
      _context: AcademicPersistenceContextV1,
      manifestId: SourceFileManifestId,
    ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> =>
      [...this.sourceVersions]
        .reverse()
        .find((record) => record.value.manifest.id === manifestId) ?? null,
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
      return this.academicRecords.get(key) ?? null;
    },
    appendVersion: async (): Promise<never> => {
      this.writeCalls += 1;
      throw new Error('planning must not write academic versions');
    },
  };

  readonly logicalSourceRecords = {
    getCurrent: async (
      _context: AcademicPersistenceContextV1,
      stream: LogicalSourceRecordAssociationStreamV1,
    ): Promise<VersionedRecordV1<LogicalSourceRecordAssociationV1> | null> => {
      const key = `${stream.logicalSourceId}:${stream.stableKey}`;
      this.associationReadKeys.push(key);
      return this.associations.get(key) ?? null;
    },
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
    this.sourceVersions.push(versioned(value, version));
  }

  seedAcademicRecord(record: AcademicRecordV1, version: number): AcademicRecordStreamV1 {
    const stream = academicRecordStreamForV1(record);
    this.academicRecords.set(academicRecordStreamKeyV1(stream), versioned(record, version));
    return stream;
  }

  seedAssociation(
    logicalSourceId: LogicalSourceIdV1,
    stream: AcademicRecordStreamV1,
    value: LogicalSourceRecordAssociationV1,
    version: number,
  ): void {
    this.associations.set(
      `${logicalSourceId}:${academicRecordStreamKeyV1(stream)}`,
      versioned(value, version),
    );
  }

  setLogicalSourceStreams(
    logicalSourceId: LogicalSourceIdV1,
    streams: readonly AcademicRecordStreamV1[],
  ): void {
    this.streamsByLogicalSource.set(logicalSourceId, streams);
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

describe('idempotent import reconciliation with source associations v1', () => {
  it('plans source, academic and association versions only for new and changed records', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const incomingManifest = manifest({
      id: 'manifest:association:incremental',
      fileName: 'professor-atualizado.xlsx',
      sha256: 'hash-new-content',
    });
    adapter.seedSource(
      {
        manifest: {
          ...incomingManifest,
          fileName: 'professor-anterior.xlsx',
          sha256: 'hash-old-content',
        },
        logicalSource: { state: 'confirmed', logicalSourceId: logicalSourceA },
      },
      4,
    );

    const unchangedCurrent = gradeRecord({
      key: '11',
      value: 8,
      fileName: 'professor-anterior.xlsx',
      sha256: 'hash-old-content',
      technicalId: 'grade-entry:association:old:11',
    });
    const unchangedIncoming = gradeRecord({
      key: '11',
      value: 8,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:association:new:11',
      technicalVersion: 99,
    });
    const changedCurrent = gradeRecord({
      key: '12',
      value: 5,
      fileName: 'professor-anterior.xlsx',
      sha256: 'hash-old-content',
    });
    const changedIncoming = gradeRecord({
      key: '12',
      value: 6,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
      technicalId: 'grade-entry:association:new:12',
    });
    const newIncoming = gradeRecord({
      key: '13',
      value: 9,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
    });

    const unchangedStream = adapter.seedAcademicRecord(unchangedCurrent, 2);
    const changedStream = adapter.seedAcademicRecord(changedCurrent, 7);
    adapter.setLogicalSourceStreams(logicalSourceA, [changedStream, unchangedStream]);
    adapter.seedAssociation(
      logicalSourceA,
      changedStream,
      association(logicalSourceA, changedStream, incomingManifest.id, 4),
      3,
    );

    const importFile = approvedFile('import-file:association:incremental', incomingManifest);
    const plan = await planImportReconciliation(
      {
        context,
        batch: batch([importFile]),
        expectedBatchVersion: 6,
        files: [
          fileInput({
            importFileId: importFile.id,
            logicalSourceId: logicalSourceA,
            records: [newIncoming, changedIncoming, unchangedIncoming],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(plan.status).toBe('ready-for-promotion');
    expect(plan.counts).toEqual({
      unchanged: 1,
      new: 1,
      changed: 1,
      'missing-from-new-source': 0,
      blocked: 0,
    });
    expect(plan.estimatedWrites).toEqual({
      sourceFileVersions: 1,
      academicRecordVersions: 2,
      logicalSourceRecordAssociationVersions: 2,
      totalPlannedVersionWrites: 5,
      readyForPromotionVersionWrites: 5,
      pendingReviewVersionWrites: 0,
      exactCloudflareQuota: false,
      basis: 'planned-version-appends-only',
    });

    const writableItems = plan.items.filter(
      (item) => item.state === 'new' || item.state === 'changed',
    );
    expect(writableItems).toHaveLength(2);
    for (const item of writableItems) {
      if (item.state !== 'new' && item.state !== 'changed') continue;
      expect(item.associationWrite.kind).toBe('append-version');
      expect(item.associationWrite.value).toMatchObject({
        academicYearId,
        logicalSourceId: logicalSourceA,
        stableKey: item.stableKey,
        state: 'active',
        sourceManifestId: incomingManifest.id,
        sourceManifestVersion: 5,
      });
      expect(item.associationWrite.stream).toEqual(
        logicalSourceRecordAssociationStreamForV1(logicalSourceA, item.stream),
      );
    }

    const changedItem = plan.items.find((item) => item.state === 'changed');
    if (!changedItem || changedItem.state !== 'changed') {
      throw new Error('missing changed item');
    }
    expect(changedItem.associationWrite.expectedVersion).toBe(3);
    expect(changedItem.associationWrite.currentAssociation?.value.sourceManifestVersion).toBe(4);

    const newItem = plan.items.find((item) => item.state === 'new');
    if (!newItem || newItem.state !== 'new') throw new Error('missing new item');
    expect(newItem.associationWrite.expectedVersion).toBeNull();
    expect(newItem.associationWrite.currentAssociation).toBeNull();
    expect(adapter.writeCalls).toBe(0);
  });

  it('keeps identical and renamed hashes free of academic association versions', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const knownManifest = manifest({
      id: 'manifest:association:known',
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
    const incomingRecord = gradeRecord({
      key: '20',
      value: 8,
      fileName: knownManifest.fileName,
      sha256: knownManifest.sha256,
    });

    const sameFile = approvedFile(
      'import-file:association:same',
      { ...knownManifest, readAt: '2026-08-31T11:00:00Z' },
    );
    const samePlan = await planImportReconciliation(
      {
        context,
        batch: batch([sameFile]),
        expectedBatchVersion: 1,
        files: [
          fileInput({
            importFileId: sameFile.id,
            logicalSourceId: logicalSourceB,
            records: [incomingRecord],
          }),
        ],
      },
      adapter.repositories,
    );
    expect(samePlan.status).toBe('no-changes');
    expect(samePlan.estimatedWrites.logicalSourceRecordAssociationVersions).toBe(0);

    const renamedManifest = manifest({
      id: 'manifest:association:renamed',
      fileName: 'notas-professor-renomeado.xlsx',
      sha256: knownManifest.sha256,
    });
    const renamedFile = approvedFile('import-file:association:renamed', renamedManifest);
    const renamedPlan = await planImportReconciliation(
      {
        context,
        batch: batch([renamedFile]),
        expectedBatchVersion: 2,
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
      sourceFileVersions: 1,
      academicRecordVersions: 0,
      logicalSourceRecordAssociationVersions: 0,
      totalPlannedVersionWrites: 1,
    });
    expect(adapter.associationReadKeys).toEqual([]);
    expect(adapter.logicalSourceReadIds).toEqual([]);
  });

  it('never deactivates an association for a record missing from the new source', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const incomingManifest = manifest({
      id: 'manifest:association:missing',
      fileName: 'notas-atualizadas.xlsx',
      sha256: 'hash-missing-new',
    });
    adapter.seedSource(
      {
        manifest: { ...incomingManifest, sha256: 'hash-missing-old' },
        logicalSource: { state: 'confirmed', logicalSourceId: logicalSourceA },
      },
      1,
    );
    const missingRecord = gradeRecord({
      key: '30',
      value: 7,
      fileName: 'notas-anteriores.xlsx',
      sha256: 'hash-missing-old',
    });
    const missingStream = adapter.seedAcademicRecord(missingRecord, 2);
    adapter.setLogicalSourceStreams(logicalSourceA, [missingStream]);
    adapter.seedAssociation(
      logicalSourceA,
      missingStream,
      association(logicalSourceA, missingStream, incomingManifest.id, 1),
      2,
    );
    const importFile = approvedFile('import-file:association:missing', incomingManifest);

    const plan = await planImportReconciliation(
      {
        context,
        batch: batch([importFile]),
        expectedBatchVersion: 3,
        files: [
          fileInput({
            importFileId: importFile.id,
            logicalSourceId: logicalSourceA,
            records: [],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(plan.status).toBe('review-required');
    expect(plan.counts['missing-from-new-source']).toBe(1);
    expect(plan.estimatedWrites).toMatchObject({
      sourceFileVersions: 1,
      academicRecordVersions: 0,
      logicalSourceRecordAssociationVersions: 0,
      pendingReviewVersionWrites: 1,
    });
    expect(JSON.stringify(plan)).not.toContain('inactive');
    expect(adapter.associationReadKeys).toEqual([]);
  });

  it('plans no association for an ambiguous logical source', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const sourceManifest = manifest({
      id: 'manifest:association:ambiguous',
      fileName: 'notas-ambiguas.xlsx',
      sha256: 'hash-ambiguous',
    });
    const importFile = approvedFile('import-file:association:ambiguous', sourceManifest);

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
                key: '40',
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
    expect(plan.estimatedWrites.totalPlannedVersionWrites).toBe(0);
    expect(plan.estimatedWrites.logicalSourceRecordAssociationVersions).toBe(0);
    expect(adapter.logicalSourceReadIds).toEqual([]);
    expect(adapter.associationReadKeys).toEqual([]);
  });

  it('blocks a file when the association repository returns an incompatible stream', async () => {
    const adapter = new SyntheticReconciliationAdapter();
    const incomingManifest = manifest({
      id: 'manifest:association:broken',
      fileName: 'notas-broken.xlsx',
      sha256: 'hash-broken-new',
    });
    adapter.seedSource(
      {
        manifest: { ...incomingManifest, sha256: 'hash-broken-old' },
        logicalSource: { state: 'confirmed', logicalSourceId: logicalSourceA },
      },
      1,
    );
    const current = gradeRecord({
      key: '50',
      value: 5,
      fileName: 'notas-old.xlsx',
      sha256: 'hash-broken-old',
    });
    const incoming = gradeRecord({
      key: '50',
      value: 6,
      fileName: incomingManifest.fileName,
      sha256: incomingManifest.sha256,
    });
    const stream = adapter.seedAcademicRecord(current, 1);
    adapter.setLogicalSourceStreams(logicalSourceA, [stream]);
    adapter.seedAssociation(
      logicalSourceA,
      stream,
      {
        ...association(logicalSourceA, stream, incomingManifest.id, 1),
        logicalSourceId: logicalSourceB,
      },
      1,
    );
    const importFile = approvedFile('import-file:association:broken', incomingManifest);

    const plan = await planImportReconciliation(
      {
        context,
        batch: batch([importFile]),
        expectedBatchVersion: 1,
        files: [
          fileInput({
            importFileId: importFile.id,
            logicalSourceId: logicalSourceA,
            records: [incoming],
          }),
        ],
      },
      adapter.repositories,
    );

    expect(plan.status).toBe('blocked');
    expect(plan.files[0]?.reasons[0]?.code).toBe('persisted-association-mismatch');
    expect(plan.estimatedWrites.totalPlannedVersionWrites).toBe(0);
  });

  it('remains deterministic and provider-independent during planning', () => {
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
