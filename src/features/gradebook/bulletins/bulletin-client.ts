import { BULLETIN_CONTRACT_VERSION_V1 } from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type {
  BulletinWorkspaceTransportRequestV1,
  BulletinWorkspaceTransportResponseV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-transport-v1';

const BULLETIN_ENDPOINT = '/api/gradebook/bulletins';

export type BulletinClientFailureV1 = 'not-authorized' | 'unavailable';

export class BulletinClientErrorV1 extends Error {
  constructor(readonly code: BulletinClientFailureV1) {
    super(code === 'not-authorized' ? 'Bulletins are not authorized.' : 'Bulletins are unavailable.');
    this.name = 'BulletinClientErrorV1';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTransportResponse(
  value: unknown,
  request: BulletinWorkspaceTransportRequestV1,
): value is BulletinWorkspaceTransportResponseV1 {
  return (
    isRecord(value) &&
    value.contractVersion === BULLETIN_CONTRACT_VERSION_V1 &&
    value.operation === request.operation &&
    ['ready', 'empty', 'unavailable', 'not-authorized'].includes(String(value.state))
  );
}

export async function requestBulletinWorkspaceV1(
  request: BulletinWorkspaceTransportRequestV1,
  signal?: AbortSignal,
): Promise<BulletinWorkspaceTransportResponseV1> {
  const response = await fetch(BULLETIN_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new BulletinClientErrorV1('not-authorized');
  }
  if (response.status >= 500) throw new BulletinClientErrorV1('unavailable');
  const payload: unknown = await response.json().catch(() => null);
  if (!isTransportResponse(payload, request)) throw new BulletinClientErrorV1('unavailable');
  if (!response.ok) throw new BulletinClientErrorV1('unavailable');
  return payload;
}
