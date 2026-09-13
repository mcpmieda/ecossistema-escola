import { createHash } from 'node:crypto';

export type AuthBurstGuardV1 = (opaqueSubject: string) => Promise<boolean>;

/** Per-location burst protection complements the durable PG counter; never use IP as identity.
 * I supplies account-unique namespaces with global 600/minute and subject 30/minute limits.
 * https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
export function portalAuthBurstV1(global: Pick<RateLimit, 'limit'>, subject: Pick<RateLimit, 'limit'>): AuthBurstGuardV1 {
  return async (opaqueSubject) => {
    if (opaqueSubject.length > 512) return false;
    try {
      if (!(await global.limit({ key: 'student-portal-auth-v1' })).success) return false;
      const key = createHash('sha256').update('student-portal-burst-v1\0').update(opaqueSubject).digest('hex');
      return (await subject.limit({ key })).success;
    } catch { throw new Error('student-portal-rate-limit-unavailable'); }
  };
}
