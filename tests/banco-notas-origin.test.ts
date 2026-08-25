import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/[[path]]';
import { SESSION_COOKIE } from '../server/auth/session';
import { seal } from '../server/auth/sealed';
import { testEnv } from './fixtures';

async function adminCookie(): Promise<string> {
  const session = await seal(
    {
      oid: '11111111-1111-4111-8111-111111111111',
      name: 'Administrador sintético',
      username: 'admin@escolaieda.com',
      roles: ['ADMINISTRADOR'],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  return `${SESSION_COOKIE}=${session}`;
}

async function invoke(request: Request): Promise<Response> {
  return await onRequest({ request, env: testEnv } as never);
}

describe('Banco de Notas mutation origin protection', () => {
  it('rejects a cross-origin source mutation before touching storage', async () => {
    const response = await invoke(
      new Request(`${testEnv.OFFICIAL_ORIGIN}/api/banco-notas/v1/data-sources`, {
        method: 'POST',
        headers: {
          Cookie: await adminCookie(),
          Origin: 'https://evil.test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schoolYearId: '11111111-1111-4111-8111-111111111111',
          type: 'legacy_import',
          name: 'Fonte sintética',
          description: '',
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid origin' });
  });

  it('accepts the official Origin gate and then fails closed when homologation storage is absent', async () => {
    const response = await invoke(
      new Request(`${testEnv.OFFICIAL_ORIGIN}/api/banco-notas/v1/data-sources`, {
        method: 'POST',
        headers: {
          Cookie: await adminCookie(),
          Origin: testEnv.OFFICIAL_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schoolYearId: '11111111-1111-4111-8111-111111111111',
          type: 'legacy_import',
          name: 'Fonte sintética',
          description: '',
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Banco de Notas storage unavailable',
    });
  });
});
