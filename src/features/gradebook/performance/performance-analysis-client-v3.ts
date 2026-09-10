import {
  performanceAnalysisRequestSchemaV3, performanceAnalysisResponseSchemaV3, performanceAnalysisMatchesV3,
  type PerformanceAnalysisRequestV3, type PerformanceAnalysisResponseV3,
} from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';

export async function requestPerformanceAnalysisV3(request: PerformanceAnalysisRequestV3, signal?: AbortSignal): Promise<PerformanceAnalysisResponseV3> {
  if (!performanceAnalysisRequestSchemaV3.safeParse(request).success) return { transportVersion: 3, state: 'invalid-request' };
  const response = await fetch('/api/gradebook/performance', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request) });
  if (response.status === 401 || response.status === 403) return { transportVersion: 3, state: 'not-authorized' };
  const unavailable = { transportVersion: 3, state: 'unavailable' } as const;
  if (Number(response.headers.get('content-length')) > 2_000_000) return unavailable;
  const text = await response.text();
  if (text.length > 2_000_000) return unavailable;
  let input: unknown;
  try { input = JSON.parse(text); } catch { return unavailable; }
  const parsed = performanceAnalysisResponseSchemaV3.safeParse(input);
  if (!parsed.success || !performanceAnalysisMatchesV3(request, parsed.data)) return unavailable;
  if (!response.ok && parsed.data.state === 'ready') return unavailable;
  return parsed.data;
}
