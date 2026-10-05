import { emitPortalOperationBurstMetricV1 } from './metrics-v1';
import { createHash } from 'node:crypto';
import { portalJsonV1 } from '../runtime/http-v1';
import type { FailureV1 } from '../../../shared/student-portal-contracts/core-v1';

/** The provider has no precise reset timestamp. Every configured window is 60 seconds. */
export class PortalRateLimitErrorV1 extends Error {
  readonly retryAfterSeconds = 60;
  constructor(readonly state: 'rate-limited' | 'unavailable') {
    super('student-portal-operation-' + state);
  }
}

/** Native per-location burst containment, not a global accounting or authorization system.
 * Call only with closed server operation names and a bounded subject. Never log the key.
 */
export async function checkPortalOperationV1(binding: Pick<RateLimit, 'limit'> | undefined,
  operation: string, subject: string): Promise<void> {
  const started = Date.now();
  let outcome: 'allowed' | 'limited' | 'unavailable' = 'unavailable';
  try {
    if (!binding || !/^[a-z][a-z0-9-]{0,63}$/u.test(operation) || !subject || subject.length > 512)
      throw new PortalRateLimitErrorV1('unavailable');
    let success: boolean;
    try {
      const key = createHash('sha256').update('student-portal:operation:v1\0')
        .update(operation).update('\0').update(subject).digest('hex');
      const result = await binding.limit({ key });
      if (typeof result?.success !== 'boolean') throw new Error('invalid-rate-limit-response');
      success = result.success;
    } catch { throw new PortalRateLimitErrorV1('unavailable'); }
    outcome = success ? 'allowed' : 'limited';
    if (!success) throw new PortalRateLimitErrorV1('rate-limited');
  } finally {
    emitPortalOperationBurstMetricV1({ event: 'student-portal-operation-burst-v1', operation, outcome,
      elapsedMs: Math.max(0, Date.now() - started) });
  }
}

export function portalRateLimitResponseV1(error: PortalRateLimitErrorV1, requestId = crypto.randomUUID()): Response {
  const body: FailureV1 = { contractVersion: 1, requestId, state: error.state,
    ...(error.state === 'rate-limited' ? { retryAfterSeconds: error.retryAfterSeconds } : {}) };
  const response = portalJsonV1(body, error.state === 'rate-limited' ? 429 : 503);
  if (error.state === 'rate-limited') response.headers.set('Retry-After', String(error.retryAfterSeconds));
  return response;
}
