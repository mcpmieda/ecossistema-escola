// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../../functions/[[path]]';
import { seal } from '../../../server/auth/sealed';
import { SESSION_COOKIE } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import { handleRetiredGradebookReportsRequest } from '../../../server/gradebook/http/retired-reports-route';
import { guardAdminOperationV1 } from '../../../server/http/admin-rate-limit-v1';
import { testEnv } from '../../fixtures';

const cookies = new Map<string, string>();
beforeAll(async () => {
  for (const role of ['ADMINISTRADOR', 'PROFESSOR']) {
    const token = await seal(
      {
        oid: '11111111-1111-4111-8111-111111111111',
        name: 'Synthetic',
        roles: [role],
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      testEnv.SESSION_SECRET,
    );
    cookies.set(role, `${SESSION_COOKIE}=${token}`);
  }
});
function environment() {
  const access = vi.fn(() => {
    throw new Error('retired-storage-access');
  });
  const env: RuntimeEnv = { ...testEnv, GRADEBOOK_STORAGE_PROVIDER: 'postgres' };
  // validateEnv reads binding references; trap use of the bindings instead.
  const binding = new Proxy({}, { get: access });
  for (const key of ['GRADEBOOK_DATABASE', 'GRADEBOOK_D1', 'PROD_DB', 'PORTAL_SERVICE'])
    Object.defineProperty(env, key, { value: binding, enumerable: true });
  return { env, access };
}
function request(role: string | null = 'ADMINISTRADOR', body = '{}') {
  return new Request(`${testEnv.OFFICIAL_ORIGIN}/api/gradebook/reports`, {
    method: 'POST',
    headers: {
      Origin: testEnv.OFFICIAL_ORIGIN,
      'Content-Type': 'application/json',
      ...(role ? { Cookie: cookies.get(role)! } : {}),
    },
    body,
  });
}
const dispatch = (req: Request, env: RuntimeEnv) =>
  onRequest({
    request: req,
    env,
    waitUntil: vi.fn(),
  } as unknown as Parameters<typeof onRequest>[0]);

describe('retired Reports endpoint', () => {
  it.each([1, 2])(
    'returns 410 for saved V%s clients through Functions without a provider or body read',
    async (version) => {
      const { env, access } = environment();
      const req = request(
        'ADMINISTRADOR',
        JSON.stringify({ contractVersion: version, operation: 'catalog' }),
      );
      expect(await guardAdminOperationV1(req, env)).toBeNull();
      const response = await dispatch(req, env);
      expect(response.status).toBe(410);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(await response.json()).toEqual({ state: 'retired' });
      expect(req.bodyUsed).toBe(false);
      expect(access).not.toHaveBeenCalled();
    },
  );
  it.each([
    [null, 401],
    ['PROFESSOR', 403],
  ] as const)('keeps the access boundary for %s', async (role, status) => {
    const { env, access } = environment();
    const response = await dispatch(request(role), env);
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(access).not.toHaveBeenCalled();
  });
  it('keeps method and origin guards and never interprets a retired payload', async () => {
    const { env, access } = environment();
    const req = request();
    const foreign = request();
    foreign.headers.set('Origin', 'https://foreign.invalid');
    expect((await dispatch(foreign, env)).status).toBe(403);
    expect((await dispatch(new Request(req.url, { headers: req.headers }), env)).status).toBe(405);
    const obsolete = request('ADMINISTRADOR', 'obsolete'.repeat(10_000));
    expect((await dispatch(obsolete, env)).status).toBe(410);
    expect(obsolete.bodyUsed).toBe(false);
    expect(access).not.toHaveBeenCalled();
    expect(
      await handleRetiredGradebookReportsRequest(
        new Request(`${testEnv.OFFICIAL_ORIGIN}/api/health`),
        env,
      ),
    ).toBeNull();
  });
});
