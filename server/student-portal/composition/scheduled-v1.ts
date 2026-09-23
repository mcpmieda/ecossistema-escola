import { cleanupPortalV1 } from '../maintenance/retention-v1';
import type { PortalCompositionEnvV1 } from './config-v1';
import { portalDatabaseV1 } from './database-v1';

/** Privacy retention is the only scheduled work; scoped releases are read on demand. */
export async function portalScheduledV1(env: PortalCompositionEnvV1): Promise<void> {
  if (env.PORTAL_ENVIRONMENT !== 'production' || env.PORTAL_SERVING_ENABLED !== 'true') return;
  try {
    await portalDatabaseV1(env, 'cleanup', (sql) => cleanupPortalV1(sql, 100));
  } catch { /* The connection wrapper already emitted sanitized unavailable. */ }
}
