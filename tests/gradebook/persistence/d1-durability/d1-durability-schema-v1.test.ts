import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import { GradebookD1MigrationRunnerV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-migration-runner-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../../server/gradebook/persistence/d1/schema/migrations';
import { createGradebookD1BulletinCouncilDurabilityV1 } from '../../../../server/gradebook/persistence/d1/durability/d1-bulletin-council-durability-v1';
import { SqliteD1Database } from '../d1-transaction/d1-write-test-support';

const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });

function migrationSql(): readonly string[] {
  const directory = join(process.cwd(), 'migrations', 'gradebook');
  return GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.map((migration) =>
    readFileSync(join(directory, migration.fileName), 'utf8'),
  );
}

async function blankDatabase() {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  return { raw, database: new SqliteD1Database(raw) };
}

describe('migration 0004 de durabilidade Bulletin/Council V1', () => {
  it('é canônica e idempotente no runner local autorizado', async () => {
    const { raw, database } = await blankDatabase();
    try {
      expect(GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.map(({ version }) => version)).toEqual([
        1, 2, 3, 4,
      ]);
      expect(GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.at(-1)).toEqual({
        version: 4,
        name: 'bulletin_council_durability_v1',
        fileName: '0004_bulletin_council_durability_v1.sql',
      });
      const runner = new GradebookD1MigrationRunnerV1(database, {
        migrationSql: migrationSql(),
      });

      await expect(runner.run(authorization)).resolves.toMatchObject({
        result: 'applied',
        currentVersion: 4,
        latestVersion: 4,
        migrationsApplied: 4,
      });
      await expect(runner.run(authorization)).resolves.toMatchObject({
        result: 'up-to-date',
        currentVersion: 4,
        latestVersion: 4,
        migrationsApplied: 0,
      });
      raw.exec(migrationSql()[3] as string);
      expect(
        raw.prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version').all(),
      ).toEqual([
        { version: 1, name: 'gradebook_context_entities_imports_v1' },
        { version: 2, name: 'gradebook_records_audit_v1' },
        { version: 3, name: 'logical_source_record_catalog_v1' },
        { version: 4, name: 'bulletin_council_durability_v1' },
      ]);
      expect(
        raw
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .get(),
      ).toEqual({ count: 25 });
    } finally {
      raw.close();
    }
  });

  it('mantém quatro tabelas append-only sem cascade e índices para os access patterns', async () => {
    const { raw, database } = await blankDatabase();
    try {
      const runner = new GradebookD1MigrationRunnerV1(database, { migrationSql: migrationSql() });
      await runner.run(authorization);
      const tables = raw
        .prepare(
          `SELECT name FROM sqlite_master
            WHERE type = 'table'
              AND name IN (
                'bulletin_snapshot_streams', 'bulletin_snapshot_versions',
                'council_decision_streams', 'council_decision_versions'
              )
            ORDER BY name`,
        )
        .all();
      expect(tables).toEqual([
        { name: 'bulletin_snapshot_streams' },
        { name: 'bulletin_snapshot_versions' },
        { name: 'council_decision_streams' },
        { name: 'council_decision_versions' },
      ]);

      for (const table of [
        'bulletin_snapshot_streams',
        'bulletin_snapshot_versions',
        'council_decision_streams',
        'council_decision_versions',
      ]) {
        const foreignKeys = raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
          readonly on_delete: string;
        }[];
        expect(foreignKeys.every(({ on_delete }) => on_delete === 'NO ACTION')).toBe(true);
      }

      const bulletinStudentPlan = raw
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT snapshot_id, version FROM bulletin_snapshot_versions
            WHERE academic_year_id = ? AND class_group_id = ? AND student_id = ?
            ORDER BY emitted_at DESC, snapshot_id, version DESC LIMIT ?`,
        )
        .all('academic-year:synthetic:2026', 'class-group:synthetic:a', 'student:synthetic:a', 10);
      expect(JSON.stringify(bulletinStudentPlan)).toContain(
        'idx_bulletin_snapshot_versions_student_page',
      );

      const bulletinClassPlan = raw
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT snapshot_id, version FROM bulletin_snapshot_versions
            WHERE academic_year_id = ? AND class_group_id = ?
            ORDER BY emitted_at DESC, snapshot_id, version DESC LIMIT ?`,
        )
        .all('academic-year:synthetic:2026', 'class-group:synthetic:a', 10);
      expect(JSON.stringify(bulletinClassPlan)).toContain(
        'idx_bulletin_snapshot_versions_class_page',
      );

      const councilPlan = raw
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT version FROM council_decision_versions
            WHERE academic_year_id = ? AND class_reference = ? AND student_reference = ?
            ORDER BY version DESC LIMIT ?`,
        )
        .all('academic-year:synthetic:2026', 'class:synthetic:a', 'student:synthetic:a', 10);
      expect(JSON.stringify(councilPlan)).toContain('idx_council_decision_versions_history');
    } finally {
      raw.close();
    }
  });

  it('mantém toda DDL na 0004 e não introduz operação remota nos adapters/factory', () => {
    const sourceFiles = [
      'server/gradebook/persistence/d1/bulletins/d1-bulletin-snapshot-repository-v1.ts',
      'server/gradebook/persistence/d1/council/d1-council-decision-store-v1.ts',
      'server/gradebook/persistence/d1/durability/d1-bulletin-council-durability-v1.ts',
      'server/gradebook/persistence/d1/durability/d1-durability-transaction-v1.ts',
    ];
    const source = sourceFiles
      .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER)\b/iu);
    expect(source).not.toMatch(/\bfetch\s*\(|https?:\/\/|\bwrangler\b/iu);

    const migration = readFileSync(
      join(process.cwd(), 'migrations/gradebook/0004_bulletin_council_durability_v1.sql'),
      'utf8',
    );
    expect(migration.match(/CREATE TABLE IF NOT EXISTS/gu)).toHaveLength(4);
    expect(migration).not.toMatch(/\bDELETE\b|ON DELETE CASCADE/iu);
  });

  it('expõe a factory isolável e a compõe no runtime central somente após a #343', async () => {
    const { raw, database } = await blankDatabase();
    try {
      const durability = createGradebookD1BulletinCouncilDurabilityV1(database);
      expect(durability.bulletinSnapshots.constructor.name).toBe(
        'GradebookD1BulletinSnapshotRepositoryV1',
      );
      expect(durability.councilDecisions.constructor.name).toBe(
        'GradebookD1CouncilDecisionStoreV1',
      );
      const runtimeSource = readFileSync(
        join(process.cwd(), 'server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts'),
        'utf8',
      );
      expect(runtimeSource).toContain('createGradebookD1BulletinCouncilDurabilityV1(database)');
      expect(runtimeSource).toContain('this.durability.bulletinSnapshots');
      expect(runtimeSource).toContain('this.durability.councilDecisions');
    } finally {
      raw.close();
    }
  });
});
