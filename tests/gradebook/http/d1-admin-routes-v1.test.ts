import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../../functions/[[path]]';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import { GRADEBOOK_PERSISTENCE_MIGRATIONS_ROUTE, GRADEBOOK_PERSISTENCE_STATUS_ROUTE,
  handleGradebookPersistenceAdminRequestV1 } from '../../../server/gradebook/http/persistence-admin-routes-v1';
import * as postgres from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { testEnv } from '../../fixtures';

const origins = { local: 'http://localhost:8788', preview: 'https://synthetic.pages.dev', production: testEnv.OFFICIAL_ORIGIN } as const;
type Runtime = keyof typeof origins;
type Role = 'ADMINISTRADOR' | 'PROFESSOR';
function environment(runtime: Runtime = 'local'): RuntimeEnv {
  return { ...testEnv, RUNTIME_ENVIRONMENT: runtime, OFFICIAL_ORIGIN: origins[runtime],
    GRADEBOOK_STORAGE_PROVIDER: 'postgres', GRADEBOOK_PRODUCTION_ENABLED: 'true',
    PROD_DB: { connectionString: 'postgres://synthetic.invalid/gradebook' } };
}
async function request(path: string, env: RuntimeEnv, options: { role?: Role; method?: string; origin?: string; body?: string } = {}) {
  const headers = new Headers({ Origin: options.origin ?? env.OFFICIAL_ORIGIN });
  if (options.role) {
    const token = await seal({ oid: '11111111-1111-4111-8111-111111111111', name: 'Synthetic',
      username: 'synthetic@example.test', roles: [options.role], exp: Math.floor(Date.now() / 1000) + 600 }, env.SESSION_SECRET);
    headers.set('Cookie', SESSION_COOKIE + '=' + token);
  }
  return new Request(env.OFFICIAL_ORIGIN + path, { method: options.method ?? (path === GRADEBOOK_PERSISTENCE_STATUS_ROUTE ? 'GET' : 'POST'),
    headers, ...(options.body === undefined ? {} : { body: options.body }) });
}
function nativeDatabase() {
  const database = { query: vi.fn(async () => [{ role: 'gradebook_app', ready: true }]),
    close: vi.fn(async () => undefined), lastFailure: vi.fn(() => null) };
  const create = vi.spyOn(postgres, 'createGradebookPostgresDatabaseV1')
    .mockResolvedValue(database as unknown as postgres.GradebookPostgresDatabaseV1);
  return { database, create };
}
afterEach(() => vi.restoreAllMocks());

