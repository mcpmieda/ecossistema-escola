import {
  COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
  COUNCIL_INSTITUTIONAL_FAILURE_OUTCOMES_V2,
  type CouncilClosureCloseRequestV2,
  type CouncilClosureCloseResponseV2,
  type CouncilClosureHistoryRequestV2,
  type CouncilClosureHistoryResponseV2,
  type CouncilClosureReviewRequestV2,
  type CouncilClosureReviewResponseV2,
  type CouncilInstitutionalFailureV2,
  type CouncilTieBreakRequestV2,
  type CouncilTieBreakResponseV2,
  type CouncilVoteRequestV2,
  type CouncilVoteResponseV2,
} from '../../../../shared/gradebook-contracts/council/council-institutional-contract-v2';

const COUNCIL_WORKSPACE_ENDPOINT = '/api/gradebook/council-workspace';

export type CouncilInstitutionalClientFailureV2 = 'not-authorized' | 'unavailable';

export class CouncilInstitutionalClientErrorV2 extends Error {
  override readonly name = 'CouncilInstitutionalClientErrorV2';

  constructor(readonly code: CouncilInstitutionalClientFailureV2) {
    super(
      code === 'not-authorized'
        ? 'Council institutional workspace is not authorized.'
        : 'Council institutional workspace is unavailable.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFailure(value: unknown): value is CouncilInstitutionalFailureV2 {
  return (
    isRecord(value) &&
    value.contractVersion === COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2 &&
    COUNCIL_INSTITUTIONAL_FAILURE_OUTCOMES_V2.includes(
      value.outcome as (typeof COUNCIL_INSTITUTIONAL_FAILURE_OUTCOMES_V2)[number],
    )
  );
}

async function post(
  request: unknown,
  signal?: AbortSignal,
): Promise<{ readonly response: Response; readonly payload: unknown }> {
  const response = await fetch(COUNCIL_WORKSPACE_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new CouncilInstitutionalClientErrorV2('not-authorized');
  }
  if (response.status === 503 || response.status >= 500) {
    throw new CouncilInstitutionalClientErrorV2('unavailable');
  }
  return { response, payload: await response.json().catch(() => null) };
}

function acceptsLogicalFailure(response: Response, payload: CouncilInstitutionalFailureV2): boolean {
  return response.ok || (response.status === 400 && payload.outcome === 'invalid-request');
}

export async function requestCouncilClosureReviewV2(
  request: CouncilClosureReviewRequestV2,
  signal?: AbortSignal,
): Promise<CouncilClosureReviewResponseV2> {
  const { response, payload } = await post(request, signal);
  if (
    isRecord(payload) &&
    payload.contractVersion === COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2 &&
    payload.outcome === 'review' &&
    isRecord(payload.meeting) &&
    Array.isArray(payload.items) &&
    Array.isArray(payload.blockers) &&
    typeof payload.reviewReference === 'string' &&
    typeof payload.canClose === 'boolean'
  ) {
    if (!response.ok) throw new CouncilInstitutionalClientErrorV2('unavailable');
    return payload as unknown as CouncilClosureReviewResponseV2;
  }
  if (isFailure(payload) && acceptsLogicalFailure(response, payload)) return payload;
  throw new CouncilInstitutionalClientErrorV2('unavailable');
}

export async function requestCouncilVoteV2(
  request: CouncilVoteRequestV2,
  signal?: AbortSignal,
): Promise<CouncilVoteResponseV2> {
  const { response, payload } = await post(request, signal);
  if (
    isRecord(payload) &&
    payload.contractVersion === COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2 &&
    payload.outcome === 'vote-applied' &&
    Number.isInteger(payload.version) &&
    isRecord(payload.vote)
  ) {
    if (!response.ok) throw new CouncilInstitutionalClientErrorV2('unavailable');
    return payload as unknown as CouncilVoteResponseV2;
  }
  if (isFailure(payload) && acceptsLogicalFailure(response, payload)) return payload;
  throw new CouncilInstitutionalClientErrorV2('unavailable');
}

export async function requestCouncilTieBreakV2(
  request: CouncilTieBreakRequestV2,
  signal?: AbortSignal,
): Promise<CouncilTieBreakResponseV2> {
  const { response, payload } = await post(request, signal);
  if (isFailure(payload) && acceptsLogicalFailure(response, payload)) return payload;
  throw new CouncilInstitutionalClientErrorV2('unavailable');
}

export async function requestCouncilClosureCloseV2(
  request: CouncilClosureCloseRequestV2,
  signal?: AbortSignal,
): Promise<CouncilClosureCloseResponseV2> {
  const { response, payload } = await post(request, signal);
  if (
    isRecord(payload) &&
    payload.contractVersion === COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2 &&
    payload.outcome === 'closed' &&
    Number.isInteger(payload.version) &&
    isRecord(payload.snapshot)
  ) {
    if (!response.ok) throw new CouncilInstitutionalClientErrorV2('unavailable');
    return payload as unknown as CouncilClosureCloseResponseV2;
  }
  if (isFailure(payload) && acceptsLogicalFailure(response, payload)) return payload;
  throw new CouncilInstitutionalClientErrorV2('unavailable');
}

export async function requestCouncilClosureHistoryV2(
  request: CouncilClosureHistoryRequestV2,
  signal?: AbortSignal,
): Promise<CouncilClosureHistoryResponseV2> {
  const { response, payload } = await post(request, signal);
  if (
    isRecord(payload) &&
    payload.contractVersion === COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2 &&
    payload.outcome === 'closure-history' &&
    isRecord(payload.meeting) &&
    Array.isArray(payload.entries)
  ) {
    if (!response.ok) throw new CouncilInstitutionalClientErrorV2('unavailable');
    return payload as unknown as CouncilClosureHistoryResponseV2;
  }
  if (isFailure(payload) && acceptsLogicalFailure(response, payload)) return payload;
  throw new CouncilInstitutionalClientErrorV2('unavailable');
}
