import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { AuthorizationError } from '../../../../server/auth/roles';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  classifyGradebookD1MigrationApplyFailureV1,
  GradebookD1MigrationErrorV1,
  GradebookD1MigrationRunnerV1,
} from '../../../../server/gradebook/persistence/d1/runtime/d1-migration-runner-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../../server/gradebook/persistence/d1/schema/migrations';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
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

  it('aplica a 0006 por statements individuais quando batch não existe', async () => {
    const { raw, database } = await openDatabase();
    try {
      const sql = migrationSql();
      for (const migration of sql.slice(0, 5)) raw.exec(migration);
      const executed: string[] = [];
      const d1ShapedDatabase = {
        prepare(query: string) {
          return database.prepare(query);
        },
        exec(query: string) {
          if (/\r|\n/u.test(query)) {
            throw new Error('D1_EXEC_ERROR: incomplete input');
          }
          executed.push(query);
          return database.exec(query);
        },
      } satisfies D1WriteDatabaseV1;
      const runner = new GradebookD1MigrationRunnerV1(d1ShapedDatabase, { migrationSql: sql });

      await expect(runner.run(authorization)).resolves.toMatchObject({
        currentVersion: 6,
        migrationsApplied: 1,
      });
      expect(executed).toHaveLength(5);
      expect(executed.every((statement) => !/\r|\n/u.test(statement))).toBe(true);
      expect(executed.some((statement) => /^PRAGMA\s+foreign_keys/iu.test(statement))).toBe(false);
    } finally {
      raw.close();
    }
  });

  it('prefere um único batch atômico para a 0006 no shape do runtime D1', async () => {
    const { raw, database } = await openDatabase();
    try {
      const sql = migrationSql();
      for (const migration of sql.slice(0, 5)) raw.exec(migration);
      const prepared: string[] = [];
      let batchCalls = 0;
      const d1BatchDatabase = {
        prepare(query: string) {
          expect(query).not.toMatch(/\r|\n/u);
          expect(query).not.toMatch(/^PRAGMA\s+foreign_keys/iu);
          prepared.push(query);
          return database.prepare(query);
        },
        exec(): never {
          throw new Error('raw exec must not be used when batch is available');
        },
        async batch(
          statements: readonly D1WriteStatementV1[],
        ): Promise<readonly D1WriteRunResultV1[]> {
          batchCalls += 1;
          raw.exec('BEGIN IMMEDIATE');
          try {
            const results: D1WriteRunResultV1[] = [];
            for (const statement of statements) results.push(await statement.run());
            raw.exec('COMMIT');
            return results;
          } catch (cause) {
            raw.exec('ROLLBACK');
            throw cause;
          }
        },
      } satisfies D1WriteDatabaseV1;
      const runner = new GradebookD1MigrationRunnerV1(d1BatchDatabase, { migrationSql: sql });

      await expect(runner.run(authorization)).resolves.toMatchObject({
        currentVersion: 6,
        migrationsApplied: 1,
      });
      expect(batchCalls).toBe(1);
      expect(prepared).toHaveLength(5);
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

  it('classifica causas de aplicação somente por categorias sanitizadas', () => {
    const cases = [
      ['Exceeded CPU Time Limits error 1102', 'cpu-limit'],
      ['D1_ERROR: too many queries in one invocation', 'query-limit'],
      ['D1_ERROR: not authorized: SQLITE_AUTH', 'permission'],
      ['D1_ERROR: no such table: prerequisite_table', 'schema-prerequisite'],
      ['D1_ERROR: FOREIGN KEY constraint failed', 'foreign-key'],
      ['D1_ERROR: near STRICT: syntax error', 'sql-incompatible'],
      ['D1_EXEC_ERROR: CREATE TABLE example (: incomplete input: SQLITE_ERROR', 'sql-incompatible'],
      ['D1_ERROR: database is locked SQLITE_BUSY', 'database-busy'],
      ['opaque driver failure', 'unknown'],
    ] as const;

    for (const [message, expected] of cases) {
      expect(classifyGradebookD1MigrationApplyFailureV1(new Error(message))).toBe(expected);
    }
  });

  it('preserva somente o detalhe classificado quando a aplicação falha', async () => {
    const { raw, database } = await openDatabase();
    try {
      const sql = migrationSql();
      for (const migration of sql.slice(0, 5)) raw.exec(migration);
      const sensitive = "D1_ERROR: not authorized for token='secret-value' on student_name";
      const failingDatabase = {
        prepare(query: string) {
          return database.prepare(query);
        },
        exec(): never {
          throw new Error(sensitive);
        },
      } satisfies D1WriteDatabaseV1;
      const runner = new GradebookD1MigrationRunnerV1(failingDatabase, { migrationSql: sql });

      const error = await runner.run(authorization).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(GradebookD1MigrationErrorV1);
      expect(error).toMatchObject({ code: 'migration-apply-failed', detail: 'permission' });
      expect(String(error)).not.toContain('secret-value');
      expect(String(error)).not.toContain('student_name');
    } finally {
      raw.close();
    }
  });
});
