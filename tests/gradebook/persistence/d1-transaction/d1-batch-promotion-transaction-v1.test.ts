import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type { ImportFileId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { AssessmentComponentId } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import { executeImportChangePlan } from '../../../../server/gradebook/application/import/execution/execute-import-change-plan-v1';
import {
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
  planImportReconciliation,
  type ImportChangePlanV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import {
  GradebookD1BatchPromotionTransactionV1,
  GradebookD1TransactionErrorV1,
} from '../../../../server/gradebook/persistence/d1/transaction/d1-batch-promotion-transaction-v1';
import { createGradebookD1WriteUnitOfWorkV1 } from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type {
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceRecordAssociationV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicYearId,
  context,
  gradeRecord,
  gradeStream,
  importBatchId,
  importFileId,
  instant,
  logicalSourceId,
  openMigratedDatabase,
  seedBatch,
  seedContext,
  sourceFileVersion,
  type SqliteD1Database,
} from './d1-write-test-support';

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  seedContext(database);
  seedBatch(database);
});

afterEach(() => {
  database.raw.close();
});

function approvedBatch(
  source = sourceFileVersion(),
  id: ImportFileId = importFileId,
): ImportBatchResultV1 {
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id,
        sourceFile: {
          fileName: source.manifest.fileName,
          extension: source.manifest.extension,
          reportedMimeType: source.manifest.reportedMimeType,
          sizeBytes: source.manifest.sizeBytes,
          lastModifiedAt: source.manifest.lastModifiedAt,
        },
        manifest: source.manifest,
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    receivedAt: instant,
    updatedAt: instant,
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

async function planFor(
  source: ReturnType<typeof sourceFileVersion>,
  records: readonly AcademicRecordV1[],
): Promise<ImportChangePlanV1> {
  const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
  return planImportReconciliation(
    {
      context,
      batch: approvedBatch(source),
      expectedBatchVersion: 1,
      files: [
        {
          importFileId,
          logicalSource: { state: 'confirmed', logicalSourceId },
          records,
        },
      ],
    },
    unit,
  );
}

function transaction(): GradebookD1BatchPromotionTransactionV1 {
  return new GradebookD1BatchPromotionTransactionV1(database, { now: () => instant });
}

function tableCount(table: string): number {
  const row = database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return row.count;
}

function association(
  source: ReturnType<typeof sourceFileVersion>,
  sourceManifestVersion: number,
  stream: AcademicRecordStreamV1 = gradeStream,
): LogicalSourceRecordAssociationV1 {
  return {
    academicYearId,
    logicalSourceId,
    academicRecordStream: stream,
    stableKey: academicRecordStreamKeyV1(stream),
    state: 'active',
    sourceManifestId: source.manifest.id,
    sourceManifestVersion,
  };
}

describe('promoção transacional D1 local V1', () => {
  it('executa o executor abstrato e confirma fonte, registro e associação no mesmo commit', async () => {
    const source = sourceFileVersion();
    const plan = await planFor(source, [gradeRecord(8)]);
    const result = await executeImportChangePlan(plan, transaction());

    expect(result).toMatchObject({
      status: 'applied',
      transactionCommitted: true,
      committedWrites: {
        sourceFileVersions: 1,
        academicRecordVersions: 1,
        logicalSourceRecordAssociationVersions: 1,
        totalVersionWrites: 3,
      },
    });
    expect(tableCount('source_file_versions')).toBe(1);
    expect(tableCount('academic_record_versions')).toBe(1);
    expect(tableCount('logical_source_record_versions')).toBe(1);

    const repeatedPlan = await planFor(source, [gradeRecord(8, '999')]);
    const repeated = await executeImportChangePlan(repeatedPlan, transaction());
    expect(repeated).toMatchObject({ status: 'no-changes', transactionStarted: false });
    expect(tableCount('academic_record_versions')).toBe(1);
    expect(tableCount('logical_source_record_versions')).toBe(1);
  });

  it('registra renomeação como metadado sem escrita acadêmica ou de associação', async () => {
    const source = sourceFileVersion('a', 'synthetic-gradebook.xlsx');
    await executeImportChangePlan(await planFor(source, [gradeRecord(8)]), transaction());

    const renamed = sourceFileVersion('a', 'synthetic-gradebook-renamed.xlsx');
    const renamedPlan = await planFor(renamed, [gradeRecord(8, '999')]);
    expect(renamedPlan.estimatedWrites).toMatchObject({
      sourceFileVersions: 1,
      academicRecordVersions: 0,
      logicalSourceRecordAssociationVersions: 0,
    });
    await expect(executeImportChangePlan(renamedPlan, transaction())).resolves.toMatchObject({
      status: 'applied',
      committedWrites: { totalVersionWrites: 1 },
    });
    expect(tableCount('source_file_versions')).toBe(2);
    expect(tableCount('academic_record_versions')).toBe(1);
    expect(tableCount('logical_source_record_versions')).toBe(1);
  });

  it('promove item alterado e novo no mesmo lote, preservando versões anteriores', async () => {
    const firstSource = sourceFileVersion('a');
    await executeImportChangePlan(await planFor(firstSource, [gradeRecord(8)]), transaction());

    const secondAssessmentComponentId =
      'assessment-component:d1-write:002' as AssessmentComponentId;
    database.raw
      .prepare(
        `INSERT INTO academic_entity_streams (
           academic_year_id, entity_kind, entity_id, current_version, created_at
         ) VALUES (?, 'assessment-component', ?, 1, ?)`,
      )
      .run(academicYearId, secondAssessmentComponentId, instant);
    const secondStream = {
      ...gradeStream,
      assessmentComponentId: secondAssessmentComponentId,
    } satisfies AcademicRecordStreamV1;
    const secondRecord = {
      ...gradeRecord(7, '003'),
      value: {
        ...gradeRecord(7, '003').value,
        assessmentComponentId: secondAssessmentComponentId,
      },
    } satisfies AcademicRecordV1;

    const plan = await planFor(sourceFileVersion('b'), [gradeRecord(9, '002'), secondRecord]);
    expect(plan.counts).toMatchObject({ new: 1, changed: 1 });
    await expect(executeImportChangePlan(plan, transaction())).resolves.toMatchObject({
      status: 'applied',
      committedWrites: {
        sourceFileVersions: 1,
        academicRecordVersions: 2,
        logicalSourceRecordAssociationVersions: 2,
      },
    });
    expect(
      database.raw
        .prepare(
          `SELECT stream_key, current_version FROM academic_record_streams
           ORDER BY stream_key`,
        )
        .all(),
    ).toEqual(
      expect.arrayContaining([
        { stream_key: academicRecordStreamKeyV1(gradeStream), current_version: 2 },
        { stream_key: academicRecordStreamKeyV1(secondStream), current_version: 1 },
      ]),
    );
    expect(tableCount('academic_record_versions')).toBe(3);
    expect(tableCount('logical_source_record_versions')).toBe(3);
  });

  it('não promove item ausente/revisão e mantém zero writes indevidos', async () => {
    await executeImportChangePlan(
      await planFor(sourceFileVersion('a'), [gradeRecord(8)]),
      transaction(),
    );
    const before = {
      sources: tableCount('source_file_versions'),
      records: tableCount('academic_record_versions'),
      associations: tableCount('logical_source_record_versions'),
    };
    const reviewPlan = await planFor(sourceFileVersion('c'), []);
    expect(reviewPlan).toMatchObject({ status: 'review-required' });
    await expect(executeImportChangePlan(reviewPlan, transaction())).resolves.toMatchObject({
      status: 'no-changes',
    });
    expect({
      sources: tableCount('source_file_versions'),
      records: tableCount('academic_record_versions'),
      associations: tableCount('logical_source_record_versions'),
    }).toEqual(before);
  });

  it('reverte a promoção inteira quando a fonte conflita antes dos demais appends', async () => {
    const source = sourceFileVersion();
    const plan = await planFor(source, [gradeRecord(8)]);
    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    await unit.imports.appendSourceFileVersion(context, source, { expectedVersion: null });

    const result = await executeImportChangePlan(plan, transaction());
    expect(result).toMatchObject({
      status: 'version-conflict',
      conflict: { scope: 'source-file', currentVersion: 1 },
    });
    expect(tableCount('source_file_versions')).toBe(1);
    expect(tableCount('academic_record_versions')).toBe(0);
    expect(tableCount('logical_source_record_versions')).toBe(0);
  });

  it('reverte a fonte quando o registro conflita depois do primeiro append', async () => {
    const source = sourceFileVersion();
    const plan = await planFor(source, [gradeRecord(8)]);
    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    await unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(7, '009'), {
      expectedVersion: null,
    });

    const result = await executeImportChangePlan(plan, transaction());
    expect(result).toMatchObject({
      status: 'version-conflict',
      conflict: { scope: 'academic-record', currentVersion: 1 },
    });
    expect(tableCount('source_file_versions')).toBe(0);
    expect(tableCount('academic_record_versions')).toBe(1);
    expect(tableCount('logical_source_record_versions')).toBe(0);
  });

  it('reverte fonte e registro quando a associação conflita na última etapa', async () => {
    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    const oldSource = sourceFileVersion('d');
    await unit.imports.appendSourceFileVersion(context, oldSource, { expectedVersion: null });
    await unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(7), {
      expectedVersion: null,
    });
    const associationStream = logicalSourceRecordAssociationStreamForV1(
      logicalSourceId,
      gradeStream,
    );
    await unit.logicalSourceRecords.appendVersion(
      context,
      associationStream,
      association(oldSource, 1),
      { expectedVersion: null },
    );

    const newSource = sourceFileVersion('e');
    const plan = await planFor(newSource, [gradeRecord(9, '002')]);
    await unit.logicalSourceRecords.appendVersion(
      context,
      associationStream,
      association(oldSource, 1),
      { expectedVersion: 1 },
    );

    const result = await executeImportChangePlan(plan, transaction());
    expect(result).toMatchObject({
      status: 'version-conflict',
      conflict: { scope: 'logical-source-record-association', currentVersion: 2 },
    });
    expect(tableCount('source_file_versions')).toBe(1);
    expect(
      database.raw.prepare('SELECT current_version FROM academic_record_streams').get(),
    ).toEqual({ current_version: 1 });
    expect(tableCount('academic_record_versions')).toBe(1);
    expect(tableCount('logical_source_record_versions')).toBe(2);
  });

  it('reverte a fonte quando uma constraint física falha durante o registro', async () => {
    const plan = await planFor(sourceFileVersion('f'), [gradeRecord(8)]);
    database.raw
      .prepare(
        `DELETE FROM academic_entity_streams
         WHERE academic_year_id = ? AND entity_kind = 'assessment-component'
           AND entity_id = ?`,
      )
      .run(academicYearId, gradeStream.assessmentComponentId);

    const result = await executeImportChangePlan(plan, transaction());
    expect(result).toMatchObject({
      status: 'transaction-failed',
      transactionCommitted: false,
      failure: {
        code: 'transaction-failed',
        message: 'A promoção transacional falhou sem confirmar alterações.',
      },
    });
    expect(tableCount('source_file_versions')).toBe(0);
    expect(tableCount('source_file_streams')).toBe(0);
    expect(tableCount('academic_record_versions')).toBe(0);
  });

  it('recusa lote obsoleto ou arquivo não aprovado com erro sanitizado e rollback', async () => {
    const port = transaction();
    const stale = port.runBatchPromotion(
      context,
      { importBatchId, approvedImportFileIds: [importFileId], expectedBatchVersion: 2 },
      async () => 'unexpected',
    );
    await expect(stale).rejects.toBeInstanceOf(GradebookD1TransactionErrorV1);
    await expect(stale).rejects.toMatchObject({
      code: 'batch-version-conflict',
      message: 'O lote acadêmico não está na versão esperada para promoção.',
    });

    const unapprovedId = 'import-file:d1-write:not-approved' as ImportFileId;
    const unapproved = port.runBatchPromotion(
      context,
      { importBatchId, approvedImportFileIds: [unapprovedId], expectedBatchVersion: 1 },
      async () => 'unexpected',
    );
    await expect(unapproved).rejects.toMatchObject({
      code: 'file-not-approved',
      message: 'A promoção contém arquivo sem aprovação persistida.',
    });
    expect(tableCount('source_file_versions')).toBe(0);
  });
});
