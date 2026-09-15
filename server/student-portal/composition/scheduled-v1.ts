import { PublicationJobsV1 } from '../jobs/publication-jobs-v1';
import { PublicationReconcilerV1 } from '../jobs/reconcile-v1';
import { cleanupPortalV1 } from '../maintenance/retention-v1';
import { scopedPublicationEnabledV2 } from '../publication/scoped-source-v2';
import type { PortalCompositionEnvV1 } from './config-v1';
import { portalDatabaseV1 } from './database-v1';

/** Privacy retention remains scheduled; scoped releases never wait for this maintenance loop. */
export async function portalScheduledV1(env: PortalCompositionEnvV1): Promise<void> {
  if (env.PORTAL_ENVIRONMENT !== 'production' || env.PORTAL_SERVING_ENABLED !== 'true') return;
  try {
    await portalDatabaseV1(env, 'cleanup', (sql) => cleanupPortalV1(sql, 100));
  } catch { /* The connection wrapper already emitted sanitized unavailable. */ }
  try {
    await portalDatabaseV1(env, 'publication', async (sql) => {
      if (env.PORTAL_PUBLICATION_MODE === 'scoped-v2' && await scopedPublicationEnabledV2(sql)) return 'empty';
      // Retained only until the compatible runtime and prepared source store complete their explicit cutover.
      const reconciled = await new PublicationReconcilerV1(sql).run(5);
      const result = await new PublicationJobsV1(sql).run(10);
      if (reconciled.failed || result.unavailable) throw new Error('student-portal-publication-unavailable');
      return result.processed ? 'done' : 'empty';
    });
  } catch { /* Durable legacy leases remain observable during staged migration. */ }
}
