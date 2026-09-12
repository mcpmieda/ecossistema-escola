import { z } from 'zod';
import { adminCommandV1, adminQueryV1 } from '../../../shared/student-portal-contracts/admin-v1';
import type { FailureV1 } from '../../../shared/student-portal-contracts/core-v1';
import { portalFailureV1 } from './http-v1';

const contextSchema = z
  .object({
    actorId: z.uuid(),
    tenantId: z.uuid(),
    requestId: z.uuid(),
    authenticatedAt: z.iso.datetime({ offset: true }),
    capability: z.enum(['platform.settings.read', 'platform.settings.write']),
  })
  .strict();

/** Validating a context is not authenticating it: only the dedicated ADM binding may call this entrypoint. */
export function refuseUncomposedAdminV1(
  kind: 'query' | 'command',
  context: unknown,
  request: unknown,
  tenant: string,
): FailureV1 {
  const parsed = contextSchema.safeParse(context);
  if (!parsed.success || parsed.data.tenantId !== tenant) return portalFailureV1('forbidden');
  const age = Date.now() - Date.parse(parsed.data.authenticatedAt);
  if (
    age < 0 ||
    age > 300_000 ||
    (kind === 'command' && parsed.data.capability !== 'platform.settings.write')
  )
    return portalFailureV1('forbidden');
  if (!(kind === 'query' ? adminQueryV1 : adminCommandV1).safeParse(request).success)
    return portalFailureV1('invalid-request');
  return portalFailureV1('unavailable');
}
