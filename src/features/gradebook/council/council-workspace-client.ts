import {
  COUNCIL_DECISION_FAILURE_OUTCOMES_V1,
  COUNCIL_DETAIL_NON_DISCLOSURE_OUTCOMES_V1,
  COUNCIL_LIST_NON_DISCLOSURE_OUTCOMES_V1,
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilDecisionRequestV1,
  type CouncilDecisionResponseV1,
  type CouncilQueueRequestV1,
  type CouncilQueueResponseV1,
  type CouncilStudentRequestV1,
  type CouncilStudentResponseV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';

const COUNCIL_WORKSPACE_ENDPOINT = '/api/gradebook/council-workspace';

export type CouncilWorkspaceClientFailureV1 = 'not-authorized' | 'unavailable';

export class CouncilWorkspaceClientErrorV1 extends Error {
  override readonly name = 'CouncilWorkspaceClientErrorV1';

  constructor(readonly code: CouncilWorkspaceClientFailureV1) {
    super(
      code === 'not-authorized'
        ? 'Council workspace is not authorized.'
        : 'Council workspace is unavailable.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isQueueResponse(value: unknown): value is CouncilQueueResponseV1 {
  if (!isRecord(value) || value.contractVersion !== COUNCIL_WORKSPACE_CONTRACT_VERSION_V1) {
    return false;
  }
  if (value.outcome === 'items') {
    return Array.isArray(value.items) && typeof value.classReference === 'string';
  }
  return (
    COUNCIL_LIST_NON_DISCLOSURE_OUTCOMES_V1.includes(
      value.outcome as (typeof COUNCIL_LIST_NON_DISCLOSURE_OUTCOMES_V1)[number],
    ) &&
    Array.isArray(value.items) &&
    value.items.length === 0 &&
    value.nextCursor === null
  );
}

function isStudentResponse(value: unknown): value is CouncilStudentResponseV1 {
  if (!isRecord(value) || value.contractVersion !== COUNCIL_WORKSPACE_CONTRACT_VERSION_V1) {
    return false;
  }
  if (value.outcome === 'detail') return isRecord(value.detail);
  return (
    COUNCIL_DETAIL_NON_DISCLOSURE_OUTCOMES_V1.includes(
      value.outcome as (typeof COUNCIL_DETAIL_NON_DISCLOSURE_OUTCOMES_V1)[number],
    ) && value.detail === null
  );
}

function isDecisionResponse(value: unknown): value is CouncilDecisionResponseV1 {
  if (!isRecord(value) || value.contractVersion !== COUNCIL_WORKSPACE_CONTRACT_VERSION_V1) {
    return false;
  }
  if (value.outcome === 'applied') return isRecord(value.record) && Number.isInteger(value.version);
  return COUNCIL_DECISION_FAILURE_OUTCOMES_V1.includes(
    value.outcome as (typeof COUNCIL_DECISION_FAILURE_OUTCOMES_V1)[number],
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
    throw new CouncilWorkspaceClientErrorV1('not-authorized');
  }
  if (response.status === 503 || response.status >= 500) {
    throw new CouncilWorkspaceClientErrorV1('unavailable');
  }
  return { response, payload: await response.json().catch(() => null) };
}

export async function requestCouncilQueueV1(
  request: CouncilQueueRequestV1,
  signal?: AbortSignal,
): Promise<CouncilQueueResponseV1> {
  const { response, payload } = await post(request, signal);
  if (!isQueueResponse(payload)) throw new CouncilWorkspaceClientErrorV1('unavailable');
  if (!response.ok && payload.outcome !== 'invalid-request' && payload.outcome !== 'invalid-cursor') {
    throw new CouncilWorkspaceClientErrorV1('unavailable');
  }
  return payload;
}

export async function requestCouncilStudentV1(
  request: CouncilStudentRequestV1,
  signal?: AbortSignal,
): Promise<CouncilStudentResponseV1> {
  const { response, payload } = await post(request, signal);
  if (!isStudentResponse(payload)) throw new CouncilWorkspaceClientErrorV1('unavailable');
  if (!response.ok && payload.outcome !== 'invalid-request') {
    throw new CouncilWorkspaceClientErrorV1('unavailable');
  }
  return payload;
}

export async function requestCouncilDecisionV1(
  request: CouncilDecisionRequestV1,
  signal?: AbortSignal,
): Promise<CouncilDecisionResponseV1> {
  const { response, payload } = await post(request, signal);
  if (!isDecisionResponse(payload)) throw new CouncilWorkspaceClientErrorV1('unavailable');
  if (!response.ok && payload.outcome !== 'invalid-request') {
    throw new CouncilWorkspaceClientErrorV1('unavailable');
  }
  return payload;
}
