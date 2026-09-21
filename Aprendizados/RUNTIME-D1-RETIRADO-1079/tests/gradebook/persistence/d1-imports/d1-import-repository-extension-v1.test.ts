import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchFileResultV1,
  ImportBatchResultV1,
  ImportBatchStatusV1,
  ImportFileDiagnosticV1,
  ImportFileStatusV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileDiagnosticId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import {
  createGradebookD1ImportRepositoryExtensionV1,
  GRADEBOOK_D1_IMPORT_DEFAULT_MAXIMUM_PAGE_SIZE_V1,
} from '../../../../server/gradebook/persistence/d1/imports/d1-import-repository-extension-v1';
import { createGradebookD1WriteUnitOfWorkV1 } from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type {
  AcademicPersistenceContextV1,
  LogicalSourceIdV1,
  SourceFileVersionV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  context,
  instant,
  logicalSourceId,
  openMigratedDatabase,
  seedContext,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const otherYearId = 'academic-year:d1-imports:2027' as AcademicYearId;
const otherContext = { academicYearId: otherYearId } satisfies AcademicPersistenceContextV1;
const otherLogicalSourceId = 'logical-source:d1-imports:other' as LogicalSourceIdV1;

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  seedContext(database);
});

afterEach(() => {
  database.raw.close();
});

function seedOtherYear(logicalId: LogicalSourceIdV1 = logicalSourceId): void {
  database.raw
    .prepare(
      `INSERT INTO academic_years (
         academic_year_id, school_id, year, current_version, created_at
       ) VALUES (?, 'school:d1-imports:other', 2027, 1, ?)`,
    )
    .run(otherYearId, instant);
  database.raw
    .prepare(
      `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, source_context, created_at
       ) VALUES (?, ?, 'synthetic-other-context', ?)`,
    )
    .run(otherYearId, logicalId, instant);
}

function source(
  suffix: string,
  options: {
    readonly context?: AcademicPersistenceContextV1;
    readonly fileName?: string;
    readonly relation?: SourceFileVersionV1['logicalSource'];
    readonly manifestId?: SourceFileManifestId;
    readonly hashCharacter?: string;
  } = {},
): SourceFileVersionV1 {
  const sourceContext = options.context ?? context;
  const hashCharacter = options.hashCharacter ?? suffix.slice(0, 1);
  const sha256 = hashCharacter.repeat(64);
  return {
    manifest: {
      id:
        options.manifestId ?? (`source-file-manifest:d1-imports:${suffix}` as SourceFileManifestId),
      fileName: options.fileName ?? `synthetic-${suffix}.xlsx`,
      extension: 'xlsx',
      reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 128,
      lastModifiedAt: instant,
      sha256,
      sourceContractVersion: 1,
      parserVersion: 'synthetic-parser-v1',
      readAt: instant,
      confirmedAcademicYearId: sourceContext.academicYearId,
    },
    logicalSource: options.relation ?? { state: 'confirmed', logicalSourceId },
  };
}

async function appendSource(
  value: SourceFileVersionV1,
  expectedVersion: number | null = null,
  sourceContext: AcademicPersistenceContextV1 = context,
): Promise<void> {
  const result = await createGradebookD1WriteUnitOfWorkV1(database, {
    now: () => instant,
  }).imports.appendSourceFileVersion(sourceContext, value, { expectedVersion });
  expect(result.status).toBe('written');
}

function file(
  suffix: string,
  status: ImportFileStatusV1,
  manifest: SourceFileManifestV1 | null,
  diagnosticIds: readonly ImportFileDiagnosticId[] = [],
): ImportBatchFileResultV1 {
  return {
    id: `import-file:d1-imports:${suffix}` as ImportFileId,
    sourceFile: {
      fileName: manifest?.fileName ?? `synthetic-failed-${suffix}.xlsx`,
      extension: 'xlsx',
      reportedMimeType: manifest?.reportedMimeType ?? null,
      sizeBytes: manifest?.sizeBytes ?? 64,
      lastModifiedAt: manifest?.lastModifiedAt ?? null,
    },
    manifest,
    status,
    diagnosticIds,
  };
}

