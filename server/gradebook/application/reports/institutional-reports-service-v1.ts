import type {
  AuditWorkspaceListRequestV1,
  AuditWorkspaceListResponseV1,
} from '../../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import type {
  CouncilQueueRequestV1,
  CouncilQueueResponseV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type {
  ClassPerformanceReadModelV1,
  ClassPerformanceRequestV1,
} from '../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import {
  INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
  INSTITUTIONAL_REPORT_DERIVED_INDICATORS_HARD_STOP_V1,
  inspectInstitutionalReportRequestV1,
  type InstitutionalReportFamilyV1,
  type InstitutionalReportNonReadyStateV1,
  type InstitutionalReportRequestV1,
  type InstitutionalReportResponseV1,
} from '../../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';

export interface InstitutionalReportsPerformanceSourceV1 {
  get(request: ClassPerformanceRequestV1): Promise<ClassPerformanceReadModelV1 | null>;
}

export interface InstitutionalReportsCouncilSourceV1 {
  queue(request: CouncilQueueRequestV1): Promise<CouncilQueueResponseV1>;
}

export interface InstitutionalReportsAuditSourceV1 {
  list(request: AuditWorkspaceListRequestV1): Promise<AuditWorkspaceListResponseV1>;
}

export interface InstitutionalReportsServiceDependenciesV1 {
  readonly performance: InstitutionalReportsPerformanceSourceV1;
  readonly council: InstitutionalReportsCouncilSourceV1;
  readonly audit: InstitutionalReportsAuditSourceV1;
}

function nonReady(
  family: InstitutionalReportFamilyV1,
  state: InstitutionalReportNonReadyStateV1,
): InstitutionalReportResponseV1 {
  return {
    contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
    state,
    family,
    report: null,
    hardStop: null,
  };
}

function invalidRequest(): InstitutionalReportResponseV1 {
  return {
    contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
    state: 'invalid-request',
    report: null,
    hardStop: null,
  };
}

function councilFailure(
  response: Exclude<CouncilQueueResponseV1, { readonly outcome: 'items' }>,
): InstitutionalReportNonReadyStateV1 {
  switch (response.outcome) {
    case 'no-results':
      return 'empty';
    case 'insufficient-data':
      return 'insufficient-data';
    case 'not-authorized':
      return 'not-authorized';
    case 'invalid-request':
    case 'invalid-cursor':
    case 'unavailable':
      return 'unavailable';
  }
}

function auditFailure(
  response: Exclude<AuditWorkspaceListResponseV1, { readonly outcome: 'items' }>,
): InstitutionalReportNonReadyStateV1 {
  switch (response.outcome) {
    case 'no-results':
      return 'empty';
    case 'insufficient-data':
      return 'insufficient-data';
    case 'not-authorized':
      return 'not-authorized';
    case 'invalid-request':
    case 'invalid-cursor':
    case 'unavailable':
      return 'unavailable';
  }
}

export function createInstitutionalReportsServiceV1(
  dependencies: InstitutionalReportsServiceDependenciesV1,
) {
  return Object.freeze({
    async execute(request: InstitutionalReportRequestV1): Promise<InstitutionalReportResponseV1> {
      if (inspectInstitutionalReportRequestV1(request) !== 'ready') return invalidRequest();

      try {
        if (
          request.family === 'class-results' ||
          request.family === 'composition' ||
          request.family === 'recovery'
        ) {
          const report = await dependencies.performance.get(request.request);
          return report === null
            ? nonReady(request.family, 'empty')
            : {
                contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
                state: 'ready',
                family: request.family,
                report,
                hardStop: INSTITUTIONAL_REPORT_DERIVED_INDICATORS_HARD_STOP_V1,
              };
        }

        if (request.family === 'council') {
          const report = await dependencies.council.queue(request.request);
          return report.outcome === 'items'
            ? {
                contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
                state: 'ready',
                family: 'council',
                report,
                hardStop: null,
              }
            : nonReady('council', councilFailure(report));
        }

        const report = await dependencies.audit.list(request.request);
        return report.outcome === 'items'
          ? {
              contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
              state: 'ready',
              family: 'audit',
              report,
              hardStop: null,
            }
          : nonReady('audit', auditFailure(report));
      } catch {
        return nonReady(request.family, 'unavailable');
      }
    },
  });
}

export type InstitutionalReportsServiceV1 = ReturnType<typeof createInstitutionalReportsServiceV1>;
