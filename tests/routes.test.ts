import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/[[path]]';
import { testEnv } from './fixtures';

function logoutRequest(origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  return new Request(`${testEnv.OFFICIAL_ORIGIN}/auth/logout`, {
    method: 'POST',
    headers,
  });
}

async function invokeLogout(request: Request): Promise<Response> {
  return await onRequest({ request, env: testEnv } as never);
}

describe('logout route', () => {
  it('clears the session for an exact same-origin POST', async () => {
    const response = await invokeLogout(logoutRequest(testEnv.OFFICIAL_ORIGIN));

    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-ecossistema_session=');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
  });

  it.each([undefined, 'null', 'https://evil.test'])(
    'rejects an untrusted write Origin: %s',
    async (origin) => {
      const response = await invokeLogout(logoutRequest(origin));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: 'Invalid origin' });
    },
  );
});
