import { PublicationJobsV1 } from '../jobs/publication-jobs-v1';
import { PublicationReconcilerV1 } from '../jobs/reconcile-v1';
import { cleanupPortalV1 } from '../maintenance/retention-v1';
import type { PortalCompositionEnvV1 } from './config-v1';
import { portalDatabaseV1 } from './database-v1';

/** One passage per minute: at most five reconciliations, one materialization and 100 expirations per family. */
export async function portalScheduledV1(env: PortalCompositionEnvV1): Promise<void> {
  if (env.PORTAL_ENVIRONMENT !== 'production' || env.PORTAL_SERVING_ENABLED !== 'true') return;
  // Independent attempts: publication failure must not starve privacy retention.
  try {
    await portalDatabaseV1(env, 'cleanup', (sql) => cleanupPortalV1(sql, 100));
  } catch { /* The connection wrapper already emitted sanitized unavailable. */ }
  try {
    await portalDatabaseV1(env, 'publication', async (sql) => {
      const reconciled = await new PublicationReconcilerV1(sql).run(5);
      const jobs = new PublicationJobsV1(sql);
      const job = await jobs.claim();
      const result = job ? await jobs.perform(job) : 'empty';
      if (reconciled.failed || result === 'failed') throw new Error('student-portal-publication-unavailable');
      return result;
    });
  } catch { /* Durable leases/retries and the authorized health query expose pending work. */ }
}
