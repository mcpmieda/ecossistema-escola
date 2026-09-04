import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AssessmentComponentId,
  GradeEntryId,
  GradeEntryV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  planAssessmentImportReconciliationV2,
  type AssessmentImportReconciliationRepositoriesV2,
} from '../../../server/gradebook/application/import/assessment-import-reconciliation-v2';
import {
  academicRecordStreamKeyV1,
  type ImportReconciliationRepositoriesV1,
} from '../../../server/gradebook/application/import/import-reconciliation-v1';
import { createGradebookD1ImportPlanningBulkReadAdapterV1 } from '../../../server/gradebook/persistence/d1/read/d1-import-planning-bulk-read-v1';
import type { D1ReadDatabaseV1 } from '../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import type {
  AcademicEntityReferenceV1,
  AcademicRecordStreamV1,
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationStreamV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { openMigratedDatabase } from '../persistence/d1-transaction/d1-write-test-support';

const academicYearId = 'academic-year:bulk-planning:2026' as AcademicYearId;
const logicalSourceId = 'logical-source:bulk-planning:001' as LogicalSourceIdV1;
const teachingAssignmentId = 'teaching-assignment:bulk-planning:001' as TeachingAssignmentId;
const manifestId = 'source-file-manifest:bulk-planning:001' as SourceFileManifestId;
const importFileId = 'import-file:bulk-planning:001' as ImportFileId;
const importBatchId = 'import-batch:bulk-planning:001' as ImportBatchId;

function manifest(): SourceFileManifestV1 {
  return {
    id: manifestId,
    fileName: 'fixture-escala-sintetica.xlsb',
    extension: 'xlsb',
    reportedMimeType: null,
    sizeBytes: 2_000_000,
    lastModifiedAt: null,
    sha256: 'd'.repeat(64),
    sourceContractVersion: 2,
    parserVersion: 'synthetic-scale-v1',
    readAt: '2026-09-04T18:00:00.000Z',
    confirmedAcademicYearId: academicYearId,
  };
}

function batch(): ImportBatchResultV1 {
  const source = manifest();
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
        sourceFile: {
          fileName: source.fileName,
          extension: source.extension,
          reportedMimeType: source.reportedMimeType,
          sizeBytes: source.sizeBytes,
          lastModifiedAt: source.lastModifiedAt,
        },
        manifest: source,
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    receivedAt: source.readAt,
    updatedAt: source.readAt,
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
  };
}

function gradeEntry(index: number): GradeEntryV1 {
  const studentId = `student:bulk-planning:${index}` as StudentId;
  const enrollmentId = `enrollment:bulk-planning:${index}` as EnrollmentId;
  const componentId = `assessment-component:v2:bulk-planning:${index}` as AssessmentComponentId;
  const value = (index % 100) + 1;
  return {
    id: `grade-entry:v2:bulk-planning:${index}` as GradeEntryId,
    academicYearId,
    studentId,
    enrollmentId,
    assessmentComponentId: componentId,
    value: {
      imported: {
        value: { state: 'numeric', value },
        evidence: [
          {
            classification: 'manual-positive-number',
            rawValue: value,
            provenance: {
              fileName: 'fixture-escala-sintetica.xlsb',
              fileSha256: 'd'.repeat(64),
              sheetName: 'SINTETICA1ºD1',
              cellAddress: `R${index + 5}`,
            },
          },
        ],
      },
      calculated: { value: { state: 'numeric', value } },
    },
    authorityMode: 'imported-source',
    ruleVersion: 'synthetic-scale-v1',
    version: 1,
  };
}

