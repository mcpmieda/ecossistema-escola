import postgres from 'postgres';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createIntegrationHarnessV1, type IntegrationRequestV1 } from './harness-v1';
import { installIntegrationFixtureV1 } from './fixture-v1';
import { localPortalDatabaseV1 } from '../frontend-foundation/harness-v1';
import { createPortalAdminClientV1 } from '../../../src/features/student-portal-admin/shared/admin-client-v1';
import { createPortalAdminReadClientV2 } from '../../../src/features/student-portal-admin/accounts/accounts-client-v2';
import { createPortalSelfClientV1 } from '../../../src/features/student-portal/shared/self-client-v1';
import { PortalClientErrorV1 } from '../../../src/features/student-portal/shared/transport-v1';

const target = process.env.PORTAL_TEST_DATABASE_URL ?? 'http://invalid';
localPortalDatabaseV1(target);
const sql = postgres(target, { max: 1, onnotice: () => undefined });
let harness: Awaited<ReturnType<typeof createIntegrationHarnessV1>>;
let fixture: Awaited<ReturnType<typeof installIntegrationFixtureV1>>;
let cookie: string | undefined;
const fetcher = (surface: 'admin' | 'student') => async (path: string, init: RequestInit) => {
  init.signal?.throwIfAborted();
  const response = await harness.fetch({
    surface,
    path,
    method: init.method,
    body: init.body as string | undefined,
    ...(surface === 'student' && cookie ? { cookie } : {}),
  });
  if (surface === 'student' && response.headers.has('set-cookie'))
    cookie = response.headers.get('set-cookie')!.split(';')[0];
  return response as unknown as Response;
};
const client = createPortalAdminClientV1({ fetch: fetcher('admin') });
const reader = createPortalAdminReadClientV2({ fetch: fetcher('admin') });
const student = createPortalSelfClientV1({ fetch: fetcher('student') });
beforeAll(async () => {
  fixture = await installIntegrationFixtureV1(sql);
  harness = await createIntegrationHarnessV1(target);
});
afterAll(async () => {
  await harness?.dispose();
  await sql.end({ timeout: 2 });
});
it('uses the full Pages handler for inherited identity/capabilities and rejects foreign origin or role', async () => {
  const me = await harness.fetch({ surface: 'admin', path: '/api/me' });
  expect(me.status).toBe(200);
  const identity = (await me.json()) as {
    identityKey: string;
    expiresAt: string;
    capabilities: string[];
  };
  expect(identity.identityKey).toMatch(/^75700000-/u);
  expect(Date.parse(identity.expiresAt)).toBeGreaterThan(Date.now());
  expect(identity.capabilities).toContain('platform.settings.write');
  expect(
    me.headers
      .get('Cache-Control')
      ?.split(',')
      .map((part) => part.trim()),
  ).toContain('no-store');
  const query = JSON.stringify({
    contractVersion: 2,
    operation: 'accounts-read',
    scope: fixture.scope,
    page: { limit: 100 },
  });
  for (const extra of [
    { anonymous: true },
    { role: 'PROFESSOR' as const },
    { origin: 'https://foreign.invalid' },
  ]) {
    const response = await harness.fetch({
      surface: 'admin',
      path: '/api/student-portal/admin/query',
      body: query,
      ...extra,
    });
    expect([401, 403]).toContain(response.status);
  }
  const invalidYear = await harness.fetch({
    surface: 'admin',
    path: '/api/student-portal/admin/query',
    body: query.replace('"academicYear":2026', '"academicYear":2025'),
  });
  expect(invalidYear.status).toBe(400);
});
it('composes typed clients, actual SQL/RPC, activation, official publication, revocation and logout', async () => {
  const accounts = await reader.query({
    contractVersion: 2,
    operation: 'accounts-read',
    scope: fixture.scope,
    page: { limit: 100 },
  });
  if (accounts.state !== 'accounts-read') throw new Error('Synthetic accounts not returned');
  const account = accounts.items.find((item) => item.link?.studentId === fixture.studentId)!;
  expect(account).toBeDefined();
  const scope = {
    kind: 'account' as const,
    academicYear: 2026 as const,
    accountId: account.accountId,
  };
  const birth = await client.query({
    contractVersion: 1,
    operation: 'birth-years',
    scope,
    page: { limit: 100 },
  });
  if (birth.state !== 'birth-years') throw new Error('Synthetic birth read failed');
  await client.command({
    contractVersion: 1,
    operation: 'birth-write',
    expectedVersion: birth.items[0]!.accountVersion,
    idempotencyKey: crypto.randomUUID(),
    item: {
      action: 'set',
      accountId: account.accountId,
      expectedVersion: birth.items[0]!.version,
      year: '2001',
      confirmation: 'confirmed',
    },
  });
  const settings = await client.query({
    contractVersion: 1,
    operation: 'settings',
    scope,
    page: {},
  });
  if (settings.state !== 'settings') throw new Error('Synthetic settings read failed');
  const now = Math.floor(Date.now() / 1000) * 1000;
  await client.command({
    contractVersion: 1,
    operation: 'settings-set',
    scope,
    expectedVersion: settings.settings.version,
    idempotencyKey: crypto.randomUUID(),
    acknowledgeImmediateEffect: true,
    value: {
      accessEnabled: true,
      showPartials: true,
      allowedPeriods: ['T1'],
      calendar: {
        ...settings.settings.value.calendar,
        yearStartsAt: new Date(now - 86400_000).toISOString(),
        t1EndsAt: null,
        t2EndsAt: null,
        t3EndsAt: null,
        recoveriesStartAt: null,
        yearEndsAt: new Date(now + 86400_000).toISOString(),
        disclosure: { mode: 'single', at: new Date(now - 3600_000).toISOString(), periods: ['T1'] },
      },
    },
  });
  const fresh = await reader.query({
    contractVersion: 2,
    operation: 'accounts-read',
    scope,
    page: {},
  });
  if (fresh.state !== 'accounts-read') throw new Error('Synthetic account freshness failed');
  const qr = await client.command({
    contractVersion: 1,
    operation: 'qr-issue',
    accountId: account.accountId,
    expectedVersion: fresh.items[0]!.version,
    idempotencyKey: crypto.randomUUID(),
  });
  if (qr.state !== 'qr') throw new Error('Synthetic QR handoff failed');
  const challenge = await student.challenge({
    contractVersion: 1,
    qr: qr.cards[0]!.qr,
    pin: '2001',
  });
  if (challenge.state !== 'password-creation')
    throw new Error('Synthetic activation challenge failed');
  await student.activate({
    contractVersion: 1,
    challenge: challenge.challenge,
    password: '012345',
    confirmation: '012345',
    keepConnected: true,
  });
  expect((await student.session()).state).toBe('authenticated');
  expect((await student.me()).profile.accountId).toBe(account.accountId);
  // Source becomes available through the deployed scheduled reconciler, not a direct fixture write.
  for (let n = 0; n < 10; n++) {
    await harness.scheduled();
    const observed = await client.query({
      contractVersion: 1,
      operation: 'publication',
      scope,
      page: {},
    });
    if (
      observed.state === 'publication' &&
      observed.items.some((item) => item.period === 'T1' && item.availableRevision)
    )
      break;
  }
  const publication = await client.query({
    contractVersion: 1,
    operation: 'publication',
    scope,
    page: {},
  });
  if (publication.state !== 'publication') throw new Error('Synthetic publication read failed');
  const t1 = publication.items.find((item) => item.period === 'T1')!;
  expect(t1.availableRevision).not.toBeNull();
  await client.command({
    contractVersion: 1,
    operation: 'publish',
    scope,
    period: 'T1',
    expectedVersion: t1.version,
    targetDataVersion: t1.availableRevision!,
    idempotencyKey: crypto.randomUUID(),
  });
  for (let n = 0; n < 10; n++) {
    await harness.scheduled();
    const me = await student.me();
    if (me.state === 'ready' && me.subjects.length) break;
  }
  const self = await student.me();
  expect(self.state).toBe('ready');
  expect(self.subjects.length).toBeGreaterThan(0);
  expect(
    self.subjects.flatMap((subject) => subject.periods).every((period) => period.period === 'T1'),
  ).toBe(true);
  expect(JSON.stringify(self)).not.toContain(fixture.prefix + ' OTHER');
  const sessions = await reader.query({
    contractVersion: 2,
    operation: 'sessions-read',
    scope,
    page: {},
  });
  if (sessions.state !== 'sessions-read') throw new Error('Synthetic session read failed');
  expect(sessions.items.some((session) => session.validity === 'valid')).toBe(true);
  await client.command({
    contractVersion: 1,
    operation: 'sessions-revoke',
    scope,
    expectedVersion: sessions.version,
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  });
  await expect(student.me()).rejects.toBeInstanceOf(PortalClientErrorV1);
  await student.login({
    contractVersion: 1,
    qr: qr.cards[0]!.qr,
    password: '012345',
    keepConnected: false,
  });
  expect((await student.session()).persistent).toBe(false);
  await student.logout();
  await expect(student.session()).rejects.toMatchObject({ state: 'unauthenticated' });
});
it('serves actual compiled HTML/assets and separates public documents from self/admin boundaries', async () => {
  for (const path of ['/', '/access']) {
    const response = await harness.fetch({ surface: 'student', path });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=(self)');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  const rejected: IntegrationRequestV1[] = [
    { surface: 'student', path: '/api/student-portal/admin/query' },
    { surface: 'student', path: '/not-found' },
    { surface: 'student', path: '/assets/not-found.js' },
  ];
  for (const input of rejected) expect((await harness.fetch(input)).status).toBe(404);
  expect(
    (
      await harness.fetch({
        surface: 'student',
        path: '/api/student/session',
        origin: 'https://foreign.invalid',
      })
    ).status,
  ).toBe(403);
});
