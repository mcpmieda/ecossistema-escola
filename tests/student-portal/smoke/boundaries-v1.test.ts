import { beforeEach, expect, it, vi } from 'vitest';
import { servePortalSelfV1 } from '../../../server/student-portal/composition/self-v1';
import { portalKeysV1, type PortalCompositionEnvV1 } from '../../../server/student-portal/composition/config-v1';
import { portalScheduledV1 } from '../../../server/student-portal/composition/scheduled-v1';
import { portalAdminRpcV1 } from '../../../server/student-portal/composition/admin-v1';
import { PublicationJobsV1 } from '../../../server/student-portal/jobs/publication-jobs-v1';
import { PublicationReconcilerV1 } from '../../../server/student-portal/jobs/reconcile-v1';
const database = vi.hoisted(() => vi.fn());
vi.mock('../../../server/student-portal/composition/database-v1', () => ({ portalDatabaseV1: database }));
const env: PortalCompositionEnvV1 = { PORTAL_ENVIRONMENT: 'production', PORTAL_ORIGIN: 'https://aluno.escolaieda.com',
  PORTAL_ADMIN_TENANT_ID: '22222222-2222-4222-8222-222222222222', PORTAL_SERVING_ENABLED: 'true' };
const input = { contractVersion: 1, qr: `https://aluno.escolaieda.com/access#v1.${'a'.repeat(43)}.1.${'b'.repeat(43)}`, password: '012345', keepConnected: false };
const request = (body: unknown) => new Request(`${env.PORTAL_ORIGIN}/api/student/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: env.PORTAL_ORIGIN }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.restoreAllMocks();
  database.mockReset();
});
it('refuses malformed payload, rate limit and a closed deployment before opening any connection', async () => {
  expect((await servePortalSelfV1(request({ ...input, accountId: 'untrusted' }), env)).status).toBe(400);
  const global = { limit: vi.fn(async () => ({ success: false })) };
  const subject = { limit: vi.fn(async () => ({ success: true })) };
  expect((await servePortalSelfV1(request(input), { ...env, PORTAL_AUTH_GLOBAL: global, PORTAL_AUTH_SUBJECT: subject })).status).toBe(429);
  expect(subject.limit).not.toHaveBeenCalled();
  expect((await servePortalSelfV1(request(input), { ...env, PORTAL_SERVING_ENABLED: 'false' })).status).toBe(503);
  await portalScheduledV1({ ...env, PORTAL_SERVING_ENABLED: 'false' });
  expect(database).not.toHaveBeenCalled();
});
it('refuses fake admin context and preview before SQL; unavailable maintenance does not accept mutations', async () => {
  expect((await portalAdminRpcV1(env, 'query', {}, {})).state).toBe('forbidden');
  const context = { actorId: '11111111-1111-4111-8111-111111111111', tenantId: env.PORTAL_ADMIN_TENANT_ID,
    requestId: crypto.randomUUID(), authenticatedAt: new Date().toISOString(), capability: 'platform.settings.write' };
  const query = { contractVersion: 1, operation: 'accounts', scope: { kind: 'school', academicYear: 2026 }, page: {} };
  expect((await portalAdminRpcV1({ ...env, PORTAL_ENVIRONMENT: 'preview' }, 'query', context, query)).state).toBe('forbidden');
  expect((await portalAdminRpcV1({ ...env, PORTAL_SERVING_ENABLED: 'false' }, 'query', context, query)).state).toBe('unavailable');
  expect(database).not.toHaveBeenCalled();
});
it('keeps reconciliation bounded and drains more work than one production passage creates', async () => {
  database.mockImplementation(async (_env, operation, run) => {
    if (operation === 'cleanup') throw new Error('synthetic-cleanup-unavailable');
    return run({});
  });
  const reconcile = vi.spyOn(PublicationReconcilerV1.prototype, 'run')
    .mockResolvedValue({ inspected: 5, reconciled: 5, failed: 0 });
  const jobs = vi.spyOn(PublicationJobsV1.prototype, 'run')
    .mockResolvedValue({ processed: 10, done: 10, deferred: 0, failed: 0, unavailable: 0 });

  await portalScheduledV1(env);

  expect(reconcile).toHaveBeenCalledWith(5);
  expect(jobs).toHaveBeenCalledWith(10);
});
it('loads versioned synthetic keys, separates cursor signatures and refuses absent/malformed key material', async () => {
  expect(() => portalKeysV1(env)).toThrow();
  const material = { ...env, QR_HMAC_KEYS: JSON.stringify({ 1: Buffer.alloc(32, 72).toString('base64') }),
    PASSWORD_PEPPER: JSON.stringify({ 1: Buffer.alloc(32, 71).toString('base64') }) };
  const keys = portalKeysV1(material);
  expect(keys.cursorSecret).toHaveLength(64);
  expect(keys.cursorSecret === Buffer.alloc(32, 72).toString('hex')).toBe(false);
  const signature = await keys.cryptoPort.signQr('a'.repeat(43), 1);
  expect(await keys.cryptoPort.verifyQr('a'.repeat(43), 1, signature)).toBe(true);
  expect(() => portalKeysV1({ ...material, QR_HMAC_KEYS: '{"1":"malformed"}' })).toThrow();
});
