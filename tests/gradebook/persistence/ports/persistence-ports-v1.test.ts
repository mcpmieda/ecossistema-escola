import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  StudentV1,
  TeacherId,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  GradeEntryId,
  GradeEntryV1,
  AssessmentComponentId,
  ComparedGradeValueV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AuditOccurrenceId,
  AuditOccurrenceV1,
  ReconciliationResultId,
  ReconciliationResultV1,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { SourceCellEvidenceV1 } from '../../../../shared/gradebook-contracts/source/source-contract-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  LogicalSourceIdV1,
  SourceFileVersionV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { MemoryPersistenceAdapter } from './memory-persistence-adapter';

const academicYearId = 'academic-year:2026' as AcademicYearId;
const otherAcademicYearId = 'academic-year:2027' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const otherContext = { academicYearId: otherAcademicYearId } satisfies AcademicPersistenceContextV1;
const studentId = 'student:synthetic:001' as StudentId;
const enrollmentId = 'enrollment:2026:synthetic:001' as EnrollmentId;
const assessmentComponentId = 'assessment:2026:synthetic:001' as AssessmentComponentId;
const gradeEntryId = 'grade-entry:synthetic:001' as GradeEntryId;
const approvedFileId = 'import-file:approved' as ImportFileId;
const failedFileId = 'import-file:failed' as ImportFileId;
const batchId = 'import-batch:synthetic' as ImportBatchId;

const evidence = {
  classification: 'manual-positive-number',
  rawValue: 8,
  provenance: {
    fileName: 'synthetic.xlsx',
    fileSha256: 'hash-synthetic-a',
    sheetName: '6A1º',
    cellAddress: 'R10',
  },
} satisfies SourceCellEvidenceV1;

const comparedValue = {
  imported: {
    value: { state: 'numeric', value: 8 },
    evidence: [evidence],
  },
  calculated: {
    value: { state: 'numeric', value: 8 },
  },
} satisfies ComparedGradeValueV1;

function manifest(input: {
  id: string;
  fileName: string;
  sha256: string;
  readAt: string;
}): SourceFileManifestV1 {
  return {
    id: input.id as SourceFileManifestId,
    fileName: input.fileName,
    extension: 'xlsx',
    reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 1024,
    lastModifiedAt: '2026-08-31T10:00:00Z',
    sha256: input.sha256,
    sourceContractVersion: 1,
    parserVersion: 'synthetic-parser-v1',
    readAt: input.readAt,
    confirmedAcademicYearId: academicYearId,
    confirmedTeacherId: 'teacher:synthetic:001' as TeacherId,
  };
}

const manifestA = manifest({
  id: 'manifest:a',
  fileName: 'notas-professor.xlsx',
  sha256: 'hash-content-a',
  readAt: '2026-08-31T10:00:00Z',
});

const manifestB = manifest({
  id: 'manifest:b',
  fileName: 'notas-professor-revisado.xlsx',
  sha256: 'hash-content-b',
  readAt: '2026-08-31T11:00:00Z',
});

