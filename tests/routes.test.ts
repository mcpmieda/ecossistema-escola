import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/[[path]]';
import { SESSION_COOKIE } from '../server/auth/session';
import { seal } from '../server/auth/sealed';
import { testEnv } from './fixtures';

function logoutRequest(origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  return new Request(`${testEnv.OFFICIAL_ORIGIN}/auth/logout`, {
    method: 'POST',
    headers,
  });
}

async function invoke(request: Request): Promise<Response> {
  return await onRequest({ request, env: testEnv } as never);
}

async function platformRequest(roles?: Array<'ADMINISTRADOR' | 'PROFESSOR'>): Promise<Request> {
  const headers = new Headers();
  if (roles) {
    const session = await seal(
      {
        oid: '11111111-1111-4111-8111-111111111111',
        name: 'Usuário de teste',
        username: 'teste@escolaieda.com',
        roles,
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      testEnv.SESSION_SECRET,
    );
    headers.set('Cookie', `${SESSION_COOKIE}=${session}`);
  }
  return new Request(`${testEnv.OFFICIAL_ORIGIN}/api/platform/snapshot`, {
    method: 'GET',
    headers,
  });
}

describe('logout route', () => {
  it('clears the session for an exact same-origin POST', async () => {
    const response = await invoke(logoutRequest(testEnv.OFFICIAL_ORIGIN));

    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-ecossistema_session=');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
  });

  it.each([undefined, 'null', 'https://evil.test'])(
    'rejects an untrusted write Origin: %s',
    async (origin) => {
      const response = await invoke(logoutRequest(origin));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: 'Invalid origin' });
    },
  );
});

describe('platform snapshot authorization', () => {
  it('rejects requests without an authenticated session', async () => {
    const response = await invoke(await platformRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' });
  });

  it('rejects authenticated users without the administrator role', async () => {
    const response = await invoke(await platformRequest(['PROFESSOR']));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' });
  });
});
