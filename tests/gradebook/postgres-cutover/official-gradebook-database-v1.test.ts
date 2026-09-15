import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEnv } from '../../../server/env';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type { GradebookPostgresDatabaseV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { GRADEBOOK_POSTGRES_FAILURE_HEADER_V1, withOfficialGradebookDatabaseV1 } from '../../../server/gradebook/persistence/postgres/official-gradebook-database-v1';

function database() {
  const statement = { bind: vi.fn(), first: vi.fn(async () => ({ ok: 1 })), all: vi.fn(async () => ({ results: [] })), run: vi.fn(async () => ({ changes: 1 })) };
  statement.bind.mockReturnValue(statement);
  const value = { prepare: vi.fn(() => statement), exec: vi.fn(async () => undefined),
    batch: vi.fn(async () => [{ changes: 1 }]),
    transaction: vi.fn(async (run: (tx: D1WriteDatabaseV1) => Promise<unknown>) => run(value as unknown as D1WriteDatabaseV1)),
    lastFailure: vi.fn(() => null), close: vi.fn(async () => undefined) };
  return value as unknown as GradebookPostgresDatabaseV1;
}
const env = () => ({ GRADEBOOK_STORAGE_PROVIDER: 'postgres',
  PROD_DB: { connectionString: 'postgres://hyperdrive.invalid/gradebook' } }) as RuntimeEnv;
const injected = (execution: RuntimeEnv) => execution.GRADEBOOK_D1 as GradebookPostgresDatabaseV1;

describe('official gradebook PostgreSQL authority #806', () => {
  it('uses only Postgres and opens at the first real operation, not during route construction', async () => {
    const postgres = database();
    const createPostgresDatabase = vi.fn(async () => postgres);
    const input = env();
    Object.defineProperty(input, 'GRADEBOOK_D1', { enumerable: true, get: () => { throw new Error('Legacy binding must not be read'); } });
    const response = await withOfficialGradebookDatabaseV1(input, async (execution) => {
      const statement = injected(execution).prepare('SELECT ? AS ok').bind(1);
      expect(createPostgresDatabase).not.toHaveBeenCalled();
      expect(await statement.first()).toEqual({ ok: 1 });
      return Response.json({ ok: true });
    }, { createPostgresDatabase });
    expect(response?.headers.get('X-Gradebook-Storage-Provider')).toBe('postgres');
    expect(createPostgresDatabase).toHaveBeenCalledOnce();
    expect(postgres.close).toHaveBeenCalledOnce();
  });
  it('shares one request-local connection for concurrent reads and preserves physical batch and transaction calls', async () => {
    const postgres = database(); const createPostgresDatabase = vi.fn(async () => postgres);
    await withOfficialGradebookDatabaseV1(env(), async (execution) => {
      const db = injected(execution);
      await Promise.all([db.prepare('SELECT 1').first(), db.prepare('SELECT 2').all()]);
      await db.batch!([db.prepare('SELECT ?').bind(3)]);
      await db.transaction(async (tx) => { expect(tx).toBe(postgres); return tx.exec('SELECT 4'); });
      return new Response(null, { status: 204 });
    }, { createPostgresDatabase });
    expect(createPostgresDatabase).toHaveBeenCalledOnce();
    expect(postgres.batch).toHaveBeenCalledOnce();
    expect(postgres.transaction).toHaveBeenCalledOnce();
    expect(postgres.close).toHaveBeenCalledOnce();
  });
  it('exposes only the closed Postgres diagnostic on failed official responses', async () => {
    const postgres = database();
    const diagnostic = { operation: 'SELECT', relation: 'source_file_streams', errorType: 'PostgresError', sqlState: '42883', category: 'unknown' as const };
    vi.mocked(postgres.lastFailure).mockReturnValue(diagnostic);
    const response = await withOfficialGradebookDatabaseV1(env(), async (execution) => {
      await injected(execution).prepare('SELECT 1').first();
      return Response.json({ state: 'unavailable' }, { status: 503 });
    }, { createPostgresDatabase: async () => postgres });
    expect(JSON.parse(response!.headers.get(GRADEBOOK_POSTGRES_FAILURE_HEADER_V1)!)).toEqual(diagnostic);
    expect(response!.headers.get(GRADEBOOK_POSTGRES_FAILURE_HEADER_V1)).not.toContain('hyperdrive');
    expect(postgres.close).toHaveBeenCalledOnce();
  });
  it.each([undefined, 'd1'])('never reads either store for invalid production provider %s', async (provider) => {
    const createPostgresDatabase = vi.fn(); const legacy = { prepare: vi.fn(), exec: vi.fn() };
    const response = await withOfficialGradebookDatabaseV1({ GRADEBOOK_STORAGE_PROVIDER: provider,
      GRADEBOOK_D1: legacy } as RuntimeEnv, async (execution) => {
      expect(execution.GRADEBOOK_D1).not.toBe(legacy);
      await expect(injected(execution).prepare('SELECT 1').first()).rejects.toThrow('provider-required');
      return Response.json({ contractVersion: 1, state: 'unavailable' }, { status: 503 });
    }, { createPostgresDatabase });
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ contractVersion: 1, state: 'unavailable' });
    expect(response?.headers.get('X-Gradebook-Storage-Provider')).toBe('unconfigured');
    expect(createPostgresDatabase).not.toHaveBeenCalled(); expect(legacy.prepare).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404])('preserves route status %i before inspecting unconfigured storage', async (status) => {
    const createPostgresDatabase = vi.fn();
    const response = await withOfficialGradebookDatabaseV1({} as RuntimeEnv,
      async () => Response.json({ contractVersion: 2, state: 'not-authorized' }, { status }), { createPostgresDatabase });
    expect(response?.status).toBe(status); expect(createPostgresDatabase).not.toHaveBeenCalled();
  });
  it('does not need a binding for a rejected or unmatched route', async () => {
    const input = { GRADEBOOK_STORAGE_PROVIDER: 'postgres' } as RuntimeEnv;
    const createPostgresDatabase = vi.fn();
    expect((await withOfficialGradebookDatabaseV1(input, async () => new Response(null, { status: 401 }), { createPostgresDatabase }))?.status).toBe(401);
    expect(await withOfficialGradebookDatabaseV1(input, async () => null, { createPostgresDatabase })).toBeNull();
    expect(createPostgresDatabase).not.toHaveBeenCalled();
  });
  it('retains explicit local legacy fixtures without opening Postgres', async () => {
    const d1 = { prepare: vi.fn(), exec: vi.fn() }; const createPostgresDatabase = vi.fn();
    const response = await withOfficialGradebookDatabaseV1({ RUNTIME_ENVIRONMENT: 'local', GRADEBOOK_STORAGE_PROVIDER: 'd1', GRADEBOOK_D1: d1 } as RuntimeEnv,
      async (execution) => { expect(execution.GRADEBOOK_D1).toBe(d1); return new Response(null, { status: 204 }); }, { createPostgresDatabase });
    expect(response?.headers.get('X-Gradebook-Storage-Provider')).toBe('d1'); expect(createPostgresDatabase).not.toHaveBeenCalled();
  });
  it('fails closed when an authorized operation actually needs the missing selected binding', async () => {
    await expect(withOfficialGradebookDatabaseV1({ GRADEBOOK_STORAGE_PROVIDER: 'postgres', GRADEBOOK_D1: database() } as RuntimeEnv,
      async (execution) => { await injected(execution).exec('SELECT 1'); return null; })).rejects.toThrow('gradebook-official-postgres-binding-missing');
  });
  it('closes an acquired Postgres connection even when the operation fails', async () => {
    const postgres = database();
    await expect(withOfficialGradebookDatabaseV1(env(), async (execution) => {
      await injected(execution).exec('SELECT 1'); throw new Error('synthetic-operation-failed');
    }, { createPostgresDatabase: async () => postgres })).rejects.toThrow('synthetic-operation-failed');
    expect(postgres.close).toHaveBeenCalledOnce();
  });
});
