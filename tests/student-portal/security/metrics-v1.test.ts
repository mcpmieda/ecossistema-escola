import { expect, it } from 'vitest';
import {
  emitPortalAuthBurstMetricV1,
  emitPortalDbLifecycleMetricV1,
  emitPortalMetricV1,
  measurePortalSqlV1,
  portalAuthBurstMetricV1,
  portalDbLifecycleMetricV1,
  portalMetricV1,
} from '../../../server/student-portal/observability/metrics-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';

it('exports only numeric aggregates and never serializes driver data or parameters', async () => {
  const sql: StudentPortalPostgresSqlV1 = { unsafe: async () => { throw { code: '55P03', message: 'SYNTHETIC_SECRET', query: 'SYNTHETIC_SQL' }; }, begin: (op) => op(sql) };
  const measured = measurePortalSqlV1(sql);
  await expect(measured.sql.begin((tx) => Promise.resolve(tx.unsafe('SYNTHETIC_SQL', ['SYNTHETIC_VALUE'])))).rejects.toMatchObject({ code: '55P03' });
  const metric = measured.snapshot('admin-command', 'unavailable');
  expect(metric).toMatchObject({ queries: 1, rows: 0, lockTimeouts: 1, statementTimeouts: 0 });
  expect(JSON.stringify(metric)).not.toContain('SYNTHETIC');
  for (const extra of ['url', 'query', 'accountId', 'token', 'birthYear', 'ip', 'name']) {
    expect(portalMetricV1.safeParse({ ...metric, [extra]: 'SYNTHETIC_SECRET' }).success).toBe(false);
  }
  expect(() => emitPortalMetricV1(metric, () => { throw new Error('sink-unavailable'); })).not.toThrow();
  const emitted: unknown[] = [];
  emitPortalMetricV1(metric, (value) => emitted.push(value));
  expect(emitted).toEqual([metric]);
});


it('accepts only bounded auth-burst and DB lifecycle aggregates', () => {
  const burst = { event: 'student-portal-auth-burst-v1', outcome: 'global-limited' } as const;
  expect(portalAuthBurstMetricV1.parse(burst)).toEqual(burst);
  expect(
    portalAuthBurstMetricV1.safeParse({ ...burst, subject: 'SYNTHETIC_SECRET' }).success,
  ).toBe(false);

  const lifecycle = {
    event: 'student-portal-db-lifecycle-v1',
    operation: 'auth',
    outcome: 'ok',
    openRoleMs: 12,
    applicationMs: 34,
    attempts: 1,
  } as const;
  expect(portalDbLifecycleMetricV1.parse(lifecycle)).toEqual(lifecycle);
  expect(
    portalDbLifecycleMetricV1.safeParse({ ...lifecycle, role: 'student_portal_app' }).success,
  ).toBe(false);

  const emitted: unknown[] = [];
  emitPortalAuthBurstMetricV1(burst, (value) => emitted.push(value));
  emitPortalDbLifecycleMetricV1(lifecycle, (value) => emitted.push(value));
  expect(emitted).toEqual([burst, lifecycle]);
});
