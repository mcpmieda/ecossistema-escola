import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

import type { RuntimeEnv } from '../../../server/env';
import type { BulletinSnapshotIdV1 } from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type {
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { EnrollmentId, StudentId } from '../../../shared/gradebook-contracts/entities';
import type { BulletinSnapshotSeriesKeyV1 } from '../../../server/gradebook/application/bulletins/bulletin-snapshot-repository-v1';
import type { CouncilDecisionStoreKeyV1 } from '../../../server/gradebook/application/council/council-decision-store-v1';
import { createGradebookD1BulletinCouncilDurabilityV1 } from '../../../server/gradebook/persistence/d1/durability/d1-bulletin-council-durability-v1';
import { authorizeGradebookD1RuntimeV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../server/gradebook/persistence/d1/schema/migrations';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import {
  importWorkbookBatch,
  MAX_NOTES_IMPORT_FILES,
} from '../../../src/features/gradebook/import/import-batch';
import {
  SYNTHETIC_FILES,
  createSyntheticFile,
  createSyntheticSheetJs,
} from '../fixtures/synthetic-teacher-workbooks';
import {
  councilDecision,
  durabilityClassA,
  durabilitySnapshot,
  durabilityYear2026,
} from '../persistence/d1-durability/d1-durability-test-support';
import { SqliteD1Database } from '../persistence/d1-transaction/d1-write-test-support';

const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
const instant = '2026-09-02T12:00:00.000Z';
const studentCount = 30;

function migrationSql(): readonly string[] {
  const directory = join(process.cwd(), 'migrations', 'gradebook');
  return GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.map((migration) =>
    readFileSync(join(directory, migration.fileName), 'utf8'),
  );
}

async function openEmptyDatabase(): Promise<{
  readonly raw: DatabaseSync;
  readonly database: SqliteD1Database;
}> {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  return { raw, database: new SqliteD1Database(raw) };
}

function runtimeEnv(database: unknown, environment: 'preview' | 'production'): RuntimeEnv {
  return {
    RUNTIME_ENVIRONMENT: environment,
    GRADEBOOK_D1: database,
  } as RuntimeEnv;
}

function bulletinIdentity(index: number) {
  const suffix = String(index).padStart(2, '0');
  return {
    seriesKey: `series:readiness:${suffix}` as BulletinSnapshotSeriesKeyV1,
    snapshotId: `snapshot:readiness:${suffix}` as BulletinSnapshotIdV1,
    studentId: `student:readiness:${suffix}` as StudentId,
    enrollmentId: `enrollment:readiness:${suffix}` as EnrollmentId,
  };
}

function councilKey(index: number): CouncilDecisionStoreKeyV1 {
  const suffix = String(index).padStart(2, '0');
  return {
    academicYearId: durabilityYear2026,
    classReference: 'class-reference:readiness:a' as CouncilClassReferenceV1,
    studentReference: `student-reference:readiness:${suffix}` as CouncilStudentReferenceV1,
  };
}

describe('F9 synthetic operational rehearsal V1', () => {
  it('processa o limite público de 50 workbooks sequencialmente sem dados reais', async () => {
    const events: string[] = [];
    const files = Array.from({ length: MAX_NOTES_IMPORT_FILES }, () =>
      createSyntheticFile(SYNTHETIC_FILES.xlsx, events),
    );

    const result = await importWorkbookBatch(
      files,
      createSyntheticSheetJs(events),
      () => undefined,
      {
        now: () => new Date(instant),
        yieldBeforeRecognition: () => Promise.resolve(),
      },
    );

    expect(result.batch.summary.totalFileCount).toBe(50);
    expect(result.batch.summary.approvedFileCount).toBe(50);
    expect(result.failures).toEqual([]);
    expect(events).toHaveLength(150);
  });

  it('reaplica schema local, exercita filas bounded e recupera histórico após restart', async () => {
    const { raw, database } = await openEmptyDatabase();
    try {
      const runtime = createGradebookD1RuntimeV1(runtimeEnv(database, 'preview'), authorization, {
        migrationSql: migrationSql(),
        now: () => instant,
      });

      await expect(runtime.runMigrations()).resolves.toMatchObject({
        result: 'applied',
        currentVersion: 5,
        migrationsApplied: 5,
      });
      await expect(runtime.runMigrations()).resolves.toMatchObject({
        result: 'up-to-date',
        currentVersion: 5,
        migrationsApplied: 0,
      });
      expect(
        raw.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get(),
      ).toMatchObject({ count: 27 });
      raw
        .prepare(
          `INSERT INTO academic_years (
             academic_year_id, school_id, year, current_version, created_at
           ) VALUES (?, 'school:readiness:synthetic', 2026, 1, ?)`,
        )
        .run(durabilityYear2026, instant);

      const durability = createGradebookD1BulletinCouncilDurabilityV1(database);
      for (let index = 0; index < studentCount; index += 1) {
        const identity = bulletinIdentity(index);
        const common = {
          academicYearId: durabilityYear2026,
          classGroupId: durabilityClassA,
          studentId: identity.studentId,
          enrollmentId: identity.enrollmentId,
          snapshotId: identity.snapshotId,
          displayName: `Estudante Sintético ${String(index + 1)}`,
        };
        await expect(
          durability.bulletinSnapshots.append(
            identity.seriesKey,
            durabilitySnapshot(1, { ...common, emittedMinute: 1 }),
            0,
          ),
        ).resolves.toMatchObject({ status: 'appended' });
        await expect(
          durability.bulletinSnapshots.append(
            identity.seriesKey,
            durabilitySnapshot(2, { ...common, emittedMinute: 2 }),
            1,
          ),
        ).resolves.toMatchObject({ status: 'appended' });
      }

      const firstBulletinPage = await durability.bulletinSnapshots.listHistoryPage({
        academicYearId: durabilityYear2026,
        classGroupId: durabilityClassA,
        limit: 25,
        cursor: null,
      });
      expect(firstBulletinPage.items).toHaveLength(25);
      expect(firstBulletinPage.nextCursor).not.toBeNull();
      const secondBulletinPage = await durability.bulletinSnapshots.listHistoryPage({
        academicYearId: durabilityYear2026,
        classGroupId: durabilityClassA,
        limit: 25,
        cursor: firstBulletinPage.nextCursor,
      });
      expect(secondBulletinPage.items).toHaveLength(25);
      expect(secondBulletinPage.nextCursor).not.toBeNull();
      const thirdBulletinPage = await durability.bulletinSnapshots.listHistoryPage({
        academicYearId: durabilityYear2026,
        classGroupId: durabilityClassA,
        limit: 25,
        cursor: secondBulletinPage.nextCursor,
      });
      expect(thirdBulletinPage.items).toHaveLength(10);
      expect(thirdBulletinPage.nextCursor).toBeNull();

      const keys = Array.from({ length: studentCount }, (_, index) => councilKey(index));
      for (const key of keys) {
        await expect(
          durability.councilDecisions.append(councilDecision(key, 0)),
        ).resolves.toMatchObject({ status: 'applied' });
      }
      await expect(durability.councilDecisions.getVersions(keys)).resolves.toEqual(
        keys.map((key) => ({ key, version: 1 })),
      );

      const competingKey = councilKey(99);
      const competing = await Promise.all([
        durability.councilDecisions.append(councilDecision(competingKey, 0, 'approved')),
        durability.councilDecisions.append(councilDecision(competingKey, 0, 'failed')),
      ]);
      expect(competing.filter(({ status }) => status === 'applied')).toHaveLength(1);
      expect(competing.filter(({ status }) => status === 'version-conflict')).toHaveLength(1);

      const restarted = createGradebookD1RuntimeV1(runtimeEnv(database, 'preview'), authorization, {
        migrationSql: migrationSql(),
        now: () => instant,
      });
      const lastBulletin = bulletinIdentity(studentCount - 1);
      await expect(
        restarted.bulletinSnapshotRepository().getLatest(lastBulletin.seriesKey),
      ).resolves.toMatchObject({ snapshotId: lastBulletin.snapshotId, snapshotVersion: 2 });
      await expect(
        restarted.councilDecisionStore().getCurrent(keys.at(-1)!),
      ).resolves.toMatchObject({ version: 1 });
      await expect(restarted.inspectSchema()).resolves.toMatchObject({
        status: 'ready',
        currentVersion: 5,
        pendingCount: 0,
      });
    } finally {
      raw.close();
    }
  });

  it('reverte append incompleto e preserva o último snapshot recuperável', async () => {
    const { raw, database } = await openEmptyDatabase();
    try {
      raw.exec(migrationSql().join('\n'));
      raw
        .prepare(
          `INSERT INTO academic_years (
             academic_year_id, school_id, year, current_version, created_at
           ) VALUES (?, 'school:readiness:rollback', 2026, 1, ?)`,
        )
        .run(durabilityYear2026, instant);
      const identity = bulletinIdentity(0);
      const initial = durabilitySnapshot(1, {
        academicYearId: durabilityYear2026,
        classGroupId: durabilityClassA,
        studentId: identity.studentId,
        enrollmentId: identity.enrollmentId,
        snapshotId: identity.snapshotId,
      });
      await createGradebookD1BulletinCouncilDurabilityV1(database).bulletinSnapshots.append(
        identity.seriesKey,
        initial,
        0,
      );

      const failingDatabase = {
        prepare(query: string) {
          if (query.includes('INSERT INTO bulletin_snapshot_versions')) {
            throw new Error('synthetic-private-payload-must-not-escape');
          }
          return database.prepare(query);
        },
        exec(query: string) {
          return database.exec(query);
        },
      } satisfies D1WriteDatabaseV1;
      const failing = createGradebookD1BulletinCouncilDurabilityV1(failingDatabase);

      await expect(
        failing.bulletinSnapshots.append(
          identity.seriesKey,
          durabilitySnapshot(2, {
            academicYearId: durabilityYear2026,
            classGroupId: durabilityClassA,
            studentId: identity.studentId,
            enrollmentId: identity.enrollmentId,
            snapshotId: identity.snapshotId,
          }),
          1,
        ),
      ).rejects.toMatchObject({ code: 'database-write-failed' });

      const recovered = createGradebookD1BulletinCouncilDurabilityV1(database).bulletinSnapshots;
      await expect(recovered.getLatest(identity.seriesKey)).resolves.toMatchObject({
        snapshotVersion: 1,
      });
      await expect(recovered.getHistorical(identity.snapshotId, 2)).resolves.toBeNull();
    } finally {
      raw.close();
    }
  });

  it('mantém produção fail-closed antes de consultar um binding apresentado', () => {
    const prepare = vi.fn();
    const binding = { prepare, exec: vi.fn() };

    expect(() =>
      createGradebookD1RuntimeV1(runtimeEnv(binding, 'production'), authorization),
    ).toThrow(expect.objectContaining({ code: 'runtime-environment-disabled' }));
    expect(prepare).not.toHaveBeenCalled();
  });
});
