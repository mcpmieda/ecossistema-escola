import {
  isOperationalWorkspaceTransportResponseV1,
  type OperationalWorkspaceTransportRequestV1,
  type OperationalWorkspaceTransportResponseV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';

const OPERATIONAL_WORKSPACE_ENDPOINT = '/api/gradebook/operational-workspace';

export async function requestOperationalWorkspaceV1(
  request: OperationalWorkspaceTransportRequestV1,
  signal?: AbortSignal,
): Promise<OperationalWorkspaceTransportResponseV1> {
  const response = await fetch(OPERATIONAL_WORKSPACE_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!isOperationalWorkspaceTransportResponseV1(payload)) {
    throw new Error('Operational workspace response is incompatible.');
  }
  return payload;
}
