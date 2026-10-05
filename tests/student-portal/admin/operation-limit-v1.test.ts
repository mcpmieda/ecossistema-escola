// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  limitAdminOperationV1,
  adminCommandOperationV1,
} from '../../../server/student-portal/composition/admin-rate-limit-v1';
import { portalAdminRpcV1 } from '../../../server/student-portal/composition/admin-v1';
import type { PortalCompositionEnvV1 } from '../../../server/student-portal/composition/config-v1';
const database = vi.hoisted(() => vi.fn());
vi.mock('../../../server/student-portal/composition/database-v1', () => ({
  portalDatabaseV1: database,
}));
const tenant = '22222222-2222-4222-8222-222222222222';
const actor = '11111111-1111-4111-8111-111111111111';
const context = (oid = actor) => ({
  actorId: oid,
  tenantId: tenant,
  requestId: crypto.randomUUID(),
  capability: 'platform.settings.write' as const,
  authenticatedAt: new Date().toISOString(),
});
const env: PortalCompositionEnvV1 = {
  PORTAL_ENVIRONMENT: 'production',
  PORTAL_ORIGIN: 'https://aluno.escolaieda.com',
  PORTAL_ADMIN_TENANT_ID: tenant,
  PORTAL_SERVING_ENABLED: 'true',
};
const scope = { kind: 'school', academicYear: 2026 };
const query = { contractVersion: 1, operation: 'accounts', scope, page: {} };
const revoke = () => ({
  contractVersion: 1,
  operation: 'sessions-revoke',
  expectedVersion: 1,
  idempotencyKey: crypto.randomUUID(),
  scope,
  confirmed: true,
});
beforeEach(() => database.mockReset());

describe('private ADM limiter', () => {
  it('aggregates a verified actor across sessions and isolates another actor on the same network', async () => {
    const seen = new Set<string>();
    const limit = vi.fn(async ({ key }: { key: string }) => {
      const success = !seen.has(key);
      seen.add(key);
      return { success };
    });
    const configured = { ...env, PORTAL_ADMIN_READ: { limit } };
    expect(await limitAdminOperationV1(configured, context(), 'read')).toBeNull();
    expect((await limitAdminOperationV1(configured, context(), 'read'))?.state).toBe(
      'rate-limited',
    );
    expect(
      await limitAdminOperationV1(
        configured,
        context('33333333-3333-4333-8333-333333333333'),
        'read',
      ),
    ).toBeNull();
    const keys = limit.mock.calls.map(([input]) => input.key);
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(keys[0]).not.toContain(actor);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });
  it('separates read and revoke, and never falls through to SQL after a blocked RPC', async () => {
    const read = vi.fn(async () => ({ success: false }));
    const revokeLimit = vi.fn(async () => ({ success: false }));
    const configured = {
      ...env,
      PORTAL_ADMIN_READ: { limit: read },
      PORTAL_ADMIN_REVOKE: { limit: revokeLimit },
    };
    expect((await portalAdminRpcV1(configured, 'query', context(), query)).state).toBe(
      'rate-limited',
    );
    expect((await portalAdminRpcV1(configured, 'command', context(), revoke())).state).toBe(
      'rate-limited',
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(revokeLimit).toHaveBeenCalledTimes(1);
    expect(database).not.toHaveBeenCalled();
    expect(
      await limitAdminOperationV1(
        { ...configured, PORTAL_ADMIN_REVOKE: { limit: async () => ({ success: true }) } },
        context(),
        'revoke',
      ),
    ).toBeNull();
  });
  it('treats absence, exceptions and malformed provider success as unavailable with a conservative retry', async () => {
    for (const binding of [
      undefined,
      {
        limit: async () => {
          throw new Error('private');
        },
      },
      { limit: async () => ({ success: undefined }) as unknown as RateLimitOutcome },
    ]) {
      expect(
        await limitAdminOperationV1({ ...env, PORTAL_ADMIN_READ: binding }, context(), 'read'),
      ).toMatchObject({ state: 'unavailable', retryAfterSeconds: 60 });
    }
    expect((await portalAdminRpcV1(env, 'query', context(), query)).state).toBe('unavailable');
    expect(database).not.toHaveBeenCalled();
  });
  it('rejects an untrusted tenant, invalid or stale identity and unknown operation before touching bindings', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const configured = { ...env, PORTAL_ADMIN_READ: { limit } };
    for (const invalid of [
      {},
      { ...context(), actorId: 'name@example.test' },
      { ...context(), tenantId: crypto.randomUUID() },
      { ...context(), authenticatedAt: new Date(Date.now() - 300001).toISOString() },
      { ...context(), authenticatedAt: new Date(Date.now() + 60000).toISOString() },
    ]) {
      expect((await limitAdminOperationV1(configured, invalid, 'read'))?.state).toBe('forbidden');
    }
    expect((await limitAdminOperationV1(configured, context(), 'read-anything'))?.state).toBe(
      'forbidden',
    );
    expect(limit).not.toHaveBeenCalled();
  });
  it('does not weaken existing command capability, payload or serving checks', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const configured = { ...env, PORTAL_ADMIN_REVOKE: { limit } };
    expect(
      (
        await portalAdminRpcV1(
          configured,
          'command',
          { ...context(), capability: 'platform.settings.read' },
          revoke(),
        )
      ).state,
    ).toBe('forbidden');
    expect(
      (await portalAdminRpcV1(configured, 'command', context(), { ...revoke(), confirmed: false }))
        .state,
    ).toBe('invalid-request');
    expect(
      (
        await portalAdminRpcV1(
          { ...configured, PORTAL_SERVING_ENABLED: 'false' },
          'command',
          context(),
          revoke(),
        )
      ).state,
    ).toBe('unavailable');
    expect(limit).not.toHaveBeenCalled();
    expect(database).not.toHaveBeenCalled();
  });
  it('keeps exports, writes and revocations in closed, distinct families', () => {
    expect(adminCommandOperationV1('sessions-revoke')).toBe('revoke');
    expect(adminCommandOperationV1('qr-batch')).toBe('export');
    expect(adminCommandOperationV1('publish')).toBe('write');
    expect(adminCommandOperationV1('birth-batch')).toBe('write');
  });
});
