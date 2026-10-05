// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ self: vi.fn(), admin: vi.fn(), dispatch: vi.fn(async () => 0) }));
vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class {
    constructor(
      protected ctx: unknown,
      protected env: unknown,
    ) {}
  },
  DurableObject: class {},
}));
vi.mock('../../../server/student-portal/composition/observed-self-v1', () => ({
  serveObservedPortalSelfV1: mocks.self,
}));
vi.mock('../../../server/student-portal/composition/admin-v1', () => ({
  portalAdminRpcV1: mocks.admin,
}));
vi.mock('../../../server/student-portal/live/live-outbox-v1', () => ({
  dispatchPortalLiveEventsV1: mocks.dispatch,
}));
// This Worker has a separately generated Env namespace; load its mocked runtime without
// merging that declaration into the administrative server's TypeScript project.
const entrypointPath = '../../../workers/student-portal/index';
const {
  default: worker,
  PortalAdminEntrypoint,
  PortalSelfEntrypoint,
} = await import(entrypointPath);
import { SESSION_COOKIE_V1 } from '../../../shared/student-portal-contracts/auth-v1';
const token = 'a'.repeat(43);
const env = {};
let waitUntil = vi.fn();
const context = () => ({ waitUntil }) as unknown as ExecutionContext;
beforeEach(() => {
  mocks.self.mockReset();
  mocks.admin.mockReset();
  mocks.dispatch.mockClear();
  waitUntil = vi.fn();
});
it.each(['rate-limited', 'unavailable', 'forbidden', 'invalid-request'])(
  'does not schedule a live SQL drain after ADM %s',
  async (state) => {
    mocks.admin.mockResolvedValue({ contractVersion: 1, requestId: crypto.randomUUID(), state });
    const admin = new PortalAdminEntrypoint(context(), env);
    expect((await admin.command({}, {})).state).toBe(state);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  },
);
it.each(['committed', 'batch', 'qr'])(
  'retains post-commit drain for the existing ADM %s receipt',
  async (state) => {
    mocks.admin.mockResolvedValue({ state });
    await new PortalAdminEntrypoint(context(), env).command({}, {});
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  },
);
it.each([429, 503, 401, 403, 400])(
  'does not schedule either self entrypoint after activation/logout status %s',
  async (status) => {
    for (const path of ['activate', 'logout']) {
      mocks.self.mockResolvedValue(new Response(null, { status }));
      const req = new Request('https://aluno.escolaieda.com/api/student/auth/' + path, {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE_V1.name}=${token}` },
      });
      await worker.fetch(req, env, context());
      await new PortalSelfEntrypoint(context(), env).fetch(req);
    }
    expect(waitUntil).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  },
);
it.each([
  '',
  `${SESSION_COOKIE_V1.name}=invalid`,
  `${SESSION_COOKIE_V1.name}=${token}; ${SESSION_COOKIE_V1.name}=${token}`,
])('does not drain after a no-op logout with invalid or absent cookie', async (cookie) => {
  mocks.self.mockResolvedValue(new Response(null, { status: 200 }));
  const req = new Request('https://aluno.escolaieda.com/api/student/auth/logout', {
    method: 'POST',
    headers: { cookie },
  });
  await worker.fetch(req, env, context());
  await new PortalSelfEntrypoint(context(), env).fetch(req);
  expect(waitUntil).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('retains successful activation and authenticated logout drains without parsing response bodies', async () => {
  mocks.self.mockResolvedValue(
    new Response(null, {
      status: 200,
      headers: { 'Set-Cookie': `${SESSION_COOKIE_V1.name}=${token}; Path=/; Secure` },
    }),
  );
  await worker.fetch(
    new Request('https://aluno.escolaieda.com/api/student/auth/activate', { method: 'POST' }),
    env,
    context(),
  );
  await worker.fetch(
    new Request('https://aluno.escolaieda.com/api/student/auth/logout', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE_V1.name}=${token}` },
    }),
    env,
    context(),
  );
  expect(waitUntil).toHaveBeenCalledTimes(2);
});
