import {
  isAcademicYearManagementResponseV1,
  type AcademicYearManagementResponseV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/academic-year-management-v1';

const ENDPOINT = '/api/gradebook/operational-workspace';

async function request(
  body: unknown,
  signal?: AbortSignal,
): Promise<AcademicYearManagementResponseV1> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    return { managementVersion: 1, state: 'not-authorized' };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isAcademicYearManagementResponseV1(payload)) {
    return { managementVersion: 1, state: 'unavailable' };
  }
  return payload;
}

export function listAcademicYearsV1(signal?: AbortSignal) {
  return request({ managementVersion: 1, operation: 'list' }, signal);
}

export function createAcademicYearV1(year: number, signal?: AbortSignal) {
  return request({ managementVersion: 1, operation: 'create', year }, signal);
}