describe('persistence administration after D1 retirement #1079', () => {
  it('keeps environment origin validation for local, preview and production', () => {
    for (const runtime of ['local', 'preview', 'production'] as const) {
      expect(validateEnv(environment(runtime)).RUNTIME_ENVIRONMENT).toBe(runtime);
      expect(() => validateEnv({ ...environment(runtime), OFFICIAL_ORIGIN: 'https://foreign.invalid' })).toThrow();
    }
  });
  it.each([[undefined, 401], ['PROFESSOR', 403]] as const)('preserves auth for %s before opening storage', async (role, status) => {
    const { create } = nativeDatabase();
    const env = environment();
    for (const path of [GRADEBOOK_PERSISTENCE_STATUS_ROUTE, GRADEBOOK_PERSISTENCE_MIGRATIONS_ROUTE]) {
      const response = await onRequest({ env, request: await request(path, env, { role }) } as never);
      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['local', 'preview', 'production'] as const)('retires migrations in %s without reading either binding', async (runtime) => {
    const { create } = nativeDatabase();
    const env = environment(runtime);
    const access = vi.fn(() => { throw new Error('retired-binding'); });
    Object.defineProperties(env, { GRADEBOOK_D1: { get: access }, GRADEBOOK_DATABASE: { get: access }, PROD_DB: { get: access } });
    for (const provider of ['d1', 'postgres', undefined] as const) {
      env.GRADEBOOK_STORAGE_PROVIDER = provider;
      env.GRADEBOOK_PRODUCTION_ENABLED = 'false';
      const response = await handleGradebookPersistenceAdminRequestV1(
        await request(GRADEBOOK_PERSISTENCE_MIGRATIONS_ROUTE, env, { role: 'ADMINISTRADOR' }), env);
      expect(response?.status).toBe(410);
      expect(response?.headers.get('Cache-Control')).toContain('no-store');
      await expect(response?.json()).resolves.toMatchObject({ state: 'retired', provider: 'postgres' });
    }
    expect(access).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['local', 'preview', 'production'] as const)('reports only PostgreSQL readiness in %s', async (runtime) => {
    const { database, create } = nativeDatabase();
    const env = environment(runtime);
    const access = vi.fn(() => { throw new Error('physical-d1-access'); });
    Object.defineProperty(env, 'GRADEBOOK_D1', { get: access });
    const response = await handleGradebookPersistenceAdminRequestV1(await request(GRADEBOOK_PERSISTENCE_STATUS_ROUTE, env, { role: 'ADMINISTRADOR' }), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(response?.headers.get('X-Gradebook-Storage-Provider')).toBe('postgres');
    await expect(response?.json()).resolves.toMatchObject({
      version: '2.0', provider: 'postgres', capability: 'gradebook.persistence.admin',
      environment: runtime, schema: { status: 'ready' },
    });
    expect(create).toHaveBeenCalledOnce();
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('current_user AS role'), []);
    expect(database.close).toHaveBeenCalledOnce();
    expect(access).not.toHaveBeenCalled();
  });
  it('fails closed on missing provider or disabled production before opening storage', async () => {
    const { create } = nativeDatabase();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const runtime of ['local', 'preview', 'production'] as const) {
      const env = environment(runtime);
      env.GRADEBOOK_STORAGE_PROVIDER = 'd1';
      const response = await handleGradebookPersistenceAdminRequestV1(await request(GRADEBOOK_PERSISTENCE_STATUS_ROUTE, env, { role: 'ADMINISTRADOR' }), env);
      expect(response?.status).toBe(503);
    }
    const disabled = { ...environment('production'), GRADEBOOK_PRODUCTION_ENABLED: 'false' as const };
    expect((await handleGradebookPersistenceAdminRequestV1(await request(GRADEBOOK_PERSISTENCE_STATUS_ROUTE, disabled, { role: 'ADMINISTRADOR' }), disabled))?.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
    expect(log.mock.calls.every(([message]) => message === JSON.stringify({ message: 'gradebook_persistence_unavailable', provider: 'unconfigured' }))).toBe(true);
  });
  it('rejects method, origin and request body before retiring migrations', async () => {
    const { create } = nativeDatabase();
    const env = environment();
    for (const [options, status] of [
      [{ method: 'GET' }, 405], [{ origin: 'https://foreign.invalid' }, 403], [{ body: '{}' }, 400],
    ] as const) {
      const response = await onRequest({ env, request: await request(GRADEBOOK_PERSISTENCE_MIGRATIONS_ROUTE, env, { role: 'ADMINISTRADOR', ...options }) } as never);
      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
    expect(create).not.toHaveBeenCalled();
  });
  it('sanitizes failed PostgreSQL probes and closes the connection', async () => {
    const { database } = nativeDatabase();
    database.query.mockRejectedValue(new Error('synthetic-sensitive-connection'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = environment('production');
    const response = await handleGradebookPersistenceAdminRequestV1(await request(GRADEBOOK_PERSISTENCE_STATUS_ROUTE, env, { role: 'ADMINISTRADOR' }), env);
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('synthetic-sensitive');
    expect(log).toHaveBeenCalledWith(JSON.stringify({ message: 'gradebook_persistence_unavailable', provider: 'postgres' }));
    expect(database.close).toHaveBeenCalledOnce();
  });
});
