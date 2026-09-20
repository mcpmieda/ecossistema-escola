import { createHash } from 'node:crypto';
import {
  emitPortalAuthBurstMetricV1,
  type PortalAuthBurstMetricV1,
} from './metrics-v1';

export type AuthBurstGuardV1 = (opaqueSubject: string) => Promise<boolean>;
type BurstMetricSinkV1 = (metric: PortalAuthBurstMetricV1) => void;

/** Per-location burst protection complements the durable PG counter; never use IP as identity.
 * I supplies account-unique namespaces with global 600/minute and subject 30/minute limits.
 * https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
export function portalAuthBurstV1(
  global: Pick<RateLimit, 'limit'>,
  subject: Pick<RateLimit, 'limit'>,
  emit: BurstMetricSinkV1 = emitPortalAuthBurstMetricV1,
): AuthBurstGuardV1 {
  return async (opaqueSubject) => {
    if (opaqueSubject.length > 512) {
      emit({ event: 'student-portal-auth-burst-v1', outcome: 'invalid-subject' });
      return false;
    }
    try {
      if (!(await global.limit({ key: 'student-portal-auth-v1' })).success) {
        emit({ event: 'student-portal-auth-burst-v1', outcome: 'global-limited' });
        return false;
      }
      const key = createHash('sha256')
        .update('student-portal-burst-v1\0')
        .update(opaqueSubject)
        .digest('hex');
      if (!(await subject.limit({ key })).success) {
        emit({ event: 'student-portal-auth-burst-v1', outcome: 'subject-limited' });
        return false;
      }
      emit({ event: 'student-portal-auth-burst-v1', outcome: 'allowed' });
      return true;
    } catch {
      emit({ event: 'student-portal-auth-burst-v1', outcome: 'unavailable' });
      throw new Error('student-portal-rate-limit-unavailable');
    }
  };
}
