import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { TeacherId } from '../../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import { createGradebookD1LogicalSourceRepositoryV2 } from '../../../../server/gradebook/persistence/d1/imports/d1-logical-source-repository-v2';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import { GradebookD1AtomicBatchRecorderV1 } from '../../../../server/gradebook/persistence/d1/transaction/d1-batch-promotion-transaction-v1';
import type { LogicalSourceIdV1 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
  type ImportBootstrapTransactionRequestV2,
  type LogicalSourceV2,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';
import type {
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';

const teacherId = 'teacher:bootstrap-v2:001' as TeacherId;
const logicalSourceId = 'logical-source:bootstrap-v2:001' as LogicalSourceIdV1;
const manifestId = 'manifest:bootstrap-v2:001' as SourceFileManifestId;
const importBatchId = 'import-batch:bootstrap-v2:001' as ImportBatchId;
const importFileId = 'import-file:bootstrap-v2:001' as ImportFileId;
let databases: DatabaseSync[] = [];

function atomicDatabase(db: SqliteD1Database) {
  return {
    prepare: db.prepare.bind(db),
    exec: db.exec.bind(db),
    async batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]> {
      db.raw.exec('BEGIN IMMEDIATE');
      try {
        const results: D1WriteRunResultV1[] = [];
        for (const statement of statements) results.push(await statement.run());
        db.raw.exec('COMMIT');
        return results;
      } catch (cause) {
        db.raw.exec('ROLLBACK');
        throw cause;
      }
    },
  };
}

async function database(): Promise<SqliteD1Database> {
  const value = await openMigratedDatabase();
  databases.push(value.raw);
  value.raw
    .prepare(
      `INSERT INTO academic_years (academic_year_id, school_id, year, current_version, created_at)
     VALUES (?, 'school:bootstrap-v2', 2026, 1, ?)`,
    )
    .run(academicYearId, instant);
  value.raw
    .prepare(
      `INSERT INTO academic_entity_streams (academic_year_id, entity_kind, entity_id, current_version, created_at)
     VALUES (?, 'teacher', ?, 1, ?)`,
    )
    .run(academicYearId, teacherId, instant);
  return value;
}

afterEach(() => {
  for (const value of databases) value.close();
  databases = [];
});

function source(): LogicalSourceV2 {
  return {
    id: logicalSourceId,
    academicYearId,
    teacherId,
    sourceContext: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
    createdAt: instant,
  };
}

function manifest(): SourceFileManifestV1 {
  return {
    id: manifestId,
    fileName: 'fixture-totalmente-sintetica.xlsx',
    extension: 'xlsx',
    reportedMimeType: null,
    sizeBytes: 128,
    lastModifiedAt: instant,
    sha256: 'a'.repeat(64),
    sourceContractVersion: 2,
    parserVersion: 'synthetic-v2',
    readAt: instant,
    confirmedAcademicYearId: academicYearId,
    confirmedTeacherId: teacherId,
  };
}

function batch(): ImportBatchResultV1 {
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
        sourceFile: {
          fileName: manifest().fileName,
          extension: 'xlsx',
          reportedMimeType: null,
          sizeBytes: 128,
          lastModifiedAt: instant,
        },
        manifest: manifest(),
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

function request(): ImportBootstrapTransactionRequestV2 {
  return {
    logicalSource: { kind: 'create', value: source() },
    plannedSourceFileManifestIds: [manifestId],
    batchWrite: { value: batch(), expectedVersion: null },
    promotionRequest: {
      importBatchId,
      expectedBatchVersion: 1,
      approvedImportFileIds: [importFileId],
    },
  };
}

async function bootstrap(db: SqliteD1Database, failLate = false) {
  const transaction = new GradebookD1ImportBootstrapTransactionV2(db, { now: () => instant });
  return transaction.runImportBootstrap({ academicYearId }, request(), async (unitOfWork) => {
    const logical = await unitOfWork.logicalSources.createInitial({ academicYearId }, source());
    if (logical.status === 'resolution-conflict') throw new Error('logical source conflict');
    await unitOfWork.imports.appendSourceFileVersion(
      { academicYearId },
      { manifest: manifest(), logicalSource: { state: 'confirmed', logicalSourceId } },
      { expectedVersion: null },
    );
    await unitOfWork.imports.appendImportBatchVersion({ academicYearId }, batch(), {
      expectedVersion: null,
    });
    if (failLate) throw new Error('synthetic late failure');
  });
}

describe('D1 bootstrap import V2', () => {
  it('resolves 0/1 sources by teacher-year context and creates idempotently', async () => {
    const db = await database();
    const repository = createGradebookD1LogicalSourceRepositoryV2(db);
    expect(
      (
        await repository.listByContext(
          { academicYearId },
          {
            kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
            academicYearId,
            teacherId,
          },
          { limit: 2 },
        )
      ).items,
    ).toEqual([]);
    expect(await repository.createInitial({ academicYearId }, source())).toMatchObject({
      status: 'created',
    });
    expect(await repository.createInitial({ academicYearId }, source())).toMatchObject({
      status: 'already-present',
    });
    expect(
      await repository.createInitial(
        { academicYearId },
        { ...source(), createdAt: '2026-09-03T13:00:00.000Z' },
      ),
    ).toMatchObject({ status: 'already-present', value: source() });
    expect(
      (
        await repository.listByContext(
          { academicYearId },
          {
            kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
            academicYearId,
            teacherId,
          },
          { limit: 2 },
        )
      ).items,
    ).toEqual([source()]);
  });

  it('bounds compatible-source listing and rejects a second compatible identity', async () => {
    const db = await database();
    const repository = createGradebookD1LogicalSourceRepositoryV2(db);
    expect(await repository.createInitial({ academicYearId }, source())).toMatchObject({
      status: 'created',
    });
    expect(
      await repository.createInitial(
        { academicYearId },
        { ...source(), id: 'logical-source:bootstrap-v2:second' as LogicalSourceIdV1 },
      ),
    ).toMatchObject({
      status: 'resolution-conflict',
      reason: 'compatible-source-created-concurrently',
    });
    db.raw
      .prepare(
        `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, teacher_ref_kind, teacher_id, source_context, created_at
       ) VALUES (?, 'logical-source:bootstrap-v2:legacy-ambiguous', 'teacher', ?, 'teacher-year-gradebook', ?)`,
      )
      .run(academicYearId, teacherId, instant);
    await expect(
      repository.listByContext(
        { academicYearId },
        {
          kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
          academicYearId,
          teacherId,
        },
        { limit: 1 },
      ),
    ).resolves.toMatchObject({ items: [expect.any(Object)], nextCursor: 'more' });
  });

  it('commits source, planned manifest and initial batch in one transaction', async () => {
    const db = await database();
    await bootstrap(db);
    for (const table of ['logical_sources', 'source_file_versions', 'import_batch_versions']) {
      expect(
        (db.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
      ).toBe(1);
    }
  });

  it('commits the same bootstrap through the atomic D1 batch recorder without pre-writing the hash', async () => {
    const db = await database();
    const atomic = atomicDatabase(db);
    await bootstrap(atomic as unknown as SqliteD1Database);
    expect(
      (
        db.raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    expect(
      (
        db.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
  });

  it('fails the atomic insert guard when a compatible source wins the race', async () => {
    const db = await database();
    const recorder = new GradebookD1AtomicBatchRecorderV1(atomicDatabase(db));
    const repository = createGradebookD1LogicalSourceRepositoryV2(recorder);
    await expect(repository.createInitial({ academicYearId }, source())).resolves.toMatchObject({
      status: 'created',
    });
    db.raw
      .prepare(
        `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, teacher_ref_kind, teacher_id, source_context, created_at
       ) VALUES (?, 'logical-source:race-winner', 'teacher', ?, 'teacher-year-gradebook', ?)`,
      )
      .run(academicYearId, teacherId, instant);
    await expect(recorder.commit()).rejects.toMatchObject({ code: 'transaction-failed' });
    expect(
      (
        db.raw.prepare('SELECT COUNT(*) AS count FROM logical_sources').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
  });

  it('rolls source, manifest and batch back on a late failure', async () => {
    const db = await database();
    await expect(bootstrap(db, true)).rejects.toThrow('synthetic late failure');
    for (const table of [
      'logical_sources',
      'source_file_streams',
      'source_file_versions',
      'import_batch_streams',
      'import_batch_versions',
    ]) {
      expect(
        (db.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
      ).toBe(0);
    }
  });
});
