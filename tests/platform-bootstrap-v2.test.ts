import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/platform/bootstrap';
import { seal } from '../server/auth/sealed';
import { SESSION_COOKIE } from '../server/auth/session';
import { testEnv } from './fixtures';

async function request(role?: string, exp = Math.floor(Date.now() / 1000) + 600) {
  const headers = new Headers();
  if (role) {
    const session = await seal({ oid: '11111111-1111-4111-8111-111111111111', name: 'SYNTHETIC OPERATOR',
      username: 'synthetic@example.invalid', roles: [role], exp }, testEnv.SESSION_SECRET);
    headers.set('Cookie', `${SESSION_COOKIE}=${session}`);
  }
  return new Request(`${testEnv.OFFICIAL_ORIGIN}/api/platform/bootstrap`, { headers });
}
const invoke = async (input: Request) => onRequest({ request: input, env: testEnv } as never);
afterEach(() => vi.unstubAllGlobals());
describe('authenticated native bootstrap #806', () => {
  it('loads the capability-filtered catalog without requesting Microsoft or database resources', async () => {
    const fetcher = vi.fn(() => { throw new Error('An external service must not gate native bootstrap'); });
    vi.stubGlobal('fetch', fetcher);
    const response = await invoke(await request('ADMINISTRADOR'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const value = await response.json() as { auxiliaryState: string; coreModules: unknown[]; registeredModules: unknown[]; configurations: unknown[] };
    expect(value.auxiliaryState).toBe('not-loaded');
    expect(value.coreModules.length).toBeGreaterThan(0);
    expect(value.registeredModules).toEqual([]);
    expect(value.configurations).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not bootstrap an absent or expired session', async () => {
    expect((await invoke(await request())).status).toBe(401);
    expect((await invoke(await request('ADMINISTRADOR', 1))).status).toBe(401);
  });
  it('requires the Center capability even for a valid institutional session', async () => {
    expect((await invoke(await request('PROFESSOR'))).status).toBe(403);
  });
  it('rejects an untrusted host and an unexpected method before returning the catalog', async () => {
    const authenticated = await request('ADMINISTRADOR');
    expect((await invoke(new Request('https://untrusted.invalid/api/platform/bootstrap', { headers: authenticated.headers }))).status).toBe(403);
    expect((await invoke(new Request(authenticated.url, { method: 'POST', headers: authenticated.headers }))).status).toBe(405);
  });
});
