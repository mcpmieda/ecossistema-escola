import { beforeEach, expect, it, vi } from 'vitest';
import { handlePublicDemoRequestV1 } from '../../server/platform/public-demo-http-v1';
import { requireAuth, AuthenticationError } from '../../server/auth/session';
import type { RuntimeEnv } from '../../server/env';
vi.mock('../../server/auth/session', () => ({
  requireAuth: vi.fn(),
  AuthenticationError: class extends Error {},
}));
const origin = 'http://localhost:8788';
const getState = vi.fn(),
  setEnabled = vi.fn();
const env = {
  OFFICIAL_ORIGIN: origin,
  TENANT_ID: '22222222-2222-4222-8222-222222222222',
  PUBLIC_DEMO_CONTROL: { getState, setEnabled },
} as unknown as RuntimeEnv;
function request(body: unknown = {}, endpoint = '', headers = {}) {
  return new Request(`${origin}/api/platform/public-demo${endpoint}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({
    oid: '11111111-1111-4111-8111-111111111111',
    name: 'Administrador fictício',
    roles: ['ADMINISTRADOR'],
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  getState.mockResolvedValue({ enabled: false, revision: 0 });
});
it('requires authentication and capability before every RPC', async () => {
  vi.mocked(requireAuth).mockRejectedValueOnce(new AuthenticationError());
  expect((await handlePublicDemoRequestV1(request(), env))?.status).toBe(401);
  vi.mocked(requireAuth).mockResolvedValue({
    oid: 'synthetic',
    name: 'Fictício',
    roles: ['PROFESSOR'],
    exp: 9999999999,
  });
  for (const [body, endpoint] of [
    [{}, ''],
    [{ enabled: true, expectedRevision: 0 }, ''],
  ] as const) {
    expect((await handlePublicDemoRequestV1(request(body, endpoint), env))?.status).toBe(403);
  }
  expect(getState).not.toHaveBeenCalled();
  expect(setEnabled).not.toHaveBeenCalled();
});
it.each(['', 'https://untrusted.invalid'])(
  'rejects missing or foreign origin %s',
  async (Origin) => {
    expect(
      (
        await handlePublicDemoRequestV1(
          request({ enabled: true, expectedRevision: 0 }, '', { Origin }),
          env,
        )
      )?.status,
    ).toBe(403);
    expect(setEnabled).not.toHaveBeenCalled();
  },
);
it('forwards server-derived authority and returns confirmed CAS conflicts without caching', async () => {
  setEnabled.mockResolvedValue({ ok: false, state: { enabled: false, revision: 2 } });
  const response = await handlePublicDemoRequestV1(
    request({ enabled: true, expectedRevision: 0 }),
    env,
  );
  expect(response?.status).toBe(409);
  expect(response?.headers.get('cache-control')).toContain('no-store');
  expect(setEnabled).toHaveBeenCalledWith(
    expect.objectContaining({ capability: 'platform.settings.write', tenantId: env.TENANT_ID }),
    { enabled: true, expectedRevision: 0 },
  );
});
it('validates state responses without echoing arbitrary private payload', async () => {
  getState.mockResolvedValue({ private: 'never-return' });
  const response = await handlePublicDemoRequestV1(request(), env);
  expect(response?.status).toBe(503);
  expect(await response!.text()).not.toContain('never-return');
});
it('keeps missing binding unavailable and refuses unknown write fields', async () => {
  expect(
    (await handlePublicDemoRequestV1(request(), { ...env, PUBLIC_DEMO_CONTROL: undefined }))
      ?.status,
  ).toBe(503);
  expect(
    (
      await handlePublicDemoRequestV1(
        request({ enabled: true, expectedRevision: 0, authority: {} }),
        env,
      )
    )?.status,
  ).toBe(400);
  expect(setEnabled).not.toHaveBeenCalled();
});
