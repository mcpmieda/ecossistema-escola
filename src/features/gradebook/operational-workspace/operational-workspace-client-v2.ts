import {
  isOperationalWorkspaceRequestV2,
  isOperationalWorkspaceResponseV2,
  workspaceResponseMatchesRequestV2,
  type OperationalWorkspaceRequestV2,
  type OperationalWorkspaceResponseV2,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';

const ENDPOINT = '/api/gradebook/operational-workspace';

export async function requestOperationalWorkspaceV2(
  request: OperationalWorkspaceRequestV2,
  signal?: AbortSignal,
): Promise<OperationalWorkspaceResponseV2> {
  if (!isOperationalWorkspaceRequestV2(request)) {
    return { contractVersion: 2, state: 'invalid-request' };
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (response.status === 401 || response.status === 403) {
    return { contractVersion: 2, state: 'not-authorized' };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return { contractVersion: 2, state: 'unavailable' };
  }
  if (
    !isOperationalWorkspaceResponseV2(value) ||
    !workspaceResponseMatchesRequestV2(request, value) ||
    (!response.ok && value.state === 'ready')
  ) {
    return { contractVersion: 2, state: 'unavailable' };
  }
  return value;
}
