import { expect } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { portalMaintenanceHealthV1 } from '../../../server/student-portal/observability/maintenance-health-v1';
import { createLocalPortalHarnessV1 } from './local-harness-v1';

export async function proveWorkerLockTimeoutV1(connectionString: string, owner: StudentPortalPostgresSqlV1, observer: StudentPortalPostgresSqlV1, token: string) {
  const harness = await createLocalPortalHarnessV1(connectionString);
  let unlock!: () => void;
  let ready!: () => void;
  let rejectReady!: (error: unknown) => void;
  const released = new Promise<void>((resolve) => { unlock = resolve; });
  const acquired = new Promise<void>((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const holder = owner.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock_shared(613,0)');
    await tx.unsafe('SELECT pg_advisory_xact_lock(613,2026)');
    ready(); await released;
  });
  void holder.catch(rejectReady);
  try {
    await acquired;
    const request = harness.runtime.dispatchFetch('https://aluno.escolaieda.com/api/student/session', {
      headers: { cookie: `__Host-student_portal_session=${token}`, origin: 'https://aluno.escolaieda.com' },
    });
    let observed = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const health = await portalMaintenanceHealthV1(observer);
      if (health.waitingConnections > 0) { observed = true; break; }
      await delay(50);
    }
    expect(observed).toBe(true);
    // A health query must not queue behind the lock it is intended to diagnose.
    const health = await harness.runtime.dispatchFetch('https://aluno.escolaieda.com/harness/admin/query', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contractVersion: 1, operation: 'health', scope: { kind: 'school', academicYear: 2026 }, page: {} }),
    });
    expect(health.status).toBe(200);
    expect((await health.json() as { state: string }).state).toBe('health');
    const failed = await request;
    expect(failed.status).toBe(503);
    expect(Number(failed.headers.get('x-harness-lock-timeouts'))).toBe(1);
    expect((await failed.json() as { state: string }).state).toBe('unavailable');
  } finally { unlock(); try { await holder; } finally { await harness.close(); } }
}