function diagnostic(
  suffix: string,
  batchId: ImportBatchId,
  importFileId: ImportFileId,
  options: {
    readonly manifestId?: SourceFileManifestId;
    readonly severity?: ImportFileDiagnosticV1['severity'];
    readonly location?: ImportFileDiagnosticV1['location'];
    readonly evidence?: ImportFileDiagnosticV1['sourceEvidence'];
  } = {},
): ImportFileDiagnosticV1 {
  return {
    id: `import-diagnostic:d1-imports:${suffix}` as ImportFileDiagnosticId,
    importBatchId: batchId,
    importFileId,
    ...(options.manifestId === undefined ? {} : { sourceFileManifestId: options.manifestId }),
    severity: options.severity ?? 'warning',
    code: `SYNTHETIC-${suffix.toUpperCase()}`,
    message: `Diagnóstico sintético ${suffix}.`,
    location: options.location ?? { kind: 'file' },
    ...(options.evidence === undefined ? {} : { sourceEvidence: options.evidence }),
  };
}

function batch(
  suffix: string,
  status: ImportBatchStatusV1,
  files: readonly ImportBatchFileResultV1[],
  diagnostics: readonly ImportFileDiagnosticV1[] = [],
): ImportBatchResultV1 {
  const count = (fileStatus: ImportFileStatusV1) =>
    files.filter(({ status: value }) => value === fileStatus).length;
  const severityCount = (severity: ImportFileDiagnosticV1['severity']) =>
    diagnostics.filter(({ severity: value }) => value === severity).length;
  return {
    id: `import-batch:d1-imports:${suffix}` as ImportBatchId,
    status,
    receivedAt: instant,
    updatedAt: instant,
    files,
    diagnostics,
    summary: {
      totalFileCount: files.length,
      processedFileCount: files.length,
      approvedFileCount: count('approved'),
      reviewRequiredFileCount: count('review-required'),
      rejectedFileCount: count('rejected'),
      failedFileCount: count('failed'),
      informationCount: severityCount('information'),
      warningCount: severityCount('warning'),
      blockingErrorCount: severityCount('blocking-error'),
      criticalErrorCount: severityCount('critical-error'),
    },
  } as ImportBatchResultV1;
}

