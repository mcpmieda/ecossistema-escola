import {
  YEAR_RESET_CONTRACT_VERSION_V1,
  yearResetRequestSchemaV1,
  yearResetResponseSchemaV1,
  type YearResetRequestV1,
  type YearResetResponseV1,
} from '../../../../shared/gradebook-contracts/settings/year-reset-contract-v1';

const ENDPOINT = '/api/gradebook/year-reset';

function fallback(state: 'not-authorized' | 'unavailable'): YearResetResponseV1 {
  return { contractVersion: YEAR_RESET_CONTRACT_VERSION_V1, state };
}

export async function requestYearResetV1(
  request: YearResetRequestV1,
  signal?: AbortSignal,
): Promise<YearResetResponseV1> {
  if (!yearResetRequestSchemaV1.safeParse(request).success) {
    return { contractVersion: YEAR_RESET_CONTRACT_VERSION_V1, state: 'invalid-request' };
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) return fallback('not-authorized');
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return fallback('unavailable');
  }
  const parsed = yearResetResponseSchemaV1.safeParse(value);
  return parsed.success ? parsed.data : fallback('unavailable');
}
