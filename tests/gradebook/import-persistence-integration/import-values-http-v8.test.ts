import { describe, it, expect, vi } from 'vitest';
import { handleGradebookImportPersistenceRequestV4 } from '../../../server/gradebook/http/import-persistence-routes-v2';
import {
  valuesRequestV8,
  seededValuesDatabaseV8,
  AtomicMeasuredDatabaseV8,
} from './values-v8-test-support';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import { testEnv } from '../../fixtures';
import { GRADEBOOK_IMPORT_FAILURE_HEADER_V1 } from '../../../shared/gradebook-import-diagnostics-v1';

async function send(
  binding: unknown,
  role = 'ADMINISTRADOR',
  body: unknown = valuesRequestV8(),
  originHeader = 'http://localhost:8788',
) {
  const origin = 'http://localhost:8788';
  const cookie = await seal(
    {
      oid: '00000000-0000-4000-8000-000000000561',
      name: 'Pessoa Sintética',
      username: 'synthetic@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  return handleGradebookImportPersistenceRequestV4(
    new Request(`${origin}/api/gradebook/import-persistence`, {
      method: 'POST',
      headers: {
        Origin: originHeader,
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE}=${cookie}`,
      },
      body: JSON.stringify(body),
    }),
    { ...testEnv, OFFICIAL_ORIGIN: origin, RUNTIME_ENVIRONMENT: 'local', GRADEBOOK_D1: binding },
  );
}
describe('Authorized V8 HTTP integration', () => {
  it('confirms V8 writes and reimports with no failure header', async () => {
    const base = await seededValuesDatabaseV8();
    try {
      const db = new AtomicMeasuredDatabaseV8(base);
      for (const state of ['applied', 'no-changes']) {
        const response = await send(db);
        expect(response?.status).toBe(200);
        expect(response?.headers.get('Cache-Control')).toContain('no-store');
        expect(response?.headers.has(GRADEBOOK_IMPORT_FAILURE_HEADER_V1)).toBe(false);
        expect(await response?.json()).toMatchObject({ transportVersion: 8, state });
      }
    } finally {
      base.raw.close();
    }
  });
  it('rejects insufficient permission and cross-origin calls before touching D1', async () => {
    const prepare = vi.fn(() => {
      throw new Error('must not run');
    });
    const binding = { prepare, exec: vi.fn(), batch: vi.fn() };
    const forbidden = await send(binding, 'PROFESSOR');
    expect(forbidden?.status).toBe(403);
    expect(forbidden?.headers.has(GRADEBOOK_IMPORT_FAILURE_HEADER_V1)).toBe(false);
    await expect(
      send(binding, 'ADMINISTRADOR', valuesRequestV8(), 'https://other.example.test'),
    ).rejects.toMatchObject({ status: 403 });
    expect(prepare).not.toHaveBeenCalled();
  });
  it('rejects the unknown value policy before reading or writing D1', async () => {
    const prepare = vi.fn();
    const response = await send({ prepare, exec: vi.fn() }, 'ADMINISTRADOR', {
      ...valuesRequestV8(),
      valuePolicy: 'incorrect',
    });
    expect(response?.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });
});
