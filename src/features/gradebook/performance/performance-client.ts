import {
  isPerformanceTransportResponseV1,
  type PerformanceTransportRequestV1,
  type PerformanceTransportResponseV1,
} from '../../../../shared/gradebook-contracts/performance/performance-transport-v1';

export const PERFORMANCE_ENDPOINT_V1 = '/api/gradebook/performance';

export async function requestPerformanceV1(
  request: PerformanceTransportRequestV1,
  signal?: AbortSignal,
): Promise<PerformanceTransportResponseV1> {
  const response = await fetch(PERFORMANCE_ENDPOINT_V1, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!isPerformanceTransportResponseV1(payload)) {
    throw new Error('Performance response is incompatible.');
  }
  return payload;
}
