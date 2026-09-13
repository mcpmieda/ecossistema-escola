import { portalFailureV1, portalJsonV1 } from '../runtime/http-v1';

/** External deployment gate: missing/unknown values fail closed. This is not an access policy.
 * I must check it before business routes, admin mutations and scheduled materialization.
 * Keep liveness and authorized diagnostics available. Close BEFORE restoring any database.
 */
export function portalServingGateV1(enabled: unknown): Response | null {
  return enabled === 'true' ? null : portalJsonV1(portalFailureV1('unavailable'), 503);
}