describe('extensão D1 local de importações V1', () => {
  it('lista todas as versões históricas confirmadas sem inferir relação por nome ou payload', async () => {
    const manifestId = 'source-file-manifest:d1-imports:a' as SourceFileManifestId;
    const first = source('a', {
      manifestId,
      fileName: 'synthetic-original.xlsx',
      hashCharacter: 'a',
    });
    const renamed = source('a', {
      manifestId,
      fileName: 'synthetic-renamed.xlsx',
      hashCharacter: 'a',
    });
    const second = source('b', { hashCharacter: 'b' });
    const unmatched = source('c', { relation: { state: 'unmatched' }, hashCharacter: 'c' });
    const candidate = source('d', {
      relation: { state: 'candidate', candidateLogicalSourceIds: [logicalSourceId] },
      hashCharacter: 'd',
    });
    await appendSource(first);
    await appendSource(renamed, 1);
    await appendSource(second);
    await appendSource(unmatched);
    await appendSource(candidate);

    const repository = createGradebookD1ImportRepositoryExtensionV1(database);
    const firstPage = await repository.listLogicalSourceVersions(context, logicalSourceId, {
      limit: 2,
    });
    const secondPage = await repository.listLogicalSourceVersions(context, logicalSourceId, {
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect([...firstPage.items, ...secondPage.items]).toEqual([
      { value: first, version: 1, recordedAt: instant },
      { value: renamed, version: 2, recordedAt: instant },
      { value: second, version: 1, recordedAt: instant },
    ]);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(secondPage.nextCursor).toBeNull();
  });

  it('isola ano e fonte no cursor e rejeita paginação inválida', async () => {
    await appendSource(source('a', { hashCharacter: 'a' }));
    await appendSource(source('b', { hashCharacter: 'b' }));
    seedOtherYear();
    await appendSource(
      source('e', { context: otherContext, hashCharacter: 'e' }),
      null,
      otherContext,
    );
    const repository = createGradebookD1ImportRepositoryExtensionV1(database);
    const page = await repository.listLogicalSourceVersions(context, logicalSourceId, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(
      (
        await repository.listLogicalSourceVersions(otherContext, logicalSourceId, {
          limit: 10,
        })
      ).items,
    ).toHaveLength(1);

    for (const request of [
      { limit: 0 },
      { limit: GRADEBOOK_D1_IMPORT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 + 1 },
    ]) {
      await expect(
        repository.listLogicalSourceVersions(context, logicalSourceId, request),
      ).rejects.toMatchObject({ code: 'invalid-page-request' });
    }
    await expect(
      repository.listLogicalSourceVersions(context, otherLogicalSourceId, {
        limit: 1,
        cursor: page.nextCursor,
      }),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
    await expect(
      repository.listLogicalSourceVersions(otherContext, logicalSourceId, {
        limit: 1,
        cursor: page.nextCursor,
      }),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
    await expect(
      repository.listLogicalSourceVersions(context, logicalSourceId, {
        limit: 1,
        cursor: 'not-a-cursor',
      }),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
  });

  it('grava e reconstrói lote aprovado com a versão histórica exata do manifesto', async () => {
    const manifestId = 'source-file-manifest:d1-imports:historical' as SourceFileManifestId;
    const original = source('a', {
      manifestId,
      fileName: 'synthetic-original.xlsx',
      hashCharacter: 'a',
    });
    const renamed = source('a', {
      manifestId,
      fileName: 'synthetic-renamed.xlsx',
      hashCharacter: 'a',
    });
    await appendSource(original);
    await appendSource(renamed, 1);
    const value = batch('approved', 'approved', [file('approved', 'approved', original.manifest)]);
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });

    await expect(
      repository.appendImportBatchVersion(context, value, { expectedVersion: null }),
    ).resolves.toEqual({
      status: 'written',
      record: { value, version: 1, recordedAt: instant },
    });
    await expect(repository.getImportBatch(context, value.id)).resolves.toEqual({
      value,
      version: 1,
      recordedAt: instant,
    });
    expect(
      database.raw
        .prepare('SELECT manifest_version FROM import_batch_files WHERE import_batch_id = ?')
        .get(value.id),
    ).toEqual({ manifest_version: 1 });
  });

  it('preserva lote misto, manifestações nulas e diagnósticos em ordem determinística', async () => {
    const sourceVersion = source('a', { hashCharacter: 'a' });
    await appendSource(sourceVersion);
    const batchId = 'import-batch:d1-imports:mixed' as ImportBatchId;
    const failedId = 'import-file:d1-imports:z-failed' as ImportFileId;
    const reviewId = 'import-file:d1-imports:y-review' as ImportFileId;
    const failedDiagnosticId = 'import-diagnostic:d1-imports:z-failed' as ImportFileDiagnosticId;
    const reviewDiagnosticId = 'import-diagnostic:d1-imports:a-review' as ImportFileDiagnosticId;
    const failedDiagnostic = diagnostic('z-failed', batchId, failedId, {
      severity: 'blocking-error',
    });
    const reviewDiagnostic = diagnostic('a-review', batchId, reviewId, {
      manifestId: sourceVersion.manifest.id,
      location: { kind: 'cell', sheetName: 'Synthetic1º', cellAddress: 'R10' },
      evidence: {
        provenance: {
          fileName: sourceVersion.manifest.fileName,
          fileSha256: sourceVersion.manifest.sha256,
          sheetName: 'Synthetic1º',
          cellAddress: 'R10',
        },
        classification: 'manual-positive-number',
        rawValue: 7,
      },
    });
    expect(failedDiagnostic.id).toBe(failedDiagnosticId);
    expect(reviewDiagnostic.id).toBe(reviewDiagnosticId);
    const value = batch(
      'mixed',
      'partially-approved',
      [
        file('z-failed', 'failed', null, [failedDiagnosticId]),
        file('approved', 'approved', sourceVersion.manifest),
        file('y-review', 'review-required', sourceVersion.manifest, [reviewDiagnosticId]),
        file('rejected', 'rejected', null),
      ],
      [failedDiagnostic, reviewDiagnostic],
    );
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const write = await repository.appendImportBatchVersion(context, value, {
      expectedVersion: null,
    });
    expect(write.status).toBe('written');
    const read = await repository.getImportBatch(context, value.id);

    expect(read?.value.files.map(({ id }) => id)).toEqual([
      'import-file:d1-imports:approved',
      'import-file:d1-imports:rejected',
      'import-file:d1-imports:y-review',
      'import-file:d1-imports:z-failed',
    ]);
    expect(read?.value.diagnostics.map(({ id }) => id)).toEqual([
      reviewDiagnosticId,
      failedDiagnosticId,
    ]);
    expect(read?.value.files.map(({ status }) => status)).toEqual([
      'approved',
      'rejected',
      'review-required',
      'failed',
    ]);
    expect(read?.value.files.filter(({ manifest }) => manifest === null)).toHaveLength(2);
    expect(read?.value.diagnostics[0]).toEqual(reviewDiagnostic);
  });

  it('reconstrói lotes em revisão e rejeitado sem convertê-los em sucesso', async () => {
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const values = [
      batch('review', 'review-required', [file('review', 'review-required', null)]),
      batch('rejected', 'rejected', [file('rejected', 'rejected', null)]),
    ];
    for (const value of values) {
      await repository.appendImportBatchVersion(context, value, { expectedVersion: null });
      await expect(repository.getImportBatch(context, value.id)).resolves.toMatchObject({
        value: { status: value.status, files: [{ status: value.files[0]!.status }] },
      });
    }
  });

  it('mantém histórico append-only e aplica CAS nulo, válido e obsoleto', async () => {
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const first = batch('cas', 'received', [file('cas', 'received', null)]);
    const second = batch('cas', 'processing', [file('cas', 'processing', null)]);
    expect(
      await repository.appendImportBatchVersion(context, first, { expectedVersion: null }),
    ).toMatchObject({ status: 'written', record: { version: 1 } });
    expect(
      await repository.appendImportBatchVersion(context, first, { expectedVersion: null }),
    ).toEqual({ status: 'version-conflict', currentVersion: 1 });
    expect(
      await repository.appendImportBatchVersion(context, second, { expectedVersion: 1 }),
    ).toMatchObject({ status: 'written', record: { version: 2 } });
    expect(
      await repository.appendImportBatchVersion(context, second, { expectedVersion: 1 }),
    ).toEqual({ status: 'version-conflict', currentVersion: 2 });
    expect(
      await repository.appendImportBatchVersion(context, batch('missing', 'received', []), {
        expectedVersion: 1,
      }),
    ).toEqual({ status: 'version-conflict', currentVersion: null });

    expect(
      database.raw
        .prepare(
          `SELECT version, previous_version FROM import_batch_versions
           WHERE import_batch_id = ? ORDER BY version`,
        )
        .all(first.id),
    ).toEqual([
      { version: 1, previous_version: null },
      { version: 2, previous_version: 1 },
    ]);
    expect(
      database.raw
        .prepare('SELECT COUNT(*) AS count FROM import_batch_files WHERE import_batch_id = ?')
        .get(first.id),
    ).toEqual({ count: 2 });
  });

  it('recusa manifesto ausente ou de outro ano e reverte a raiz do lote', async () => {
    seedOtherYear();
    const foreign = source('f', { context: otherContext, hashCharacter: 'f' });
    await appendSource(foreign, null, otherContext);
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const cases = [
      {
        value: batch('missing-manifest', 'review-required', [
          file('missing', 'review-required', source('a', { hashCharacter: 'a' }).manifest),
        ]),
        code: 'manifest-not-found',
      },
      {
        value: batch('foreign-manifest', 'review-required', [
          file('foreign', 'review-required', foreign.manifest),
        ]),
        code: 'incompatible-write',
      },
    ] as const;
    for (const { value, code } of cases) {
      await expect(
        repository.appendImportBatchVersion(context, value, { expectedVersion: null }),
      ).rejects.toMatchObject({ code });
      expect(
        database.raw
          .prepare('SELECT COUNT(*) AS count FROM import_batch_streams WHERE import_batch_id = ?')
          .get(value.id),
      ).toEqual({ count: 0 });
    }
  });

  it('recusa itens duplicados e relações diagnósticas incompatíveis sem escrever', async () => {
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const duplicateFile = file('duplicate', 'failed', null);
    const duplicateBatch = batch('duplicate', 'failed', [duplicateFile, duplicateFile]);
    const linkedBatchId = 'import-batch:d1-imports:linked' as ImportBatchId;
    const linkedFile = file('linked', 'failed', null);
    const orphan = diagnostic('orphan', linkedBatchId, 'import-file:absent' as ImportFileId);
    const linkedBatch = batch('linked', 'failed', [linkedFile], [orphan]);
    const duplicateDiagnosticBatchId =
      'import-batch:d1-imports:duplicate-diagnostic' as ImportBatchId;
    const duplicateDiagnosticFileId = 'import-file:d1-imports:duplicate-diagnostic' as ImportFileId;
    const duplicateDiagnostic = diagnostic(
      'duplicate-diagnostic',
      duplicateDiagnosticBatchId,
      duplicateDiagnosticFileId,
    );
    const duplicateDiagnosticBatch = batch(
      'duplicate-diagnostic',
      'failed',
      [file('duplicate-diagnostic', 'failed', null, [duplicateDiagnostic.id])],
      [duplicateDiagnostic, duplicateDiagnostic],
    );

    for (const value of [duplicateBatch, linkedBatch, duplicateDiagnosticBatch]) {
      await expect(
        repository.appendImportBatchVersion(context, value, { expectedVersion: null }),
      ).rejects.toMatchObject({ code: 'incompatible-write' });
    }
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_streams').get(),
    ).toEqual({ count: 0 });
  });

  it('reverte raiz e histórico quando uma restrição de arquivo falha', async () => {
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const invalidFile = {
      ...file('rollback', 'failed', null),
      sourceFile: {
        ...file('rollback', 'failed', null).sourceFile,
        lastModifiedAt: 'invalid-timestamp',
      },
    };
    const value = batch('rollback', 'failed', [invalidFile]);

    const error = await repository
      .appendImportBatchVersion(context, value, { expectedVersion: null })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: 'database-write-failed',
      message: 'Não foi possível gravar os dados de importação persistidos.',
    });
    expect(String(error)).not.toContain('CHECK constraint');
    for (const table of ['import_batch_streams', 'import_batch_versions', 'import_batch_files']) {
      expect(database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({
        count: 0,
      });
    }
  });

  it('detecta JSON, shape e colunas incompatíveis com erros sanitizados', async () => {
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const value = batch('corrupt', 'failed', [file('corrupt', 'failed', null)]);
    await repository.appendImportBatchVersion(context, value, { expectedVersion: null });

    database.raw.exec('PRAGMA ignore_check_constraints = ON;');
    database.raw
      .prepare(
        `UPDATE import_batch_versions SET payload_json = '{invalid-json'
         WHERE import_batch_id = ?`,
      )
      .run(value.id);
    database.raw.exec('PRAGMA ignore_check_constraints = OFF;');
    const invalidJson = await repository
      .getImportBatch(context, value.id)
      .catch((cause: unknown) => cause);
    expect(invalidJson).toMatchObject({
      code: 'invalid-json',
      message: 'Os dados de importação persistidos não puderam ser reconstruídos.',
    });
    expect(String(invalidJson)).not.toContain('{invalid-json');

    database.raw
      .prepare('UPDATE import_batch_versions SET payload_json = ? WHERE import_batch_id = ?')
      .run(JSON.stringify(value), value.id);
    database.raw
      .prepare("UPDATE import_batch_files SET status = 'approved' WHERE import_batch_id = ?")
      .run(value.id);
    await expect(repository.getImportBatch(context, value.id)).rejects.toMatchObject({
      code: 'incompatible-row',
    });
  });

  it('sanitiza falha bruta do driver sem expor SQL ou identificadores', async () => {
    const repository = createGradebookD1ImportRepositoryExtensionV1(database);
    database.raw.exec('DROP TABLE source_file_versions;');
    const error = await repository
      .listLogicalSourceVersions(context, logicalSourceId, { limit: 1 })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: 'database-read-failed',
      message: 'Não foi possível consultar os dados de importação persistidos.',
    });
    expect(String(error)).not.toContain('SELECT');
    expect(String(error)).not.toContain(logicalSourceId);
    expect(String(error)).not.toContain('no such table');
  });

  it('é determinístico e não altera entradas do chamador', async () => {
    const repository = createGradebookD1ImportRepositoryExtensionV1(database, {
      now: () => instant,
    });
    const value = batch('deterministic', 'failed', [file('deterministic', 'failed', null)]);
    const contextSnapshot = structuredClone(context);
    const valueSnapshot = structuredClone(value);
    const page = { limit: 10, cursor: null } as const;
    const pageSnapshot = structuredClone(page);

    await repository.appendImportBatchVersion(context, value, { expectedVersion: null });
    expect(await repository.getImportBatch(context, value.id)).toEqual(
      await repository.getImportBatch(context, value.id),
    );
    expect(await repository.listLogicalSourceVersions(context, logicalSourceId, page)).toEqual(
      await repository.listLogicalSourceVersions(context, logicalSourceId, page),
    );
    expect(context).toEqual(contextSnapshot);
    expect(value).toEqual(valueSnapshot);
    expect(page).toEqual(pageSnapshot);
  });

  it('rejeita opções inválidas na criação', () => {
    for (const maximumPageSize of [0, GRADEBOOK_D1_IMPORT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 + 1]) {
      expect(() =>
        createGradebookD1ImportRepositoryExtensionV1(database, { maximumPageSize }),
      ).toThrow(expect.objectContaining({ code: 'invalid-options' }));
    }
  });
});