function mixedBatch(): ImportBatchResultV1 {
  return {
    id: batchId,
    status: 'partially-approved',
    receivedAt: '2026-08-31T10:00:00Z',
    updatedAt: '2026-08-31T10:10:00Z',
    files: [
      {
        id: approvedFileId,
        sourceFile: {
          fileName: manifestA.fileName,
          extension: 'xlsx',
          reportedMimeType: manifestA.reportedMimeType,
          sizeBytes: manifestA.sizeBytes,
          lastModifiedAt: manifestA.lastModifiedAt,
        },
        manifest: manifestA,
        status: 'approved',
        diagnosticIds: [],
      },
      {
        id: failedFileId,
        sourceFile: {
          fileName: 'arquivo-invalido.xlsx',
          extension: 'xlsx',
          reportedMimeType: null,
          sizeBytes: 128,
          lastModifiedAt: null,
        },
        manifest: null,
        status: 'failed',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    summary: {
      totalFileCount: 2,
      processedFileCount: 2,
      approvedFileCount: 1,
      reviewRequiredFileCount: 0,
      rejectedFileCount: 0,
      failedFileCount: 1,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 1,
      criticalErrorCount: 0,
    },
  };
}

function gradeEntry(version: number, id = gradeEntryId): GradeEntryV1 {
  return {
    id,
    academicYearId,
    studentId,
    enrollmentId,
    assessmentComponentId,
    value: comparedValue,
    authorityMode: 'imported-source',
    ruleVersion: 'rule:synthetic-v1',
    version,
  };
}

const gradeStream = {
  kind: 'grade-entry',
  studentId,
  enrollmentId,
  assessmentComponentId,
} satisfies AcademicRecordStreamV1;

describe('persistence ports v1', () => {
  it('keeps ports provider-independent and requires paged academic context in the memory adapter', async () => {
    const portSource = readFileSync(
      new URL(
        '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(portSource).not.toContain('D1Database');
    expect(portSource).not.toContain('@cloudflare');
    expect(portSource).not.toContain('wrangler');
    expect(portSource).not.toContain('SQL');

    const adapter = new MemoryPersistenceAdapter();
    for (const [index, name] of ['Aluno Sintético A', 'Aluno Sintético B', 'Aluno Sintético C'].entries()) {
      const student = {
        id: `student:synthetic:${index + 10}` as StudentId,
        displayName: name,
        sourceNames: [name],
      } satisfies StudentV1;
      const result = await adapter.unitOfWork.entities.appendVersion(
        context,
        { kind: 'student', value: student },
        { expectedVersion: null },
      );
      expect(result.status).toBe('written');
    }

    const firstPage = await adapter.unitOfWork.entities.list(context, 'student', { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBe('2');

    const secondPage = await adapter.unitOfWork.entities.list(context, 'student', {
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();

    const otherYear = await adapter.unitOfWork.entities.list(otherContext, 'student', { limit: 2 });
    expect(otherYear.items).toEqual([]);
  });

  it('locates identical content by hash and represents confirmed versus ambiguous logical source relations', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const logicalSourceId = 'logical-source:teacher:2026:math' as LogicalSourceIdV1;
    const otherLogicalSourceId = 'logical-source:teacher:2026:science' as LogicalSourceIdV1;

    const firstVersion = {
      manifest: manifestA,
      logicalSource: { state: 'confirmed', logicalSourceId },
    } satisfies SourceFileVersionV1;
    const secondVersion = {
      manifest: manifestB,
      logicalSource: { state: 'confirmed', logicalSourceId },
    } satisfies SourceFileVersionV1;
    const ambiguousManifest = manifest({
      id: 'manifest:ambiguous',
      fileName: 'arquivo-renomeado.xlsx',
      sha256: 'hash-content-c',
      readAt: '2026-08-31T12:00:00Z',
    });
    const ambiguousVersion = {
      manifest: ambiguousManifest,
      logicalSource: {
        state: 'candidate',
        candidateLogicalSourceIds: [logicalSourceId, otherLogicalSourceId],
      },
    } satisfies SourceFileVersionV1;

    await adapter.unitOfWork.imports.appendSourceFileVersion(context, firstVersion, {
      expectedVersion: null,
    });
    await adapter.unitOfWork.imports.appendSourceFileVersion(context, secondVersion, {
      expectedVersion: null,
    });
    await adapter.unitOfWork.imports.appendSourceFileVersion(context, ambiguousVersion, {
      expectedVersion: null,
    });

    const byHash = await adapter.unitOfWork.imports.findSourceFileByHash(
      context,
      manifestA.sha256,
    );
    expect(byHash?.value.manifest.id).toBe(manifestA.id);
    expect(byHash?.value.manifest.fileName).toBe('notas-professor.xlsx');

    const logicalVersions = await adapter.unitOfWork.imports.listLogicalSourceVersions(
      context,
      logicalSourceId,
      { limit: 10 },
    );
    expect(logicalVersions.items.map(({ value }) => value.manifest.id)).toEqual([
      manifestA.id,
      manifestB.id,
    ]);

    const ambiguous = await adapter.unitOfWork.imports.getSourceFileVersion(
      context,
      ambiguousManifest.id,
    );
    expect(ambiguous?.value.logicalSource.state).toBe('candidate');
  });

  it('promotes only approved files atomically and rolls back all staged writes on failure', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const storedBatch = await adapter.unitOfWork.imports.appendImportBatchVersion(
      context,
      mixedBatch(),
      { expectedVersion: null },
    );
    expect(storedBatch.status).toBe('written');

    await expect(
      adapter.runBatchPromotion(
        context,
        {
          importBatchId: batchId,
          approvedImportFileIds: [approvedFileId],
          expectedBatchVersion: 1,
        },
        async (unitOfWork) => {
          const write = await unitOfWork.academicRecords.appendVersion(
            context,
            gradeStream,
            { kind: 'grade-entry', value: gradeEntry(1) },
            { expectedVersion: null },
          );
          expect(write.status).toBe('written');
          throw new Error('synthetic promotion failure');
        },
      ),
    ).rejects.toThrow('synthetic promotion failure');

    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, gradeStream)).toBeNull();

    await adapter.runBatchPromotion(
      context,
      {
        importBatchId: batchId,
        approvedImportFileIds: [approvedFileId],
        expectedBatchVersion: 1,
      },
      async (unitOfWork) => {
        return unitOfWork.academicRecords.appendVersion(
          context,
          gradeStream,
          { kind: 'grade-entry', value: gradeEntry(1) },
          { expectedVersion: null },
        );
      },
    );

    expect((await adapter.unitOfWork.academicRecords.getCurrent(context, gradeStream))?.version).toBe(
      1,
    );

    await expect(
      adapter.runBatchPromotion(
        context,
        {
          importBatchId: batchId,
          approvedImportFileIds: [failedFileId],
          expectedBatchVersion: 1,
        },
        async () => undefined,
      ),
    ).rejects.toThrow('not approved');
  });

  it('creates immutable academic record versions and rejects stale optimistic writes', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const first = await adapter.unitOfWork.academicRecords.appendVersion(
      context,
      gradeStream,
      { kind: 'grade-entry', value: gradeEntry(1) },
      { expectedVersion: null },
    );
    expect(first.status).toBe('written');

    const secondEntry = gradeEntry(2, 'grade-entry:synthetic:002' as GradeEntryId);
    const second = await adapter.unitOfWork.academicRecords.appendVersion(
      context,
      gradeStream,
      { kind: 'grade-entry', value: secondEntry },
      { expectedVersion: 1 },
    );
    expect(second.status).toBe('written');

    const stale = await adapter.unitOfWork.academicRecords.appendVersion(
      context,
      gradeStream,
      { kind: 'grade-entry', value: gradeEntry(3, 'grade-entry:synthetic:003' as GradeEntryId) },
      { expectedVersion: 1 },
    );
    expect(stale).toEqual({ status: 'version-conflict', currentVersion: 2 });

    const history = await adapter.unitOfWork.academicRecords.listVersions(context, gradeStream, {
      limit: 10,
    });
    expect(history.items).toHaveLength(2);
    expect(history.items.map(({ version }) => version)).toEqual([1, 2]);
    expect(history.items.map(({ value }) => value.value.id)).toEqual([
      gradeEntryId,
      secondEntry.id,
    ]);
  });

  it('preserves occurrence state history and reconciliation versions behind the same annual context', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const occurrenceId = 'audit-occurrence:synthetic:001' as AuditOccurrenceId;
    const occurrenceStream = { kind: 'occurrence', id: occurrenceId } as const;
    const opened = {
      id: occurrenceId,
      severity: 'warning',
      category: 'synthetic-check',
      message: 'Ocorrência sintética',
      createdAt: '2026-08-31T10:00:00Z',
      state: 'open',
      stateHistory: [],
    } satisfies AuditOccurrenceV1;
    const resolved = {
      ...opened,
      state: 'resolved',
      stateHistory: [
        {
          previousState: 'open',
          nextState: 'resolved',
          actorId: 'user:synthetic',
          occurredAt: '2026-08-31T10:05:00Z',
          justification: 'Conferência sintética concluída',
        },
      ],
    } satisfies AuditOccurrenceV1;

    await adapter.unitOfWork.audit.appendVersion(
      context,
      occurrenceStream,
      { kind: 'occurrence', value: opened },
      { expectedVersion: null },
    );
    await adapter.unitOfWork.audit.appendVersion(
      context,
      occurrenceStream,
      { kind: 'occurrence', value: resolved },
      { expectedVersion: 1 },
    );

    const occurrenceHistory = await adapter.unitOfWork.audit.listVersions(
      context,
      occurrenceStream,
      { limit: 10 },
    );
    expect(
      occurrenceHistory.items.map(({ value }) =>
        value.kind === 'occurrence' ? value.value.state : 'unexpected',
      ),
    ).toEqual(['open', 'resolved']);
    expect(resolved.stateHistory.at(-1)?.previousState).toBe('open');

    const reconciliationId = 'reconciliation:synthetic:001' as ReconciliationResultId;
    const reconciliation = {
      id: reconciliationId,
      target: { kind: 'grade-entry', id: gradeEntryId },
      value: comparedValue,
      ruleVersion: 'rule:synthetic-v1',
      status: 'match',
      difference: 0,
      tolerance: 0,
    } satisfies ReconciliationResultV1;
    const reconciliationStream = { kind: 'reconciliation', id: reconciliationId } as const;

    const write = await adapter.unitOfWork.audit.appendVersion(
      context,
      reconciliationStream,
      { kind: 'reconciliation', value: reconciliation },
      { expectedVersion: null },
    );
    expect(write.status).toBe('written');
    expect((await adapter.unitOfWork.audit.getCurrent(context, reconciliationStream))?.value).toEqual({
      kind: 'reconciliation',
      value: reconciliation,
    });
  });

  it('keeps every public collection query bounded by an explicit page limit', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const classGroupId = 'class:2026:6A' as ClassGroupId;
    expect(classGroupId).toBeTruthy();

    await expect(adapter.unitOfWork.entities.list(context, 'student', { limit: 0 })).rejects.toThrow(
      'positive integer',
    );
    await expect(
      adapter.unitOfWork.imports.listLogicalSourceVersions(
        context,
        'logical-source:none' as LogicalSourceIdV1,
        { limit: 0 },
      ),
    ).rejects.toThrow('positive integer');
    await expect(
      adapter.unitOfWork.academicRecords.listVersions(context, gradeStream, { limit: 0 }),
    ).rejects.toThrow('positive integer');
  });
});
