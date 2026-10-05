import { z } from 'zod';
import { trustedAdminContextV1 } from '../../../shared/student-portal-contracts/admin-v1';
import type { FailureV1 } from '../../../shared/student-portal-contracts/core-v1';
import type { AdminOperationV1 } from '../../../shared/student-portal-contracts/ports-v1';
import {
  checkPortalOperationV1,
  PortalRateLimitErrorV1,
} from '../observability/operation-burst-v1';
import { portalFailureV1 } from '../runtime/http-v1';
import type { PortalCompositionEnvV1 } from './config-v1';

const operationSchema = z.enum(['read', 'import', 'write', 'export', 'live', 'revoke']);
const bindings = {
  read: 'PORTAL_ADMIN_READ',
  import: 'PORTAL_ADMIN_IMPORT',
  write: 'PORTAL_ADMIN_WRITE',
  export: 'PORTAL_ADMIN_EXPORT',
  live: 'PORTAL_ADMIN_LIVE',
  revoke: 'PORTAL_ADMIN_REVOKE',
} as const;

/** Only the named, privately bound ADM entrypoint exposes this RPC. No database is opened. */
export async function limitAdminOperationV1(
  env: PortalCompositionEnvV1,
  context: unknown,
  operation: unknown,
): Promise<FailureV1 | null> {
  const trusted = trustedAdminContextV1.safeParse(context);
  const family = operationSchema.safeParse(operation);
  if (!trusted.success || !family.success) return portalFailureV1('forbidden');
  const fail = (state: FailureV1['state'], retryAfterSeconds?: number): FailureV1 => ({
    ...portalFailureV1(state),
    requestId: trusted.data.requestId,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
  const age = Date.now() - Date.parse(trusted.data.authenticatedAt);
  if (
    !['production', 'local'].includes(env.PORTAL_ENVIRONMENT) ||
    trusted.data.tenantId.toLowerCase() !== env.PORTAL_ADMIN_TENANT_ID.toLowerCase() ||
    age < 0 ||
    age > 300_000
  )
    return fail('forbidden');
  try {
    const subject = `${trusted.data.tenantId.toLowerCase()}:${trusted.data.actorId.toLowerCase()}`;
    await checkPortalOperationV1(env[bindings[family.data]], `admin-${family.data}`, subject);
    return null;
  } catch (error) {
    if (error instanceof PortalRateLimitErrorV1) return fail(error.state, error.retryAfterSeconds);
    return fail('unavailable', 60);
  }
}

export function adminCommandOperationV1(operation: string): AdminOperationV1 {
  if (operation === 'sessions-revoke') return 'revoke';
  if (operation === 'qr-reprint' || operation === 'qr-batch') return 'export';
  return 'write';
}
