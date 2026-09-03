import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

import { onRequest } from '../../../functions/[[path]]';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import {
  GRADEBOOK_D1_MIGRATIONS_ROUTE,
  GRADEBOOK_D1_STATUS_ROUTE,
  handleGradebookD1AdminRequestV1,
} from '../../../server/gradebook/http/d1-admin-routes-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../server/gradebook/persistence/d1/schema/migrations';
import { SqliteD1Database } from '../persistence/d1-transaction/d1-write-test-support';
import { testEnv } from '../../fixtures';

const LOCAL_ORIGIN = 'http://localhost:8788';
const PREVIEW_ORIGIN = 'https://issue-261.ecossistema-escola.pages.dev';

type TestRole = 'ADMINISTRADOR' | 'PROFESSOR';

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

function localEnv(database: unknown): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: 'local',
    OFFICIAL_ORIGIN: LOCAL_ORIGIN,
    GRADEBOOK_D1: database,
  };
}

async function sessionHeaders(role?: TestRole, origin?: string): Promise<Headers> {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (!role) return headers;

  const session = await seal(
    {
      oid: '11111111-1111-4111-8111-111111111111',
      name: 'Synthetic Administrator',
      username: 'synthetic@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  headers.set('Cookie', `${SESSION_COOKIE}=${session}`);
  return headers;
}

async function request(
  path: string,
  options: {
    readonly role?: TestRole;
    readonly method?: 'GET' | 'POST';
    readonly origin?: string;
  } = {},
): Promise<Request> {
  return new Request(`${LOCAL_ORIGIN}${path}`, {
    method: options.method ?? 'GET',
    headers: await sessionHeaders(options.role, options.origin),
  });
}

async function invoke(requestValue: Request, env: RuntimeEnv): Promise<Response> {
  return await onRequest({ request: requestValue, env } as never);
}

function requireResponse(response: Response | null): Response {
  if (!response) {
    throw new Error('Expected the synthetic administrative route to handle the request.');
  }
  return response;
}

describe('rotas administrativas do runtime D1 V1', () => {
  it('aceita somente origens coerentes com local, preview e produção', () => {
    expect(validateEnv(localEnv(undefined)).RUNTIME_ENVIRONMENT).toBe('local');
    expect(
      validateEnv({
        ...testEnv,
        RUNTIME_ENVIRONMENT: 'preview',
        OFFICIAL_ORIGIN: PREVIEW_ORIGIN,
      }).RUNTIME_ENVIRONMENT,
    ).toBe('preview');
    expect(validateEnv(testEnv).RUNTIME_ENVIRONMENT).toBe('production');

    expect(() =>
      validateEnv({
        ...testEnv,
        RUNTIME_ENVIRONMENT: 'production',
        OFFICIAL_ORIGIN: LOCAL_ORIGIN,
      }),
    ).toThrow('Runtime environment is invalid.');
  });

  it('retorna 401/403 com no-store sem tocar no armazenamento', async () => {
    const sensitive = 'binding-secret-academic-payload';
    const prepare = vi.fn(() => {
      throw new Error(sensitive);
    });
    const envValue = localEnv({ prepare, exec: vi.fn() });

    const unauthenticated = await invoke(await request(GRADEBOOK_D1_STATUS_ROUTE), envValue);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('Cache-Control')).toContain('no-store');
    expect(await unauthenticated.text()).not.toContain(sensitive);

    const forbidden = await invoke(
      await request(GRADEBOOK_D1_STATUS_ROUTE, { role: 'PROFESSOR' }),
      envValue,
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('Cache-Control')).toContain('no-store');
    expect(await forbidden.text()).not.toContain(sensitive);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('expõe somente um resumo sanitizado do schema para administrador', async () => {
    const { raw, database } = await openDatabase();
    try {
      const response = await handleGradebookD1AdminRequestV1(
        await request(GRADEBOOK_D1_STATUS_ROUTE, { role: 'ADMINISTRADOR' }),
        localEnv(database),
        { runtime: { migrationSql: migrationSql() } },
      );
      const handled = requireResponse(response);
      expect(handled.status).toBe(200);
      expect(handled.headers.get('Cache-Control')).toContain('no-store');
      await expect(handled.json()).resolves.toEqual({
        version: '1.0',
        capability: 'gradebook.persistence.admin',
        environment: 'local',
        schema: {
          status: 'pending',
          currentVersion: 0,
          latestVersion: 5,
          appliedCount: 0,
          pendingCount: 5,
        },
      });
    } finally {
      raw.close();
    }
  });

  it('aplica e reaplica migrations somente por POST same-origin sem corpo', async () => {
    const { raw, database } = await openDatabase();
    try {
      const envValue = localEnv(database);
      const routeOptions = { runtime: { migrationSql: migrationSql() } };
      const first = await handleGradebookD1AdminRequestV1(
        await request(GRADEBOOK_D1_MIGRATIONS_ROUTE, {
          role: 'ADMINISTRADOR',
          method: 'POST',
          origin: LOCAL_ORIGIN,
        }),
        envValue,
        routeOptions,
      );
      const second = await handleGradebookD1AdminRequestV1(
        await request(GRADEBOOK_D1_MIGRATIONS_ROUTE, {
          role: 'ADMINISTRADOR',
          method: 'POST',
          origin: LOCAL_ORIGIN,
        }),
        envValue,
        routeOptions,
      );

      const firstResponse = requireResponse(first);
      const secondResponse = requireResponse(second);
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.headers.get('Cache-Control')).toContain('no-store');
      const firstBody = JSON.stringify(await firstResponse.json());
      expect(firstBody).toContain('"result":"applied"');
      expect(firstBody).toContain('"migrationsApplied":5');
      expect(firstBody).not.toMatch(/CREATE TABLE|INSERT INTO|synthetic|SESSION_SECRET|GRADEBOOK_D1/u);

      expect(secondResponse.status).toBe(200);
      await expect(secondResponse.json()).resolves.toMatchObject({
        migration: { result: 'up-to-date', migrationsApplied: 0 },
      });
    } finally {
      raw.close();
    }
  });

  it('rejeita método, origem e corpo incorretos antes de executar migrations', async () => {
    const { raw, database } = await openDatabase();
    try {
      const envValue = localEnv(database);
      const wrongMethod = await invoke(
        await request(GRADEBOOK_D1_MIGRATIONS_ROUTE, { role: 'ADMINISTRADOR' }),
        envValue,
      );
      expect(wrongMethod.status).toBe(405);

      const wrongOrigin = await invoke(
        await request(GRADEBOOK_D1_MIGRATIONS_ROUTE, {
          role: 'ADMINISTRADOR',
          method: 'POST',
          origin: 'https://evil.test',
        }),
        envValue,
      );
      expect(wrongOrigin.status).toBe(403);

      const bodyRequest = new Request(`${LOCAL_ORIGIN}${GRADEBOOK_D1_MIGRATIONS_ROUTE}`, {
        method: 'POST',
        headers: await sessionHeaders('ADMINISTRADOR', LOCAL_ORIGIN),
        body: '{"grade":10}',
      });
      const bodyResponse = await invoke(bodyRequest, envValue);
      expect(bodyResponse.status).toBe(400);
      expect(await bodyResponse.text()).not.toContain('grade');

      const registry = raw
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'gradebook_schema_migrations'",
        )
        .get() as { count: number };
      expect(registry.count).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('permanece indisponível em produção e registra somente erro fixo', async () => {
    const sensitive = 'production-binding-secret';
    const prepare = vi.fn(() => {
      throw new Error(sensitive);
    });
    const productionEnv = {
      ...testEnv,
      RUNTIME_ENVIRONMENT: 'production',
      GRADEBOOK_D1: { prepare, exec: vi.fn() },
    } satisfies RuntimeEnv;
    const logging = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await invoke(
      new Request(`${testEnv.OFFICIAL_ORIGIN}${GRADEBOOK_D1_STATUS_ROUTE}`, {
        headers: await sessionHeaders('ADMINISTRADOR'),
      }),
      productionEnv,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const body = await response.text();
    expect(body).toContain('Academic persistence unavailable');
    expect(body).not.toContain(sensitive);
    expect(prepare).not.toHaveBeenCalled();
    expect(logging).toHaveBeenCalledTimes(1);
    expect(String(logging.mock.calls[0]?.[0])).not.toContain(sensitive);
    logging.mockRestore();
  });
});
