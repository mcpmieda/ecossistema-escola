import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { SourceFileManifestId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { AssessmentComponentId } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import { MemoryPersistenceAdapter } from './memory-persistence-adapter';

const academicYearId = 'academic-year:association:2026' as AcademicYearId;
const otherAcademicYearId = 'academic-year:association:2027' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const otherContext = {
  academicYearId: otherAcademicYearId,
} satisfies AcademicPersistenceContextV1;
const logicalSourceId = 'logical-source:association:ports' as LogicalSourceIdV1;
const sourceManifestId = 'manifest:association:ports' as SourceFileManifestId;
const stream = {
  kind: 'grade-entry',
  studentId: 'student:association:ports' as StudentId,
  enrollmentId: 'enrollment:association:ports' as EnrollmentId,
  assessmentComponentId:
    'assessment:association:ports' as AssessmentComponentId,
} satisfies AcademicRecordStreamV1;
const associationStream = logicalSourceRecordAssociationStreamForV1(
  logicalSourceId,
  stream,
);

function association(
  state: LogicalSourceRecordAssociationV1['state'],
  sourceManifestVersion: number,
): LogicalSourceRecordAssociationV1 {
  return {
    academicYearId,
    logicalSourceId,
    academicRecordStream: stream,
    stableKey: academicRecordStreamKeyV1(stream),
    state,
    sourceManifestId,
    sourceManifestVersion,
  };
}

describe('logical source record association persistence port v1', () => {
  it('versions active and inactive states with explicit optimistic expectations', async () => {
    const adapter = new MemoryPersistenceAdapter();

    const first = await adapter.unitOfWork.logicalSourceRecords.appendVersion(
      context,
      associationStream,
      association('active', 1),
      { expectedVersion: null },
    );
    expect(first.status).toBe('written');
    expect(
      await adapter.unitOfWork.logicalSourceRecords.listCurrentStreams(
        context,
        logicalSourceId,
      ),
    ).toEqual([stream]);

    const second = await adapter.unitOfWork.logicalSourceRecords.appendVersion(
      context,
      associationStream,
      association('inactive', 2),
      { expectedVersion: 1 },
    );
    expect(second.status).toBe('written');
    expect(
      await adapter.unitOfWork.logicalSourceRecords.listCurrentStreams(
        context,
        logicalSourceId,
      ),
    ).toEqual([]);

    const stale = await adapter.unitOfWork.logicalSourceRecords.appendVersion(
      context,
      associationStream,
      association('active', 3),
      { expectedVersion: 1 },
    );
    expect(stale).toEqual({ status: 'version-conflict', currentVersion: 2 });

    const history = await adapter.unitOfWork.logicalSourceRecords.listVersions(
      context,
      associationStream,
      { limit: 10 },
    );
    expect(history.items.map(({ version }) => version)).toEqual([1, 2]);
    expect(history.items.map(({ value }) => value.state)).toEqual([
      'active',
      'inactive',
    ]);
    expect(
      await adapter.unitOfWork.logicalSourceRecords.getCurrent(
        otherContext,
        associationStream,
      ),
    ).toBeNull();
  });

  it('rolls association versions back with the same promotion unit of work', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const importBatchId = 'import-batch:association:rollback' as never;
    const importFileId = 'import-file:association:rollback' as never;
    const batch = {
      id: importBatchId,
      status: 'approved',
      files: [
        {
          id: importFileId,
          sourceFile: {
            fileName: 'synthetic.xlsx',
            extension: 'xlsx',
            reportedMimeType: null,
            sizeBytes: 1,
            lastModifiedAt: null,
          },
          manifest: null,
          status: 'approved',
          diagnosticIds: [],
        },
      ],
      diagnostics: [],
      receivedAt: '2026-08-31T10:00:00Z',
      updatedAt: '2026-08-31T10:00:00Z',
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
    } as never;
    await adapter.unitOfWork.imports.appendImportBatchVersion(context, batch, {
      expectedVersion: null,
    });

    await expect(
      adapter.runBatchPromotion(
        context,
        {
          importBatchId,
          approvedImportFileIds: [importFileId],
          expectedBatchVersion: 1,
        },
        async (unitOfWork) => {
          const result = await unitOfWork.logicalSourceRecords.appendVersion(
            context,
            associationStream,
            association('active', 1),
            { expectedVersion: null },
          );
          expect(result.status).toBe('written');
          throw new Error('synthetic association rollback');
        },
      ),
    ).rejects.toThrow('synthetic association rollback');

    expect(
      await adapter.unitOfWork.logicalSourceRecords.getCurrent(
        context,
        associationStream,
      ),
    ).toBeNull();
  });

  it('keeps the public contract independent of D1, SQL and Cloudflare APIs', () => {
    const source = readFileSync(
      'src/gradebook-domain/ports/persistence/persistence-ports-v1.ts',
      'utf8',
    );

    expect(source).toContain('LogicalSourceRecordAssociationV1');
    expect(source).toContain('LogicalSourceRecordAssociationStreamV1');
    expect(source).toContain('LogicalSourceRecordRepositoryV1');
    expect(source).not.toContain('D1Database');
    expect(source).not.toContain('@cloudflare');
    expect(source).not.toContain('wrangler');
    expect(source).not.toContain('SELECT ');
  });
});
