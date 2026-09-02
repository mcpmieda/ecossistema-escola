import { describe, expect, it } from 'vitest';
import {
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  AUDIT_WORKSPACE_ORDERS_V1,
} from '../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilClassReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId, ClassGroupId } from '../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceRequestV1,
  type PerformanceLensV1,
  type PerformanceModeV1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import {
  INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
  INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1,
  INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_COLUMNS_V1,
  INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_ROWS_V1,
  INSTITUTIONAL_REPORTS_POLICY_V1,
  INSTITUTIONAL_REPORT_DERIVED_INDICATORS_HARD_STOP_V1,
  inspectInstitutionalReportRequestV1,
} from '../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:6a' as ClassGroupId;
const classReference = 'council-class:synthetic:6a' as CouncilClassReferenceV1;

function performanceRequest(
  mode: PerformanceModeV1,
  lens: PerformanceLensV1,
): ClassPerformanceRequestV1 {
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId,
    classGroupId,
    period: { kind: 'term', term: 1 },
    mode,
    lens,
    comparisonPeriod: { kind: 'term', term: 2 },
    rows: { limit: INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_ROWS_V1, cursor: null },
    columns: { limit: INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_COLUMNS_V1, cursor: null },
    order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
  };
}

describe('Institutional reports contract V1', () => {
  it('aceita as cinco famílias apenas sobre requests oficiais existentes', () => {
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
        family: 'class-results',
        request: performanceRequest('regular', 'result'),
      }),
    ).toBe('ready');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
        family: 'composition',
        request: performanceRequest('regular', 'quantitative'),
      }),
    ).toBe('ready');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
        family: 'recovery',
        request: performanceRequest('recovery', 'result'),
      }),
    ).toBe('ready');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
        family: 'council',
        request: {
          operation: 'queue',
          contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
          academicYearId,
          classReference,
          page: { limit: INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1, cursor: null },
        },
      }),
    ).toBe('ready');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
        family: 'audit',
        request: {
          contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
          academicYearId,
          collection: 'audit-occurrences',
          filters: { occurrenceStates: ['open'] },
          page: { limit: INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1, cursor: null },
          order: AUDIT_WORKSPACE_ORDERS_V1['audit-occurrences'],
        },
      }),
    ).toBe('ready');
  });

  it('rejeita troca de semântica entre família, modo e lente', () => {
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: 1,
        family: 'class-results',
        request: performanceRequest('regular', 'quantitative'),
      }),
    ).toBe('invalid-request');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: 1,
        family: 'composition',
        request: performanceRequest('regular', 'result'),
      }),
    ).toBe('invalid-request');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: 1,
        family: 'recovery',
        request: performanceRequest('regular', 'result'),
      }),
    ).toBe('invalid-request');
  });

  it('aplica bounds operacionais menores que os contratos-fontes e rejeita regras client-side', () => {
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: 1,
        family: 'class-results',
        request: {
          ...performanceRequest('regular', 'result'),
          rows: { limit: INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_ROWS_V1 + 1, cursor: null },
        },
      }),
    ).toBe('bounds-exceeded');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: 1,
        family: 'council',
        request: {
          operation: 'queue',
          contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
          academicYearId,
          classReference,
          page: { limit: INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1 + 1, cursor: null },
        },
      }),
    ).toBe('bounds-exceeded');
    expect(
      inspectInstitutionalReportRequestV1({
        contractVersion: 1,
        family: 'class-results',
        request: performanceRequest('regular', 'result'),
        academicRules: [{ formula: 'synthetic-forbidden' }],
      }),
    ).toBe('invalid-request');
  });

  it('mantém agregações derivadas fail-closed sem valor substituto', () => {
    expect(INSTITUTIONAL_REPORT_DERIVED_INDICATORS_HARD_STOP_V1).toEqual({
      state: 'fail-closed',
      subresource: 'derived-academic-indicators',
      unavailableIndicators: ['average', 'rate', 'ranking'],
      reason: 'official-semantics-not-integrated',
    });
    expect(INSTITUTIONAL_REPORTS_POLICY_V1).toMatchObject({
      authorityMode: 'imported-source',
      academicAggregation: 'forbidden-unless-upstream-official',
      performanceComparison: 'preserve-upstream-result',
      councilEligibility: 'preserve-upstream-projection',
      auditDetails: 'forbidden',
      rawSourceEvidence: 'forbidden',
    });
  });
});
