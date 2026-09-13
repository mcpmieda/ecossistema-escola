import { adminCommandV1, adminQueryV1, trustedAdminContextV1 } from '../../../shared/student-portal-contracts/admin-v1';
import { PortalAdminApiV1 } from '../admin/api-v1';
import { withAuditSqlV1 } from '../observability/audit-context-v1';
import { portalFailureV1 } from '../runtime/http-v1';
import { portalKeysV1, type PortalCompositionEnvV1 } from './config-v1';
import { portalDatabaseV1 } from './database-v1';

/** Invoked exclusively by the named RPC capability; never dispatched from public HTTP. */
export async function portalAdminRpcV1(env: PortalCompositionEnvV1, kind: 'query' | 'command', context: unknown, input: unknown) {
  const trusted = trustedAdminContextV1.safeParse(context);
  if (!trusted.success) return portalFailureV1('forbidden');
  const fail = (state: 'forbidden' | 'invalid-request' | 'unavailable') => ({ ...portalFailureV1(state), requestId: trusted.data.requestId });
  const age = Date.now() - Date.parse(trusted.data.authenticatedAt);
  if (env.PORTAL_ENVIRONMENT !== 'production' || trusted.data.tenantId.toLowerCase() !== env.PORTAL_ADMIN_TENANT_ID.toLowerCase()
    || age < 0 || age > 300_000 || (kind === 'command' && trusted.data.capability !== 'platform.settings.write')) return fail('forbidden');
  const parsed = kind === 'query' ? adminQueryV1.safeParse(input) : adminCommandV1.safeParse(input);
  if (!parsed.success) return fail('invalid-request');
  if (env.PORTAL_SERVING_ENABLED !== 'true' && !(kind === 'query' && parsed.data.operation === 'health')) return fail('unavailable');
  try {
    const keys = portalKeysV1(env);
    return await portalDatabaseV1(env, kind === 'query' ? 'admin-query' : 'admin-command', (sql) =>
      new PortalAdminApiV1(withAuditSqlV1(sql, trusted.data.clientIp ?? null), { ...keys, tenantId: env.PORTAL_ADMIN_TENANT_ID })[kind](trusted.data, parsed.data));
  } catch { return fail('unavailable'); }
}
