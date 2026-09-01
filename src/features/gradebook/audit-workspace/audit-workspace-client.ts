import {
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  AUDIT_WORKSPACE_DETAIL_NON_DISCLOSURE_OUTCOMES_V1,
  AUDIT_WORKSPACE_LIST_NON_DISCLOSURE_OUTCOMES_V1,
  AUDIT_WORKSPACE_RESOLUTION_FAILURE_OUTCOMES_V1,
  isAuditWorkspaceDetailConsistentV1,
  isAuditWorkspaceItemsPageValidV1,
  type AuditWorkspaceDetailRequestV1,
  type AuditWorkspaceDetailResponseV1,
  type AuditWorkspaceListRequestV1,
  type AuditWorkspaceListResponseV1,
  type AuditWorkspaceResolutionRequestV1,
  type AuditWorkspaceResolutionResponseV1,
} from '../../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';

const AUDIT_WORKSPACE_ENDPOINT = '/api/gradebook/audit-workspace';

export type AuditWorkspaceClientFailureV1 = 'not-authorized' | 'unavailable';

export class AuditWorkspaceClientErrorV1 extends Error {
  constructor(readonly code: AuditWorkspaceClientFailureV1) {
    super(code === 'not-authorized' ? 'Audit workspace is not authorized.' : 'Audit workspace is unavailable.');
    this.name = 'AuditWorkspaceClientErrorV1';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isEmptyArray(value: unknown): value is readonly [] {
  return Array.isArray(value) && value.length === 0;
}

function isListResponse(value: unknown): value is AuditWorkspaceListResponseV1 {
  if (!isRecord(value) || value.contractVersion !== AUDIT_WORKSPACE_CONTRACT_VERSION_V1) return false;
  if (value.outcome === 'items') {
    return isAuditWorkspaceItemsPageValidV1(value as unknown as Extract<AuditWorkspaceListResponseV1, { outcome: 'items' }>);
  }
  return (
    hasOnlyKeys(value, ['contractVersion', 'outcome', 'items', 'nextCursor']) &&
    AUDIT_WORKSPACE_LIST_NON_DISCLOSURE_OUTCOMES_V1.includes(
      value.outcome as (typeof AUDIT_WORKSPACE_LIST_NON_DISCLOSURE_OUTCOMES_V1)[number],
    ) &&
    isEmptyArray(value.items) &&
    value.nextCursor === null
  );
}

function isDetailResponse(value: unknown): value is AuditWorkspaceDetailResponseV1 {
  if (!isRecord(value) || value.contractVersion !== AUDIT_WORKSPACE_CONTRACT_VERSION_V1) return false;
  if (value.outcome === 'detail') {
    return (
      hasOnlyKeys(value, ['contractVersion', 'outcome', 'academicYearId', 'detail']) &&
      typeof value.academicYearId === 'string' &&
      value.academicYearId.trim().length > 0 &&
      isRecord(value.detail) &&
      isAuditWorkspaceDetailConsistentV1(
        value.detail as unknown as Extract<AuditWorkspaceDetailResponseV1, { outcome: 'detail' }>['detail'],
      )
    );
  }
  return (
    hasOnlyKeys(value, ['contractVersion', 'outcome', 'detail']) &&
    AUDIT_WORKSPACE_DETAIL_NON_DISCLOSURE_OUTCOMES_V1.includes(
      value.outcome as (typeof AUDIT_WORKSPACE_DETAIL_NON_DISCLOSURE_OUTCOMES_V1)[number],
    ) &&
    value.detail === null
  );
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isResolutionResponse(value: unknown): value is AuditWorkspaceResolutionResponseV1 {
  if (!isRecord(value) || value.contractVersion !== AUDIT_WORKSPACE_CONTRACT_VERSION_V1) return false;
  if (value.outcome === 'applied') {
    return (
      hasOnlyKeys(value, ['contractVersion', 'outcome', 'reference', 'version', 'state']) &&
      isRecord(value.reference) &&
      hasOnlyKeys(value.reference, ['kind', 'id']) &&
      value.reference.kind === 'audit-occurrence' &&
      typeof value.reference.id === 'string' &&
      value.reference.id.trim().length > 0 &&
      positiveInteger(value.version) &&
      ['open', 'acknowledged', 'resolved', 'dismissed-with-reason'].includes(String(value.state))
    );
  }
  if (value.outcome === 'version-conflict') {
    return (
      hasOnlyKeys(value, ['contractVersion', 'outcome', 'currentVersion']) &&
      (value.currentVersion === null || positiveInteger(value.currentVersion))
    );
  }
  return (
    hasOnlyKeys(value, ['contractVersion', 'outcome', 'currentVersion']) &&
    AUDIT_WORKSPACE_RESOLUTION_FAILURE_OUTCOMES_V1.includes(
      value.outcome as (typeof AUDIT_WORKSPACE_RESOLUTION_FAILURE_OUTCOMES_V1)[number],
    ) &&
    value.outcome !== 'version-conflict' &&
    value.currentVersion === null
  );
}

async function post(request: unknown, signal?: AbortSignal): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(AUDIT_WORKSPACE_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new AuditWorkspaceClientErrorV1('not-authorized');
  }
  if (response.status === 503 || response.status >= 500) {
    throw new AuditWorkspaceClientErrorV1('unavailable');
  }
  return { response, payload: await response.json().catch(() => null) };
}

export async function requestAuditWorkspaceListV1(
  request: AuditWorkspaceListRequestV1,
  signal?: AbortSignal,
): Promise<AuditWorkspaceListResponseV1> {
  const { response, payload } = await post(request, signal);
  if (!isListResponse(payload)) throw new AuditWorkspaceClientErrorV1('unavailable');
  if (!response.ok && payload.outcome !== 'invalid-request' && payload.outcome !== 'invalid-cursor') {
    throw new AuditWorkspaceClientErrorV1('unavailable');
  }
  return payload;
}

export async function requestAuditWorkspaceDetailV1(
  request: AuditWorkspaceDetailRequestV1,
  signal?: AbortSignal,
): Promise<AuditWorkspaceDetailResponseV1> {
  const { response, payload } = await post(request, signal);
  if (!isDetailResponse(payload)) throw new AuditWorkspaceClientErrorV1('unavailable');
  if (!response.ok && payload.outcome !== 'invalid-request') {
    throw new AuditWorkspaceClientErrorV1('unavailable');
  }
  return payload;
}

export async function requestAuditWorkspaceResolutionV1(
  request: AuditWorkspaceResolutionRequestV1,
  signal?: AbortSignal,
): Promise<AuditWorkspaceResolutionResponseV1> {
  const { response, payload } = await post(request, signal);
  if (!isResolutionResponse(payload)) throw new AuditWorkspaceClientErrorV1('unavailable');
  if (!response.ok && payload.outcome !== 'invalid-request' && payload.outcome !== 'invalid-transition') {
    throw new AuditWorkspaceClientErrorV1('unavailable');
  }
  return payload;
}
