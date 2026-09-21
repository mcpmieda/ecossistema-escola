import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { TeacherId } from '../../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import {
  createGradebookD1WriteUnitOfWorkV1,
  type D1WriteDatabaseV1,
  type D1WriteRunResultV1,
  type D1WriteStatementV1,
  type D1WriteValueV1,
} from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import {
  TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
  type ImportBootstrapTransactionRequestV2,
  type LogicalSourceV2,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import {
  academicYearId,
  context,
  importBatchId,
  importFileId,
  instant,
  logicalSourceId,
  openMigratedDatabase,
  seedContext,
  sourceFileVersion,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const teacherId = 'teacher:bootstrap-evidence-d1:001' as TeacherId;
let databases: DatabaseSync[] = [];

class CountingStatement implements D1WriteStatementV1 {
  constructor(
    private readonly base: D1WriteStatementV1,
    private readonly sourceManifestRead: boolean,
    private readonly counts: { sourceManifestAll: number },
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new CountingStatement(this.base.bind(...values), this.sourceManifestRead, this.counts);
  }

  first<Row extends Record<string, unknown>>(): Promise<Row | null> {
    return this.base.first<Row>();
  }

  async all<Row extends Record<string, unknown>>(): Promise<{ readonly results: readonly Row[] }> {
    if (this.sourceManifestRead) this.counts.sourceManifestAll += 1;
    return this.base.all<Row>();
  }

  run(): Promise<D1WriteRunResultV1> {
    return this.base.run();
  }
}

class CountingDatabase implements D1WriteDatabaseV1 {
  readonly counts = { sourceManifestAll: 0 };

  constructor(private readonly base: D1WriteDatabaseV1) {}

  prepare(query: string): D1WriteStatementV1 {
    const normalized = query.toLowerCase().replace(/\s+/gu, ' ');
    const sourceManifestRead =
      normalized.includes('from source_file_versions') &&
      normalized.includes('order by version desc');
    return new CountingStatement(this.base.prepare(query), sourceManifestRead, this.counts);
  }

  exec(query: string): Promise<unknown> | unknown {
    return this.base.exec(query);
  }
}

function logicalSource(): LogicalSourceV2 {
  return {
    id: logicalSourceId,
    academicYearId,
    teacherId,
    sourceContext: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
    createdAt: instant,
  };
}

function batch(): ImportBatchResultV1 {
  const source = sourceFileVersion();
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
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
    receivedAt: instant,
    updatedAt: instant,
  };
}

function request(withEvidence: boolean): ImportBootstrapTransactionRequestV2 {
  const source = sourceFileVersion();
  return {
    logicalSource: { kind: 'reuse', value: logicalSource() },
    plannedSourceFileManifestIds: [],
    ...(withEvidence
      ? {
          sourceManifestVersions: [{ manifestId: source.manifest.id, version: 1 }],
        }
      : {}),
    batchWrite: { value: batch(), expectedVersion: null },
    promotionRequest: {
      importBatchId,
      expectedBatchVersion: 1,
      approvedImportFileIds: [importFileId],
    },
  };
}

async function seededDatabase(): Promise<SqliteD1Database> {
  const database = await openMigratedDatabase();
  databases.push(database.raw);
  seedContext(database);
  const writer = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
  const source = sourceFileVersion();
  await expect(
    writer.imports.appendSourceFileVersion(context, source, { expectedVersion: null }),
  ).resolves.toMatchObject({ status: 'written', record: { version: 1 } });
  return database;
}

async function persistBatch(withEvidence: boolean): Promise<number> {
  const database = await seededDatabase();
  const counting = new CountingDatabase(database);
  const transaction = new GradebookD1ImportBootstrapTransactionV2(counting, {
    now: () => instant,
  });
  await transaction.runImportBootstrap(context, request(withEvidence), async (unitOfWork) => {
    await expect(
      unitOfWork.imports.appendImportBatchVersion(context, batch(), { expectedVersion: null }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 1 } });
  });
  return counting.counts.sourceManifestAll;
}

afterEach(() => {
  for (const database of databases) database.close();
  databases = [];
});

describe('D1 bootstrap manifest version evidence V2', () => {
  it('avoids rediscovering a known manifest version when official evidence is supplied', async () => {
    await expect(persistBatch(true)).resolves.toBe(0);
  });

  it('preserves the legacy fallback read when version evidence is absent', async () => {
    await expect(persistBatch(false)).resolves.toBe(1);
  });
});
