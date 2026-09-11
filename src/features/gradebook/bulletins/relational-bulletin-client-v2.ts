import {
  relationalBulletinResponseMatchesV2,
  relationalBulletinResponseSchemaV2,
  type RelationalBulletinFailureV2,
  type RelationalBulletinRequestV2,
  type RelationalBulletinResponseV2,
} from '../../../../shared/gradebook-contracts/bulletins/relational-bulletin-v2';

const ENDPOINT = '/api/gradebook/bulletins';

export class RelationalBulletinClientErrorV2 extends Error {
  constructor(
    readonly code: RelationalBulletinFailureV2,
    readonly reasons: readonly string[] = [],
  ) {
    super(code);
    this.name = 'RelationalBulletinClientErrorV2';
  }
}

export async function requestRelationalBulletinV2(
  request: RelationalBulletinRequestV2,
  signal?: AbortSignal,
): Promise<RelationalBulletinResponseV2> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new RelationalBulletinClientErrorV2('not-authorized');
  }
  const payload: unknown = await response.json().catch(() => null);
  const parsed = relationalBulletinResponseSchemaV2.safeParse(payload);
  if (!parsed.success || !relationalBulletinResponseMatchesV2(request, parsed.data)) {
    throw new RelationalBulletinClientErrorV2('unavailable');
  }
  if (parsed.data.state !== 'ready') {
    throw new RelationalBulletinClientErrorV2(parsed.data.state, parsed.data.reasons ?? []);
  }
  if (!response.ok) throw new RelationalBulletinClientErrorV2('unavailable');
  return parsed.data;
}
