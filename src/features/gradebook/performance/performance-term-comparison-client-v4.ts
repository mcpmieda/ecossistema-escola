import {
  performanceTermComparisonRequestSchemaV4, performanceTermComparisonResponseSchemaV4,
  performanceTermComparisonMatchesV4,
  type PerformanceTermComparisonRequestV4, type PerformanceTermComparisonResponseV4,
} from '../../../../shared/gradebook-contracts/performance/performance-term-comparison-v4';

export async function requestPerformanceTermComparisonV4(
  request: PerformanceTermComparisonRequestV4,
  signal?: AbortSignal,
): Promise<PerformanceTermComparisonResponseV4> {
  if (!performanceTermComparisonRequestSchemaV4.safeParse(request).success) return { transportVersion: 4, state: 'invalid-request' };
  const response = await fetch('/api/gradebook/performance', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request) });
  if (response.status === 401 || response.status === 403) return { transportVersion: 4, state: 'not-authorized' };
  const unavailable = { transportVersion: 4, state: 'unavailable' } as const;
  if (Number(response.headers.get('content-length')) > 2_000_000) return unavailable;
  const text = await response.text();
  if (text.length > 2_000_000) return unavailable;
  let input: unknown;
  try { input = JSON.parse(text); } catch { return unavailable; }
  const parsed = performanceTermComparisonResponseSchemaV4.safeParse(input);
  if (!parsed.success || !performanceTermComparisonMatchesV4(request, parsed.data)) return unavailable;
  if (!response.ok && parsed.data.state === 'ready') return unavailable;
  return parsed.data;
}
