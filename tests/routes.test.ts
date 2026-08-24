import { describe, expect, it } from 'vitest';
import { PLATFORM_CAPABILITIES } from '../shared/platform-contract';
import { onRequest } from '../functions/[[path]]';
import { SESSION_COOKIE } from '../server/auth/session';
import { seal } from '../server/auth/sealed';
import { testEnv } from './fixtures';

type TestRole = 'ADMINISTRADOR' | 'PROFESSOR';

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

async function sessionHeaders(roles?: TestRole[]): Promise<Headers> {
  const headers = new Headers();
  if (!roles) return headers;
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
  return headers;
}

async function authenticatedRequest(path: string, roles?: TestRole[]): Promise<Request> {
  return new Request(`${testEnv.OFFICIAL_ORIGIN}${path}`, {
    method: 'GET',
    headers: await sessionHeaders(roles),
  });
}

describe('logout route', () => {
  it('clears the session and redirects to a fresh public shell for an exact same-origin POST', async () => {
    const response = await invoke(logoutRequest(testEnv.OFFICIAL_ORIGIN));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(testEnv.OFFICIAL_ORIGIN);
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

describe('identity capability resolution', () => {
  it('returns resolved capabilities for an administrator without storing them in the session', async () => {
    const response = await invoke(await authenticatedRequest('/api/me', ['ADMINISTRADOR']));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      roles: ['ADMINISTRADOR'],
      capabilities: PLATFORM_CAPABILITIES,
    });
  });

  it('returns an empty platform capability set for a professor in validation', async () => {
    const response = await invoke(await authenticatedRequest('/api/me', ['PROFESSOR']));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      roles: ['PROFESSOR'],
      capabilities: [],
    });
  });
});

describe('platform snapshot authorization', () => {
  it('rejects requests without an authenticated session', async () => {
    const response = await invoke(await authenticatedRequest('/api/platform/snapshot'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' });
  });

  it('rejects authenticated users without platform.snapshot.read', async () => {
    const response = await invoke(
      await authenticatedRequest('/api/platform/snapshot', ['PROFESSOR']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' });
  });

  it('rejects SharePoint health when platform.health.read is absent', async () => {
    const response = await invoke(
      await authenticatedRequest('/api/sharepoint/health', ['PROFESSOR']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' });
  });
});

describe('maintenance recovery route', () => {
  it('rejects a POST without the GitHub production OIDC maintenance identity', async () => {
    const response = await invoke(
      new Request(`${testEnv.OFFICIAL_ORIGIN}/api/maintenance/recovery/verify`, {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid maintenance identity' });
  });

  it('rejects non-POST methods before any recovery mutation is possible', async () => {
    const response = await invoke(
      new Request(`${testEnv.OFFICIAL_ORIGIN}/api/maintenance/recovery/verify`, {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({ error: 'Method not allowed' });
  });
});
