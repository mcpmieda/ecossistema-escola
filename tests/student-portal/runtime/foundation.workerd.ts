import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const origin = 'https://aluno.escolaieda.com';
const tenant = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188';
const id = '11111111-1111-4111-8111-111111111111';
const config = JSON.parse(readFileSync('wrangler.student-portal.jsonc', 'utf8'));
let runtime: Miniflare;
// Construct incoming requests inside workerd: Miniflare's Node proxy overwrites Host with loopback.
async function workerForTest(name: string) {
  const caller = await runtime.getWorker('caller');
  return {
    fetch: (
      url: string,
      init: { method?: string; body?: string; headers?: Record<string, string> } = {},
    ) => {
      if (
        name === 'caller' &&
        ['/rpc', '/probe-self-admin', '/admin-http'].includes(new URL(url).pathname)
      )
        return caller.fetch(url, init);
      return caller.fetch('http://harness.invalid/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          target: name === 'caller' ? 'SELF' : name === 'portal' ? 'DEFAULT' : 'PREVIEW',
          url,
          init,
        }),
      });
    },
  };
}

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'portal',
          modules: true,
          scriptPath: 'node_modules/.cache/student-portal/index.js',
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags,
          bindings: config.env.production.vars,
        },
        {
          name: 'preview',
          modules: true,
          scriptPath: 'node_modules/.cache/student-portal/index.js',
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags,
          bindings: config.env.preview.vars,
        },
        {
          name: 'caller',
          modules: true,
          compatibilityDate: config.compatibility_date,
          serviceBindings: {
            DEFAULT: 'portal',
            PREVIEW: 'preview',
            SELF: { name: 'portal', entrypoint: 'PortalSelfEntrypoint' },
            ADMIN: { name: 'portal', entrypoint: 'PortalAdminEntrypoint' },
          },
          script: `export default { async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/dispatch') {
          const input = await request.json();
          const forwarded = new Request(input.url, { ...input.init, headers: {host:new URL(input.url).host, ...input.init.headers} });
          return env[input.target].fetch(forwarded);
        }
        if (url.pathname === '/probe-self-admin') {
          try { await env.SELF.query({}, {}); return new Response('exposed', {status:500}); }
          catch { return new Response('absent', {status:403}); }
        }
        if (url.pathname === '/rpc') {
          const body = await request.json();
          return Response.json(await env.ADMIN[body.method](body.context, body.request));
        }
        if (url.pathname === '/admin-http') return env.ADMIN.fetch(new Request('${origin}/healthz'));
        return env.SELF.fetch(request);
      } }`,
        },
      ],
    }),
  );
  await runtime.ready;
});
afterAll(async () => {
  await runtime?.dispose();
});

describe('bundled Worker foundation in actual workerd', () => {
  it('reports liveness without database information or cookies through the self binding', async () => {
    const caller = await workerForTest('caller');
    const response = await caller.fetch(`${origin}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: 1, state: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it.each(['/api/student/me', '/api/student/session'])(
    'keeps %s unavailable even with a supplied cookie',
    async (path) => {
      const worker = await workerForTest('portal');
      const response = await worker.fetch(origin + path, {
        headers: { cookie: 'synthetic=value' },
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ contractVersion: 1, state: 'unavailable' });
    },
  );
  it.each([
    'https://student-portal.workers.dev',
    'https://preview.pages.dev',
    'https://admin.escolaieda.com',
    'http://aluno.escolaieda.com',
  ])('rejects alternate origin %s', async (host) => {
    const worker = await workerForTest('portal');
    expect((await worker.fetch(`${host}/healthz`)).status).toBe(403);
  });
  it.each<Record<string, string>>([
    { origin: 'https://evil.invalid' },
    { 'x-forwarded-host': 'aluno.escolaieda.com' },
    { 'sec-fetch-site': 'cross-site' },
    { host: 'evil.invalid' },
  ])('rejects forged/cross-site request %j', async (headers) => {
    const worker = await workerForTest('portal');
    expect((await worker.fetch(`${origin}/api/student/session`, { headers })).status).toBe(403);
  });
  it('never enables preview using a production URL', async () => {
    const preview = await workerForTest('preview');
    expect((await preview.fetch(`${origin}/healthz`)).status).toBe(403);
  });
  it('rejects credential query strings and unknown/admin routes', async () => {
    const worker = await workerForTest('portal');
    expect((await worker.fetch(`${origin}/api/student/me?token=synthetic`)).status).toBe(403);
    expect(
      (await worker.fetch(`${origin}/api/student-portal/admin/query`, { method: 'POST' })).status,
    ).toBe(404);
    const caller = await workerForTest('caller');
    expect((await caller.fetch(`${origin}/probe-self-admin`)).status).toBe(403);
    expect((await caller.fetch(`${origin}/admin-http`)).status).toBe(404);
  });
  it('bounds auth bodies and leaves login disabled', async () => {
    const worker = await workerForTest('portal');
    const url = `${origin}/api/student/auth/login`;
    expect(
      (
        await worker.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'x'.repeat(8193),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await worker.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(503);
    expect((await worker.fetch(url, { method: 'POST', body: '{}' })).status).toBe(400);
    expect((await worker.fetch(url)).status).toBe(400);
  });
  it('validates admin context on named RPC and never treats validation as authentication', async () => {
    const caller = await workerForTest('caller');
    const context = {
      actorId: id,
      tenantId: tenant,
      requestId: id,
      authenticatedAt: new Date().toISOString(),
      capability: 'platform.settings.read',
    };
    const query = {
      contractVersion: 1,
      operation: 'health',
      scope: { kind: 'school', academicYear: 2026 },
      page: { limit: 1 },
    };
    for (const [ctx, expected] of [
      [{}, 'forbidden'],
      [{ ...context, tenantId: id }, 'forbidden'],
      [context, 'unavailable'],
    ] as const) {
      const response = await caller.fetch(`${origin}/rpc`, {
        method: 'POST',
        body: JSON.stringify({ method: 'query', context: ctx, request: query }),
      });
      expect(await response.json()).toMatchObject({ state: expected });
    }
    const response = await caller.fetch(`${origin}/rpc`, {
      method: 'POST',
      body: JSON.stringify({ method: 'command', context, request: {} }),
    });
    expect(await response.json()).toMatchObject({ state: 'forbidden' });
  });
});
