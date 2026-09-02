import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

import type { RuntimeEnv } from '../../../../server/env';
import { AuthorizationError } from '../../../../server/auth/roles';
import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type { ImportFileId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import { planImportReconciliation } from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  createGradebookD1RuntimeV1,
  GradebookD1RuntimeErrorV1,
} from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../../server/gradebook/persistence/d1/schema/migrations';
import type { D1WriteDatabaseV1 } from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import {
  context,
  gradeRecord,
  importBatchId,
  importFileId,
  instant,
  logicalSourceId,
  seedBatch,
  seedContext,
  sourceFileVersion,
  SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });

function migrationSql(): readonly string[] {
  const directory = join(process.cwd(), 'migrations', 'gradebook');
  return GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.map((migration) =>
    readFileSync(join(directory, migration.fileName), 'utf8'),
  );
}

async function openDatabase(): Promise<{
  readonly raw: DatabaseSync;
  readonly database: SqliteD1Database;
}> {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  return { raw, database: new SqliteD1Database(raw) };
}

function env(
  database: unknown,
  environment: 'local' | 'preview' | 'production' = 'local',
): RuntimeEnv {
  return {
    RUNTIME_ENVIRONMENT: environment,
    GRADEBOOK_D1: database,
  } as RuntimeEnv;
}

function capturedError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (cause) {
    return cause;
  }
  throw new Error('Expected the synthetic operation to fail.');
}

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

describe('runtime D1 local/preview V1', () => {
  it('exige autorização administrativa antes de inspecionar o binding', () => {
    const prepare = vi.fn();
    const binding = { prepare, exec: vi.fn() };

    expect(() => createGradebookD1RuntimeV1(env(binding), {} as never)).toThrow(
      AuthorizationError,
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(() => authorizeGradebookD1RuntimeV1({ roles: ['PROFESSOR'] })).toThrow(
      AuthorizationError,
    );
  });

  it('mantém produção desabilitada mesmo quando um binding é apresentado', () => {
    const prepare = vi.fn();
    const binding = { prepare, exec: vi.fn() };

    expect(
      capturedError(() =>
        createGradebookD1RuntimeV1(env(binding, 'production'), authorization),
      ),
    ).toMatchObject({ code: 'runtime-environment-disabled' });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('falha de modo explícito para armazenamento ausente ou estruturalmente incompatível', () => {
    expect(
      capturedError(() => createGradebookD1RuntimeV1(env(undefined), authorization)),
    ).toMatchObject({ code: 'runtime-storage-missing' });
    expect(
      capturedError(() =>
        createGradebookD1RuntimeV1(
          env({
            prepare: () => ({ bind: vi.fn(), first: vi.fn(), all: vi.fn() }),
            exec: vi.fn(),
          }),
          authorization,
        ),
      ),
    ).toMatchObject({ code: 'runtime-storage-incompatible' });
  });

  it('constrói leitura, escrita transacional e runner somente em local/preview', async () => {
    const { raw, database } = await openDatabase();
    try {
      const runtime = createGradebookD1RuntimeV1(env(database, 'preview'), authorization, {
        migrationSql: migrationSql(),
        now: () => instant,
      });

      expect(runtime.environment).toBe('preview');
      expect(runtime.planningRepositories()).toMatchObject({
        imports: expect.any(Object),
        academicRecords: expect.any(Object),
        logicalSourceRecords: expect.any(Object),
      });
      await expect(runtime.runMigrations()).resolves.toMatchObject({
        result: 'applied',
        currentVersion: 4,
        migrationsApplied: 4,
      });
      await expect(runtime.inspectSchema()).resolves.toEqual({
        status: 'ready',
        currentVersion: 4,
        latestVersion: 4,
        appliedCount: 4,
        pendingCount: 0,
      });
    } finally {
      raw.close();
    }
  });

  it('reutiliza o executor para promover fonte, registro e associação em uma transação', async () => {
    const { raw, database } = await openDatabase();
    try {
      const trace: string[] = [];
      const tracedDatabase = {
        prepare(query: string) {
          trace.push(query);
          return database.prepare(query);
        },
        exec(query: string) {
          trace.push(query);
          return database.exec(query);
        },
      } satisfies D1WriteDatabaseV1;
      const runtime = createGradebookD1RuntimeV1(env(tracedDatabase), authorization, {
        migrationSql: migrationSql(),
        now: () => instant,
      });
      await runtime.runMigrations();
      seedContext(database);
      seedBatch(database);

      const source = sourceFileVersion();
      const plan = await planImportReconciliation(
        {
          context,
          batch: approvedBatch(source),
          expectedBatchVersion: 1,
          files: [
            {
              importFileId,
              logicalSource: { state: 'confirmed', logicalSourceId },
              records: [gradeRecord(8)],
            },
          ],
        },
        runtime.planningRepositories(),
      );

      trace.length = 0;
      await expect(runtime.promoteImportChangePlan(plan)).resolves.toMatchObject({
        status: 'applied',
        transactionCommitted: true,
        committedWrites: {
          sourceFileVersions: 1,
          academicRecordVersions: 1,
          logicalSourceRecordAssociationVersions: 1,
          totalVersionWrites: 3,
        },
      });

      const begin = trace.findIndex((statement) => statement === 'BEGIN IMMEDIATE');
      const sourceVersion = trace.findIndex((statement) =>
        statement.includes('INSERT INTO source_file_versions'),
      );
      const academicVersion = trace.findIndex((statement) =>
        statement.includes('INSERT INTO academic_record_versions'),
      );
      const associationVersion = trace.findIndex((statement) =>
        statement.includes('INSERT INTO logical_source_record_versions'),
      );
      const commit = trace.findIndex((statement) => statement === 'COMMIT');

      expect(begin).toBeGreaterThanOrEqual(0);
      expect(sourceVersion).toBeGreaterThan(begin);
      expect(academicVersion).toBeGreaterThan(sourceVersion);
      expect(associationVersion).toBeGreaterThan(academicVersion);
      expect(commit).toBeGreaterThan(associationVersion);
      expect(
        raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get(),
      ).toMatchObject({ count: 1 });
      expect(
        raw.prepare('SELECT COUNT(*) AS count FROM academic_record_versions').get(),
      ).toMatchObject({ count: 1 });
      expect(
        raw.prepare('SELECT COUNT(*) AS count FROM logical_source_record_versions').get(),
      ).toMatchObject({ count: 1 });
    } finally {
      raw.close();
    }
  });

  it('não incorpora detalhes lançados pelo binding em erros do runtime', () => {
    const sensitive = "SELECT grade, student_name FROM academic_payload WHERE secret = 'value'";
    const binding = {
      prepare(): never {
        throw new Error(sensitive);
      },
      exec(): never {
        throw new Error(sensitive);
      },
    };

    let error: unknown;
    try {
      createGradebookD1RuntimeV1(env(binding), authorization);
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(GradebookD1RuntimeErrorV1);
    expect(error).toMatchObject({ code: 'runtime-storage-incompatible' });
    expect(String(error)).not.toContain('student_name');
    expect(String(error)).not.toContain('grade');
    expect(String(error)).not.toContain('secret');
  });
});
