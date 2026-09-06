import { describe, expect, it } from 'vitest';
import type { AcademicYearId, TeacherId } from '../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import { createImportBootstrapEnvelopeV2 } from '../../../server/gradebook/application/import/import-bootstrap-v2';
import type { ImportChangePlanV1 } from '../../../server/gradebook/application/import/import-reconciliation-v1';
import type { LogicalSourceResolutionResultV2 } from '../../../server/gradebook/application/import/logical-source-resolution-v2';
import type { LogicalSourceIdV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

const academicYearId = 'academic-year:bootstrap-evidence:2026' as AcademicYearId;
const teacherId = 'teacher:bootstrap-evidence:001' as TeacherId;
const logicalSourceId = 'logical-source:bootstrap-evidence:001' as LogicalSourceIdV1;
const importBatchId = 'import-batch:bootstrap-evidence:001' as ImportBatchId;
const importFileId = 'import-file:bootstrap-evidence:001' as ImportFileId;
const manifestId = 'manifest:bootstrap-evidence:001' as SourceFileManifestId;

function manifest(id = manifestId) {
  return {
    id,
    fileName: 'synthetic.xlsx',
    extension: 'xlsx' as const,
    reportedMimeType: null,
    sizeBytes: 64,
    lastModifiedAt: null,
    sha256: 'a'.repeat(64),
    sourceContractVersion: 2,
    parserVersion: 'synthetic-v2',
    readAt: '2026-09-05T20:00:00.000Z',
    confirmedAcademicYearId: academicYearId,
    confirmedTeacherId: teacherId,
  };
}

function batch(id = manifestId): ImportBatchResultV1 {
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
        sourceFile: {
          fileName: 'synthetic.xlsx',
          extension: 'xlsx',
          reportedMimeType: null,
          sizeBytes: 64,
          lastModifiedAt: null,
        },
        manifest: manifest(id),
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    summary: {
      totalFileCount: 1,
      processedFileCount: 1,
      approvedFileCount: 1,
      reviewRequiredFileCount: 0,
      rejectedFileCount: 0,
      failedFileCount: 0,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 0,
      criticalErrorCount: 0,
    },
    receivedAt: '2026-09-05T20:00:00.000Z',
    updatedAt: '2026-09-05T20:00:00.000Z',
  };
}

function resolution(): LogicalSourceResolutionResultV2 {
  const source = {
    id: logicalSourceId,
    academicYearId,
    teacherId,
    sourceContext: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
    createdAt: '2026-09-05T20:00:00.000Z',
  };
  return {
    status: 'existing-source',
    source,
    context: {
      kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
      academicYearId,
      teacherId,
    },
  };
}

function plan(file: Record<string, unknown>, status: ImportChangePlanV1['status']): ImportChangePlanV1 {
  return {
    importBatchId,
    academicYearId,
    expectedBatchVersion: 1,
    status,
    files: [file],
    promotionRequest: {
      importBatchId,
      expectedBatchVersion: 1,
      approvedImportFileIds: [importFileId],
    },
  } as unknown as ImportChangePlanV1;
}

describe('bootstrap manifest version evidence V2', () => {
  it('reuses the known manifest version for an idempotent source', () => {
    const envelope = createImportBootstrapEnvelopeV2({
      resolution: resolution(),
      batch: batch(),
      plan: plan(
        {
          importFileId,
          logicalSource: { state: 'confirmed', logicalSourceId },
          contentIdentity: {
            state: 'known-identical',
            knownManifestId: manifestId,
            knownManifestVersion: 7,
            observedFileNameChanged: false,
          },
          sourceFileWrite: { kind: 'none' },
        },
        'no-changes',
      ),
    });

    expect(envelope).toMatchObject({
      status: 'ready',
      request: {
        plannedSourceFileManifestIds: [],
        sourceManifestVersions: [{ manifestId, version: 7 }],
      },
    });
  });

  it('derives the next manifest version from the planned append CAS', () => {
    const envelope = createImportBootstrapEnvelopeV2({
      resolution: resolution(),
      batch: batch(),
      plan: plan(
        {
          importFileId,
          logicalSource: { state: 'confirmed', logicalSourceId },
          contentIdentity: { state: 'new-content' },
          sourceFileWrite: {
            kind: 'append-version',
            expectedVersion: 2,
            value: {
              manifest: manifest(),
              logicalSource: { state: 'confirmed', logicalSourceId },
            },
          },
        },
        'ready-for-promotion',
      ),
    });

    expect(envelope).toMatchObject({
      status: 'ready',
      request: {
        plannedSourceFileManifestIds: [manifestId],
        sourceManifestVersions: [{ manifestId, version: 3 }],
      },
    });
  });

  it('fails closed when known manifest evidence does not match the batch manifest', () => {
    const otherManifestId = 'manifest:bootstrap-evidence:other' as SourceFileManifestId;
    const envelope = createImportBootstrapEnvelopeV2({
      resolution: resolution(),
      batch: batch(),
      plan: plan(
        {
          importFileId,
          logicalSource: { state: 'confirmed', logicalSourceId },
          contentIdentity: {
            state: 'known-identical',
            knownManifestId: otherManifestId,
            knownManifestVersion: 7,
            observedFileNameChanged: false,
          },
          sourceFileWrite: { kind: 'none' },
        },
        'no-changes',
      ),
    });

    expect(envelope).toEqual({ status: 'review-required', reason: 'invalid-bootstrap-plan' });
  });
});
