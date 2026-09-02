import {
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  inspectAuditWorkspaceListRequestV1,
  type AuditWorkspaceItemsPageV1,
  type AuditWorkspaceListRequestV1,
} from '../audit-workspace/audit-workspace-contract-v1';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  inspectCouncilQueueRequestV1,
  type CouncilQueueItemsV1,
  type CouncilQueueRequestV1,
} from '../council/council-workspace-contract-v1';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_AUTHORITY_MODE_V1,
  inspectClassPerformanceRequestV1,
  type ClassPerformanceReadModelV1,
  type ClassPerformanceRequestV1,
} from '../performance/class-performance-read-model-v1';

export const INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1 = 1 as const;
export const INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_ROWS_V1 = 40 as const;
export const INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_COLUMNS_V1 = 12 as const;
export const INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1 = 40 as const;

export const INSTITUTIONAL_REPORT_FAMILIES_V1 = [
  'class-results',
  'composition',
  'recovery',
  'council',
  'audit',
] as const;
export type InstitutionalReportFamilyV1 = (typeof INSTITUTIONAL_REPORT_FAMILIES_V1)[number];

export const INSTITUTIONAL_REPORT_DERIVED_INDICATORS_HARD_STOP_V1 = Object.freeze({
  state: 'fail-closed',
  subresource: 'derived-academic-indicators',
  unavailableIndicators: ['average', 'rate', 'ranking'],
  reason: 'official-semantics-not-integrated',
} as const);

export const INSTITUTIONAL_REPORTS_POLICY_V1 = Object.freeze({
  authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
  projection: 'official-read-models-only',
  academicAggregation: 'forbidden-unless-upstream-official',
  performanceComparison: 'preserve-upstream-result',
  councilEligibility: 'preserve-upstream-projection',
  auditDetails: 'forbidden',
  rawSourceEvidence: 'forbidden',
} as const);

export type InstitutionalPerformanceReportRequestV1 =
  | {
      readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
      readonly family: 'class-results';
      readonly request: ClassPerformanceRequestV1;
    }
  | {
      readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
      readonly family: 'composition';
      readonly request: ClassPerformanceRequestV1;
    }
  | {
      readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
      readonly family: 'recovery';
      readonly request: ClassPerformanceRequestV1;
    };

export interface InstitutionalCouncilReportRequestV1 {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly family: 'council';
  readonly request: CouncilQueueRequestV1;
}

export interface InstitutionalAuditReportRequestV1 {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly family: 'audit';
  readonly request: AuditWorkspaceListRequestV1;
}

export type InstitutionalReportRequestV1 =
  | InstitutionalPerformanceReportRequestV1
  | InstitutionalCouncilReportRequestV1
  | InstitutionalAuditReportRequestV1;

export type InstitutionalPerformanceReportReadyV1 = {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly state: 'ready';
  readonly family: InstitutionalPerformanceReportRequestV1['family'];
  readonly report: ClassPerformanceReadModelV1;
  readonly hardStop: typeof INSTITUTIONAL_REPORT_DERIVED_INDICATORS_HARD_STOP_V1;
};

export type InstitutionalCouncilReportReadyV1 = {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly state: 'ready';
  readonly family: 'council';
  readonly report: CouncilQueueItemsV1;
  readonly hardStop: null;
};

export type InstitutionalAuditReportReadyV1 = {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly state: 'ready';
  readonly family: 'audit';
  readonly report: AuditWorkspaceItemsPageV1;
  readonly hardStop: null;
};

export type InstitutionalReportNonReadyStateV1 =
  | 'empty'
  | 'insufficient-data'
  | 'not-authorized'
  | 'unavailable';

export type InstitutionalReportNonReadyV1 = {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly state: InstitutionalReportNonReadyStateV1;
  readonly family: InstitutionalReportFamilyV1;
  readonly report: null;
  readonly hardStop: null;
};

export type InstitutionalReportTransportFailureV1 = {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly state: 'not-authorized' | 'unavailable';
  readonly report: null;
  readonly hardStop: null;
};

export type InstitutionalReportInvalidRequestV1 = {
  readonly contractVersion: typeof INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1;
  readonly state: 'invalid-request';
  readonly report: null;
  readonly hardStop: null;
};

export type InstitutionalReportResponseV1 =
  | InstitutionalPerformanceReportReadyV1
  | InstitutionalCouncilReportReadyV1
  | InstitutionalAuditReportReadyV1
  | InstitutionalReportNonReadyV1
  | InstitutionalReportTransportFailureV1
  | InstitutionalReportInvalidRequestV1;

export type InstitutionalReportRequestReadinessV1 = 'ready' | 'invalid-request' | 'bounds-exceeded';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isFamily(value: unknown): value is InstitutionalReportFamilyV1 {
  return INSTITUTIONAL_REPORT_FAMILIES_V1.includes(value as InstitutionalReportFamilyV1);
}

function inspectPerformanceFamily(
  family: InstitutionalPerformanceReportRequestV1['family'],
  request: unknown,
): InstitutionalReportRequestReadinessV1 {
  if (inspectClassPerformanceRequestV1(request) !== 'ready') return 'invalid-request';
  const typed = request as ClassPerformanceRequestV1;
  if (
    typed.contractVersion !== CLASS_PERFORMANCE_CONTRACT_VERSION_V1 ||
    typed.rows.limit > INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_ROWS_V1 ||
    typed.columns.limit > INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_COLUMNS_V1
  ) {
    return 'bounds-exceeded';
  }
  if (family === 'class-results') {
    return typed.mode === 'regular' && typed.lens === 'result' ? 'ready' : 'invalid-request';
  }
  if (family === 'composition') {
    return typed.mode === 'regular' && typed.lens !== 'result' ? 'ready' : 'invalid-request';
  }
  return typed.mode === 'recovery' ? 'ready' : 'invalid-request';
}

export function inspectInstitutionalReportRequestV1(
  value: unknown,
): InstitutionalReportRequestReadinessV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['contractVersion', 'family', 'request']) ||
    value.contractVersion !== INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1 ||
    !isFamily(value.family)
  ) {
    return 'invalid-request';
  }

  if (
    value.family === 'class-results' ||
    value.family === 'composition' ||
    value.family === 'recovery'
  ) {
    return inspectPerformanceFamily(value.family, value.request);
  }

  if (value.family === 'council') {
    if (inspectCouncilQueueRequestV1(value.request) !== 'ready') return 'invalid-request';
    const request = value.request as CouncilQueueRequestV1;
    if (
      request.contractVersion !== COUNCIL_WORKSPACE_CONTRACT_VERSION_V1 ||
      request.page.limit > INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1
    ) {
      return 'bounds-exceeded';
    }
    return 'ready';
  }

  if (
    inspectAuditWorkspaceListRequestV1(value.request as AuditWorkspaceListRequestV1) !== 'ready'
  ) {
    return 'invalid-request';
  }
  const request = value.request as AuditWorkspaceListRequestV1;
  if (
    request.contractVersion !== AUDIT_WORKSPACE_CONTRACT_VERSION_V1 ||
    request.page.limit > INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1
  ) {
    return 'bounds-exceeded';
  }
  return 'ready';
}
