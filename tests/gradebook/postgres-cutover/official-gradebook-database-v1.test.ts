import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEnv } from '../../../server/env';
import type { GradebookPostgresDatabaseV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import {
  GRADEBOOK_POSTGRES_FAILURE_HEADER_V1,
  withOfficialGradebookDatabaseV1,
} from '../../../server/gradebook/persistence/postgres/official-gradebook-database-v1';

function database() {
  return {
    prepare: vi.fn(),
    exec: vi.fn(),
    batch: vi.fn(),
    transaction: vi.fn(),
    lastFailure: vi.fn(() => null),
    close: vi.fn(async () => undefined),
  } as unknown as GradebookPostgresDatabaseV1;
}

describe('official gradebook database cutover gate', () => {
  it('uses only Postgres when the production gate selects Postgres', async () => {
    const d1 = {
      prepare: vi.fn(() => {
        throw new Error('D1 must stay read-only');
      }),
      exec: vi.fn(),
    };
    const postgres = database();
    const createPostgresDatabase = vi.fn(async () => postgres);
    const operation = vi.fn(async (env: RuntimeEnv) => {
      expect(env.GRADEBOOK_D1).toBe(postgres);
      return Response.json({ ok: true });
    });

    const response = await withOfficialGradebookDatabaseV1(
      {
        GRADEBOOK_STORAGE_PROVIDER: 'postgres',
        GRADEBOOK_D1: d1,
        PROD_DB: { connectionString: 'postgres://hyperdrive.invalid/gradebook' },
      } as RuntimeEnv,
      operation,
      { createPostgresDatabase },
    );

    expect(response?.headers.get('X-Gradebook-Storage-Provider')).toBe('postgres');
    expect(createPostgresDatabase).toHaveBeenCalledOnce();
    expect(d1.prepare).not.toHaveBeenCalled();
    expect(postgres.close).toHaveBeenCalledOnce();
  });

  it('exposes only the closed Postgres diagnostic on failed official responses', async () => {
    const postgres = database();
    vi.mocked(postgres.lastFailure).mockReturnValue({
      operation: 'SELECT',
      relation: 'source_file_streams',
      errorType: 'PostgresError',
      sqlState: '42883',
      category: 'unknown',
    });

    const response = await withOfficialGradebookDatabaseV1(
      {
        GRADEBOOK_STORAGE_PROVIDER: 'postgres',
        PROD_DB: { connectionString: 'postgres://hyperdrive.invalid/gradebook' },
      } as RuntimeEnv,
      async () => Response.json({ state: 'unavailable' }, { status: 503 }),
      { createPostgresDatabase: async () => postgres },
    );

    expect(JSON.parse(response!.headers.get(GRADEBOOK_POSTGRES_FAILURE_HEADER_V1)!)).toEqual({
      operation: 'SELECT',
      relation: 'source_file_streams',
      errorType: 'PostgresError',
      sqlState: '42883',
      category: 'unknown',
    });
    expect(response!.headers.get(GRADEBOOK_POSTGRES_FAILURE_HEADER_V1)).not.toContain('hyperdrive');
    expect(postgres.close).toHaveBeenCalledOnce();
  });

  it('switches back to the preserved D1 without opening Postgres', async () => {
    const d1 = { prepare: vi.fn(), exec: vi.fn() };
    const createPostgresDatabase = vi.fn();
    const operation = vi.fn(async (env: RuntimeEnv) => {
      expect(env.GRADEBOOK_D1).toBe(d1);
      return new Response(null, { status: 204 });
    });

    const response = await withOfficialGradebookDatabaseV1(
      { GRADEBOOK_STORAGE_PROVIDER: 'd1', GRADEBOOK_D1: d1 } as RuntimeEnv,
      operation,
      { createPostgresDatabase },
    );

    expect(response?.headers.get('X-Gradebook-Storage-Provider')).toBe('d1');
    expect(createPostgresDatabase).not.toHaveBeenCalled();
  });

  it('fails closed when the selected provider binding is absent', async () => {
    await expect(
      withOfficialGradebookDatabaseV1(
        { GRADEBOOK_STORAGE_PROVIDER: 'postgres', GRADEBOOK_D1: database() } as RuntimeEnv,
        async () => null,
      ),
    ).rejects.toThrow('gradebook-official-postgres-binding-missing');
  });

  it('closes Postgres even when an official operation fails', async () => {
    const postgres = database();
    await expect(
      withOfficialGradebookDatabaseV1(
        {
          GRADEBOOK_STORAGE_PROVIDER: 'postgres',
          PROD_DB: { connectionString: 'postgres://hyperdrive.invalid/gradebook' },
        } as RuntimeEnv,
        async () => {
          throw new Error('synthetic-operation-failed');
        },
        { createPostgresDatabase: async () => postgres },
      ),
    ).rejects.toThrow('synthetic-operation-failed');
    expect(postgres.close).toHaveBeenCalledOnce();
  });
});
