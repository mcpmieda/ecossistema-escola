import {
  performanceDashboardMatchesV5,
  performanceDashboardRequestSchemaV5,
  performanceDashboardResponseSchemaV5,
  type PerformanceDashboardRequestV5,
  type PerformanceDashboardResponseV5,
} from '../../../../shared/gradebook-contracts/performance/performance-dashboard-v5';

export async function requestPerformanceDashboardV5(
  request: PerformanceDashboardRequestV5,
  signal?: AbortSignal,
): Promise<PerformanceDashboardResponseV5> {
  if (!performanceDashboardRequestSchemaV5.safeParse(request).success) {
    return { transportVersion: 5, state: 'invalid-request' };
  }
  const response = await fetch('/api/gradebook/performance', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
  });
  if (response.status === 401 || response.status === 403) {
    return { transportVersion: 5, state: 'not-authorized' };
  }
  const unavailable = { transportVersion: 5, state: 'unavailable' } as const;
  if (Number(response.headers.get('content-length')) > 2_000_000) return unavailable;
  const text = await response.text();
  if (text.length > 2_000_000) return unavailable;
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return unavailable;
  }
  const parsed = performanceDashboardResponseSchemaV5.safeParse(input);
  if (!parsed.success || !performanceDashboardMatchesV5(request, parsed.data)) return unavailable;
  if (!response.ok && parsed.data.state === 'ready') return unavailable;
  return parsed.data;
}
