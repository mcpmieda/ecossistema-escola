import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const config = JSON.parse(readFileSync('wrangler.student-portal.jsonc', 'utf8'));
let runtime: Miniflare;
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
          durableObjects: { PORTAL_LIVE: { className: 'PortalLiveUpdatesV1', useSQLite: true } },
        },
        {
          name: 'caller',
          modules: true,
          compatibilityDate: config.compatibility_date,
          durableObjects: {
            LIVE: { className: 'PortalLiveUpdatesV1', scriptName: 'portal', useSQLite: true },
          },
          script: `export default {async fetch(request,env){
      const url=new URL(request.url);const stub=env.LIVE.get(env.LIVE.idFromName('student:2026'));
      if(url.pathname==='/presence') return Response.json(await stub.presence(await request.json()));
      if(url.pathname==='/publish') return Response.json(await stub.publish(await request.json()));
      return stub.fetch(new Request('https://internal/connect',{headers:{Upgrade:'websocket','x-live-audience':'student',
        'x-live-purpose':'security','x-live-expires-at':new Date(Date.now()+60000).toISOString(),
        ...(url.pathname==='/legacy-socket'?{}:{'x-live-effective-expires-at':'2099-01-01T00:00:00.000Z'}),
        'x-live-account-id':'11020000-0000-4000-8000-000000000001','x-live-student-id':'110201','x-live-class-id':'110201'}}));
    }}`,
        },
      ],
    }),
  );
  await runtime.ready;
});
afterAll(async () => runtime?.dispose());
it('deduplicates authorized sockets and delivers only security notices, invalidating presence', async () => {
  const caller = await runtime.getWorker('caller');
  const open = async () => {
    const response = await caller.fetch('http://caller/socket', {
      headers: { Upgrade: 'websocket' },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    socket.accept();
    return socket;
  };
  const first = await open(),
    second = await open();
  const messages: string[] = [];
  first.addEventListener('message', (event) => messages.push(String(event.data)));
  const presence = async (classId?: number) => {
    const response = await caller.fetch('http://caller/presence', {
      method: 'POST',
      body: JSON.stringify(
        classId
          ? { kind: 'class', academicYear: 2026, classId }
          : { kind: 'school', academicYear: 2026 },
      ),
    });
    return response.json();
  };
  expect(await presence()).toMatchObject({ connectedStudents: 1, windowSeconds: 60 });
  expect(await presence(110202)).toMatchObject({ connectedStudents: 0 });
  const publish = async (securityRelevant: boolean, cursor: string) =>
    caller.fetch('http://caller/publish', {
      method: 'POST',
      body: JSON.stringify({
        audience: 'student',
        domain: 'portal',
        version: '1',
        cursor,
        occurredAt: new Date().toISOString(),
        accountId: null,
        classId: null,
        studentIds: [],
        securityRelevant,
      }),
    });
  await publish(false, '00000000000000000001');
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(
    messages.every((message) => !message.includes('change') && !message.includes('resync')),
  ).toBe(true);
  const notice = new Promise<string>((resolve) =>
    first.addEventListener('message', (event) => {
      if (String(event.data).includes('reauthorize')) resolve(String(event.data));
    }),
  );
  await publish(true, '00000000000000000002');
  expect(JSON.parse(await notice)).toEqual({ contractVersion: 1, type: 'reauthorize' });
  expect(await presence()).toMatchObject({ connectedStudents: 0 });
  first.close();
  second.close();
});

it.each([
  [
    '/socket',
    { contractVersion: 1, type: 'security-connected', expiresAt: '2099-01-01T00:00:00.000Z' },
  ],
  ['/legacy-socket', { contractVersion: 1, type: 'security-connected' }],
] as const)(
  'acknowledges %s without confusing the security lease with the session expiry',
  async (path, expected) => {
    const caller = await runtime.getWorker('caller');
    const response = await caller.fetch(`http://caller${path}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    const confirmed = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('confirmation-timeout')), 1000);
      socket.addEventListener(
        'message',
        (event) => {
          clearTimeout(timer);
          resolve(JSON.parse(String(event.data)));
        },
        { once: true },
      );
    });
    socket.accept();
    expect(await confirmed).toEqual(expected);
    const presence = await caller.fetch('http://caller/presence', {
      method: 'POST',
      body: JSON.stringify({ kind: 'school', academicYear: 2026 }),
    });
    expect(await presence.json()).toMatchObject({ windowSeconds: 60 });
    socket.close();
  },
);
