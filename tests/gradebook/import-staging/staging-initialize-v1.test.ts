import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { handleGradebookImportStagingRequestV1 } from '../../../server/gradebook/http/import-staging-routes-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../server/gradebook/persistence/d1/schema/migrations';
import { SqliteD1Database } from '../persistence/d1-transaction/d1-write-test-support';
import { testEnv } from '../../fixtures';

const LOCAL_ORIGIN = 'http://localhost:8788';
const databases: DatabaseSync[] = [];

function migrationSql(): readonly string[] {
  const directory = join(process.cwd(), 'migrations', 'gradebook');
  return GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.map((migration) =>
    readFileSync(join(directory, migration.fileName), 'utf8'),
  );
}

async function openSchema5(): Promise<{
  readonly raw: DatabaseSync;
  readonly database: SqliteD1Database;
}> {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  databases.push(raw);
  raw.exec('PRAGMA foreign_keys = ON;');
  for (const sql of migrationSql().slice(0, 5)) raw.exec(sql);
  return { raw, database: new SqliteD1Database(raw) };
}

function env(database: SqliteD1Database): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: 'local',
    OFFICIAL_ORIGIN: LOCAL_ORIGIN,
    GRADEBOOK_D1: database,
  };
}

async function initializeRequest(): Promise<Request> {
  const session = await seal(
    {
      oid: '45400000-0000-4000-8000-000000000454',
      name: 'Synthetic Staging Administrator',
      username: 'staging-admin@example.test',
      roles: ['ADMINISTRADOR' as const],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  return new Request(`${LOCAL_ORIGIN}/api/gradebook/import-staging?action=initialize`, {
    method: 'POST',
    headers: {
      Origin: LOCAL_ORIGIN,
      Cookie: `${SESSION_COOKIE}=${session}`,
    },
  });
}

async function initialize(database: SqliteD1Database): Promise<Response> {
  const response = await handleGradebookImportStagingRequestV1(
    await initializeRequest(),
    env(database),
    { runtime: { migrationSql: migrationSql() } },
  );
  if (!response) throw new Error('staging initialize route was not handled');
  return response;
}

function addAcademicYear(raw: DatabaseSync): void {
  raw.prepare(
    `INSERT INTO academic_years (
       academic_year_id, school_id, year, current_version, created_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    'academic-year:454:2026',
    'school:454',
    2026,
    1,
    '2026-09-05T09:00:00.000Z',
  );
}

function addSourceFileResidue(raw: DatabaseSync): void {
  raw.prepare(
    `INSERT INTO source_file_streams (
       academic_year_id, manifest_id, current_version, current_sha256, created_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    'academic-year:454:2026',
    'manifest:synthetic-residue',
    1,
    'a'.repeat(64),
    '2026-09-05T09:00:00.000Z',
  );
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('staging authenticated initialization', () => {
  it('applies exactly migration 0006 from a clean schema 5 baseline', async () => {
    const { raw, database } = await openSchema5();
    const response = await initialize(database);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ state: 'ready', schemaVersion: 6 });
    const versions = raw
      .prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version')
      .all() as readonly { version: number; name: string }[];
    expect(versions).toHaveLength(6);
    expect(versions.at(-1)).toEqual({ version: 6, name: 'import_staging_v1' });
    const tables = raw
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('gradebook_import_stage_sessions','gradebook_import_stage_chunks')",
      )
      .get() as { count: number };
    expect(tables.count).toBe(2);
  });

  it('blocks a pre-staging official residue after migrating and exposes counts only', async () => {
    const { raw, database } = await openSchema5();
    addAcademicYear(raw);
    addSourceFileResidue(raw);

    const response = await initialize(database);
    expect(response.status).toBe(409);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.state).toBe('baseline-review-required');
    expect(body.schemaVersion).toBe(6);
    expect(body.counts).toMatchObject({
      sourceFiles: 1,
      stageSessions: 0,
      stageChunks: 0,
      gradeEntries: 0,
      associations: 0,
    });
    expect(JSON.stringify(body)).not.toMatch(/manifest:synthetic-residue|[0-9a-f]{64}/u);
    expect(
      (raw.prepare('SELECT COUNT(*) AS count FROM gradebook_import_stage_sessions').get() as { count: number })
        .count,
    ).toBe(0);
  });

  it('does not block legitimate later imports after a staging session already exists', async () => {
    const { raw, database } = await openSchema5();
    addAcademicYear(raw);
    expect((await initialize(database)).status).toBe(200);

    raw.prepare(
      `INSERT INTO gradebook_import_stage_sessions (
         session_id, academic_year_id, source_sha256, expected_chunk_count, state,
         metadata_json, meta_write_json, result_json, created_at, updated_at, expires_at, committed_at
       ) VALUES (?, ?, ?, ?, 'preparing', ?, NULL, NULL, ?, ?, ?, NULL)`,
    ).run(
      'gradebook-import-stage:synthetic-454',
      'academic-year:454:2026',
      'b'.repeat(64),
      1,
      '{}',
      '2026-09-05T09:00:00.000Z',
      '2026-09-05T09:00:00.000Z',
      '2026-09-05T11:00:00.000Z',
    );
    addSourceFileResidue(raw);

    const response = await initialize(database);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: 'ready', schemaVersion: 6 });
    expect(
      (raw.prepare('SELECT COUNT(*) AS count FROM gradebook_schema_migrations').get() as { count: number })
        .count,
    ).toBe(6);
  });
});
