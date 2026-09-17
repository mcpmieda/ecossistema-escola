import {
  performanceAnalyticsRequestSchemaV6,
  performanceAnalyticsResponseSchemaV6,
  performanceAnalyticsMatchesV6,
  type PerformanceAnalyticsRequestV6,
  type PerformanceAnalyticsResponseV6,
} from '../../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import { withPerformanceReadDeadlineV1 } from './performance-read-deadline-v1';

export async function requestPerformanceAnalyticsV6(
  request: PerformanceAnalyticsRequestV6,
  signal?: AbortSignal,
): Promise<PerformanceAnalyticsResponseV6> {
  if (!performanceAnalyticsRequestSchemaV6.safeParse(request).success)
    return { transportVersion: 6, state: 'invalid-request' };
  return withPerformanceReadDeadlineV1<PerformanceAnalyticsResponseV6>(async (readSignal) => {
    const response = await fetch('/api/gradebook/performance', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: readSignal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    });
    if (response.status === 401 || response.status === 403)
      return { transportVersion: 6, state: 'not-authorized' };
    const unavailable = { transportVersion: 6, state: 'unavailable' } as const;
    if (Number(response.headers.get('content-length')) > 2_000_000) return unavailable;
    const text = await response.text();
    if (text.length > 2_000_000) return unavailable;
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      return unavailable;
    }
    const parsed = performanceAnalyticsResponseSchemaV6.safeParse(input);
    if (!parsed.success || !performanceAnalyticsMatchesV6(request, parsed.data)) return unavailable;
    if (!response.ok && parsed.data.state === 'ready') return unavailable;
    return parsed.data;
  }, signal);
}