describe('Import planning bulk reads at pilot scale', () => {
  it('resolves pilot-scale D1 lookup sets with one query per bulk family', async () => {
    const database = await openMigratedDatabase();
    let queries = 0;
    const counted: D1ReadDatabaseV1 = {
      prepare(query) {
        queries += 1;
        return database.prepare(query);
      },
    };
    const bulk = createGradebookD1ImportPlanningBulkReadAdapterV1(counted);
    const context = { academicYearId };
    const componentReferences = Array.from(
      { length: 468 },
      (_, index): AcademicEntityReferenceV1 => ({
        kind: 'assessment-component',
        id: `assessment-component:v2:scale:${index}` as AssessmentComponentId,
      }),
    );
    const streams = Array.from(
      { length: 5_399 },
      (_, index): AcademicRecordStreamV1 => ({
        kind: 'annual-result',
        studentId: `student:scale:${index}` as StudentId,
        enrollmentId: `enrollment:scale:${index}` as EnrollmentId,
        teachingAssignmentId,
      }),
    );
    const associations = streams.map(
      (stream): LogicalSourceRecordAssociationStreamV1 => ({
        logicalSourceId,
        academicRecordStream: stream,
        stableKey: academicRecordStreamKeyV1(stream),
      }),
    );

    try {
      const components = await bulk.entities.getMany(context, componentReferences);
      const records = await bulk.academicRecords.getCurrentMany(context, streams);
      const currentAssociations = await bulk.logicalSourceRecords.getCurrentMany(
        context,
        associations,
      );

      expect(components).toHaveLength(468);
      expect(records).toHaveLength(5_399);
      expect(currentAssociations).toHaveLength(5_399);
      expect(components.every((value) => value === null)).toBe(true);
      expect(records.every((value) => value === null)).toBe(true);
      expect(currentAssociations.every((value) => value === null)).toBe(true);
      expect(queries).toBe(3);
    } finally {
      database.raw.close();
    }
  });

  it('plans thousands of incoming academic streams without unit record or association reads', async () => {
    const records = Array.from({ length: 5_399 }, (_, index) => gradeEntry(index));
    const activity = {
      recordBulkCalls: 0,
      recordBulkItems: 0,
      associationBulkCalls: 0,
      associationBulkItems: 0,
      unitRecordCalls: 0,
      unitAssociationCalls: 0,
    };
    const repositories: AssessmentImportReconciliationRepositoriesV2 = {
      entities: {
        async get() {
          return null;
        },
      },
      imports: {
        async findSourceFileByHash() {
          return null;
        },
        async getSourceFileVersion() {
          return null;
        },
      },
      academicRecords: {
        async getCurrent() {
          activity.unitRecordCalls += 1;
          throw new Error('unit-record-read-must-not-run');
        },
        async getCurrentMany(_context, streams) {
          activity.recordBulkCalls += 1;
          activity.recordBulkItems += streams.length;
          return streams.map(() => null);
        },
      },
      logicalSourceRecords: {
        async listCurrentStreams() {
          return [];
        },
        async getCurrent() {
          activity.unitAssociationCalls += 1;
          throw new Error('unit-association-read-must-not-run');
        },
        async getCurrentMany(_context, streams) {
          activity.associationBulkCalls += 1;
          activity.associationBulkItems += streams.length;
          return streams.map(() => null);
        },
      },
    } satisfies AssessmentImportReconciliationRepositoriesV2;

    const result = await planAssessmentImportReconciliationV2(
      {
        context: { academicYearId },
        batch: batch(),
        expectedBatchVersion: 1,
        files: [
          {
            importFileId,
            logicalSource: { state: 'confirmed', logicalSourceId },
            materialization: {
              components: [],
              gradeEntries: records,
              blockedDefinitions: [],
            },
          },
        ],
      },
      repositories,
    );

    expect(result.status).toBe('ready-for-promotion');
    expect(result.counts).toMatchObject({ new: 5_399, blocked: 0 });
    expect(activity).toEqual({
      recordBulkCalls: 1,
      recordBulkItems: 5_399,
      associationBulkCalls: 1,
      associationBulkItems: 5_399,
      unitRecordCalls: 0,
      unitAssociationCalls: 0,
    });
  });
});
