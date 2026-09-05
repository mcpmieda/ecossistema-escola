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

async function openSchema5(): Promise<SqliteD1Database> {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  databases.push(raw);
  raw.exec('PRAGMA foreign_keys = ON;');
  for (const sql of migrationSql().slice(0, 5)) raw.exec(sql);
  return new SqliteD1Database(raw);
}

async function request(body?: BodyInit | null): Promise<Request> {
  const session = await seal(
    {
      oid: '45600000-0000-4000-8000-000000000456',
      name: 'Synthetic Initialize Administrator',
      username: 'initialize-admin@example.test',
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
    ...(body === undefined ? {} : { body }),
  });
}

function env(database?: SqliteD1Database): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: 'local',
    OFFICIAL_ORIGIN: LOCAL_ORIGIN,
    ...(database ? { GRADEBOOK_D1: database } : {}),
  };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('staging initialize server diagnostics', () => {
  it('accepts a semantic-empty body stream and reaches runtime diagnostics', async () => {
    const database = await openSchema5();
    const emptyBodyRequest = await request('');
    expect(emptyBodyRequest.body).not.toBeNull();

    const response = await handleGradebookImportStagingRequestV1(
      emptyBodyRequest,
      {
        ...env(database),
        RUNTIME_ENVIRONMENT: 'production',
        GRADEBOOK_PRODUCTION_ENABLED: 'false',
      },
      { runtime: { migrationSql: migrationSql() } },
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      state: 'runtime-review-required',
      reason: 'production-gate-disabled',
    });
  });

  it('rejects non-empty initialize content before processing staging', async () => {
    const database = await openSchema5();
    const response = await handleGradebookImportStagingRequestV1(
      await request('{}'),
      env(database),
      { runtime: { migrationSql: migrationSql() } },
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({ state: 'invalid-request' });
  });

  it('reports the production gate as a review-required state instead of generic unavailable', async () => {
    const database = await openSchema5();
    const response = await handleGradebookImportStagingRequestV1(
      await request(),
      {
        ...env(database),
        RUNTIME_ENVIRONMENT: 'production',
        GRADEBOOK_PRODUCTION_ENABLED: 'false',
      },
      { runtime: { migrationSql: migrationSql() } },
    );
    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      state: 'runtime-review-required',
      reason: 'production-gate-disabled',
    });
  });

  it('reports a missing D1 binding without exposing runtime details', async () => {
    const response = await handleGradebookImportStagingRequestV1(await request(), env());
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      state: 'unavailable',
      reason: 'storage-missing',
    });
  });

  it('reports an incompatible migration catalog explicitly', async () => {
    const database = await openSchema5();
    const response = await handleGradebookImportStagingRequestV1(
      await request(),
      env(database),
      { runtime: { migrationSql: [] } },
    );
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      state: 'unavailable',
      reason: 'migration-catalog-incompatible',
    });
  });
});
