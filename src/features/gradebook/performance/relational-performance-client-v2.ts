import {
  performanceRequestSchemaV2, performanceResponseSchemaV2, performanceResponseMatchesV2,
  type PerformanceRequestV2, type PerformanceResponseV2,
} from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';

export async function requestRelationalPerformanceV2(request: PerformanceRequestV2, signal?: AbortSignal): Promise<PerformanceResponseV2> {
  if (!performanceRequestSchemaV2.safeParse(request).success) return { transportVersion: 2, state: 'invalid-request' };
  const response = await fetch('/api/gradebook/performance', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request) });
  if (response.status === 401 || response.status === 403) return { transportVersion: 2, state: 'not-authorized' };
  const unavailable = { transportVersion: 2, state: 'unavailable' } as const;
  if (Number(response.headers.get('content-length')) > 2_000_000) return unavailable;
  const text = await response.text();
  if (text.length > 2_000_000) return unavailable;
  let input: unknown;
  try { input = JSON.parse(text); } catch { return unavailable; }
  const parsed = performanceResponseSchemaV2.safeParse(input);
  if (!parsed.success || !performanceResponseMatchesV2(request, parsed.data)) return unavailable;
  if (!response.ok && parsed.data.state === 'ready') return unavailable;
  return parsed.data;
}
