import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { AuthorizationError } from '../../../../server/auth/roles';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  GradebookD1MigrationErrorV1,
  GradebookD1MigrationRunnerV1,
} from '../../../../server/gradebook/persistence/d1/runtime/d1-migration-runner-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../../server/gradebook/persistence/d1/schema/migrations';
import type { D1WriteDatabaseV1 } from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { SqliteD1Database } from '../d1-transaction/d1-write-test-support';

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

describe('runner autorizado de migrations D1 V1', () => {
  it('aplica 0001–0006 na ordem canônica e reaplica sem efeitos', async () => {
    const { raw, database } = await openDatabase();
    try {
      const runner = new GradebookD1MigrationRunnerV1(database, {
        migrationSql: migrationSql(),
      });

      await expect(runner.inspect(authorization)).resolves.toEqual({
        status: 'pending',
        currentVersion: 0,
        latestVersion: 6,
        appliedCount: 0,
        pendingCount: 6,
      });
      await expect(runner.run(authorization)).resolves.toEqual({
        result: 'applied',
        status: 'ready',
        currentVersion: 6,
        latestVersion: 6,
        appliedCount: 6,
        pendingCount: 0,
        migrationsApplied: 6,
      });
      await expect(runner.run(authorization)).resolves.toEqual({
        result: 'up-to-date',
        status: 'ready',
        currentVersion: 6,
        latestVersion: 6,
        appliedCount: 6,
        pendingCount: 0,
        migrationsApplied: 0,
      });

      const rows = raw
        .prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version')
        .all();
      expect(rows).toEqual(
        GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.map(({ version, name }) => ({ version, name })),
      );
    } finally {
      raw.close();
    }
  });

  it('rejeita lacuna ou versão fora da sequência do catálogo persistido', async () => {
    const { raw, database } = await openDatabase();
    try {
      raw.exec(`
        CREATE TABLE gradebook_schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL
        );
        INSERT INTO gradebook_schema_migrations (version, name, applied_at)
        VALUES (2, 'gradebook_records_audit_v1', '2026-09-01T00:00:00.000Z');
      `);
      const runner = new GradebookD1MigrationRunnerV1(database, {
        migrationSql: migrationSql(),
      });

      await expect(runner.inspect(authorization)).rejects.toMatchObject({
        code: 'migration-catalog-incompatible',
      });
    } finally {
      raw.close();
    }
  });

  it('confere o registro de versão e nome contido em cada arquivo SQL', async () => {
    const { raw, database } = await openDatabase();
    try {
      const source = [...migrationSql()];
      const secondMigration = source[1];
      if (!secondMigration) throw new Error('Synthetic migration fixture is incomplete.');
      source[1] = secondMigration.replace(
        'gradebook_records_audit_v1',
        'unexpected-catalog-name',
      );
      const runner = new GradebookD1MigrationRunnerV1(database, { migrationSql: source });

      const error = await runner.run(authorization).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(GradebookD1MigrationErrorV1);
      expect(error).toMatchObject({ code: 'migration-catalog-incompatible' });
      expect(String(error)).not.toContain('unexpected-catalog-name');
    } finally {
      raw.close();
    }
  });

  it('exige uma autorização emitida após a capability administrativa', async () => {
    const { raw, database } = await openDatabase();
    try {
      const runner = new GradebookD1MigrationRunnerV1(database, {
        migrationSql: migrationSql(),
      });

      await expect(runner.inspect({} as never)).rejects.toBeInstanceOf(AuthorizationError);
    } finally {
      raw.close();
    }
  });

  it('sanitiza falhas do driver sem incorporar SQL, parâmetros ou secrets', async () => {
    const sensitive = "SELECT student_name, grade FROM secret_table WHERE token = 'secret-value'";
    const database = {
      prepare(): never {
        throw new Error(sensitive);
      },
      exec(): never {
        throw new Error(sensitive);
      },
    } satisfies D1WriteDatabaseV1;
    const runner = new GradebookD1MigrationRunnerV1(database, {
      migrationSql: migrationSql(),
    });

    const error = await runner.inspect(authorization).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(GradebookD1MigrationErrorV1);
    expect(error).toMatchObject({ code: 'migration-read-failed' });
    expect(String(error)).not.toContain('student_name');
    expect(String(error)).not.toContain('grade');
    expect(String(error)).not.toContain('secret-value');
  });
});
