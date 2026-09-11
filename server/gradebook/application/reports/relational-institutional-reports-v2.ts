import type { RelationalBulletinResponseV2 } from '../../../../shared/gradebook-contracts/bulletins/relational-bulletin-v2';
import type { RelationalCouncilResponseV3 } from '../../../../shared/gradebook-contracts/council/relational-council-v3';
import type { PerformanceAnalysisResponseV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import type { PerformanceTermComparisonResponseV4 } from '../../../../shared/gradebook-contracts/performance/performance-term-comparison-v4';
import {
  RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
  relationalInstitutionalReportRequestSchemaV2,
  type RelationalInstitutionalPerformanceReportRequestV2,
  type RelationalInstitutionalReportRequestV2,
  type RelationalInstitutionalReportResponseV2,
} from '../../../../shared/gradebook-contracts/reports/relational-institutional-reports-v2';
import type { RelationalImportDiagnosticsReadV2 } from '../../persistence/postgres/relational-import-diagnostics-read-v2';

interface PerformanceAnalysisServiceV3 {
  execute(input: unknown): Promise<PerformanceAnalysisResponseV3>;
}

interface PerformanceComparisonServiceV4 {
  execute(input: unknown): Promise<PerformanceTermComparisonResponseV4>;
}

interface CouncilServiceV3 {
  execute(input: unknown): Promise<RelationalCouncilResponseV3>;
}

interface BulletinServiceV2 {
  execute(
    input: unknown,
    actor: { readonly issuerOid: string },
  ): Promise<RelationalBulletinResponseV2>;
}

export interface RelationalInstitutionalReportsDependenciesV2 {
  readonly performanceAnalysis: PerformanceAnalysisServiceV3;
  readonly performanceComparison: PerformanceComparisonServiceV4;
  readonly council: CouncilServiceV3;
  readonly bulletins: BulletinServiceV2;
  readonly diagnostics: RelationalImportDiagnosticsReadV2;
}

type Operation = RelationalInstitutionalReportRequestV2['operation'];
type Failure = Exclude<RelationalInstitutionalReportResponseV2['state'], 'ready'>;

function failure(operation: Operation, state: Failure): RelationalInstitutionalReportResponseV2 {
  return {
    contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
    operation,
    state,
  };
}

function upstreamFailure(state: string): Failure {
  switch (state) {
    case 'invalid-request': return 'invalid-request';
    case 'not-authorized': return 'not-authorized';
    case 'not-found': return 'not-found';
    case 'scope-too-large': return 'scope-too-large';
    default: return 'unavailable';
  }
}

function analysisRequest(request: RelationalInstitutionalPerformanceReportRequestV2) {
  return {
    transportVersion: 3 as const,
    operation: 'analysis' as const,
    year: request.year,
    classId: request.classId,
    period: request.period,
    mode: request.family === 'recovery' ? 'recovery' as const : 'regular' as const,
    statuses: request.statuses,
    lens: request.lens,
    offerId: null,
  };
}

function comparisonRequest(request: RelationalInstitutionalPerformanceReportRequestV2) {
  if (request.referenceTerm === null || request.period === 'annual') return null;
  return {
    transportVersion: 4 as const,
    operation: 'term-comparison' as const,
    year: request.year,
    classId: request.classId,
    period: request.period,
    mode: request.family === 'recovery' ? 'recovery' as const : 'regular' as const,
    statuses: request.statuses,
    lens: request.lens,
    offerId: null,
    referencePeriod: request.referenceTerm,
  };
}

export function createRelationalInstitutionalReportsServiceV2(
  dependencies: RelationalInstitutionalReportsDependenciesV2,
) {
  return Object.freeze({
    async execute(
      input: unknown,
      actor: { readonly oid: string },
    ): Promise<RelationalInstitutionalReportResponseV2> {
      const parsed = relationalInstitutionalReportRequestSchemaV2.safeParse(input);
      if (!parsed.success) {
        const operation = input !== null && typeof input === 'object' && 'operation' in input &&
          ['catalog', 'performance', 'council', 'audit', 'bulletin-history', 'bulletin-reprint']
            .includes(String(input.operation))
          ? input.operation as Operation
          : 'catalog';
        return failure(operation, 'invalid-request');
      }
      const request = parsed.data;
      try {
        if (request.operation === 'catalog') {
          const report = await dependencies.bulletins.execute({
            contractVersion: 2,
            operation: 'catalog',
            year: request.year,
          }, { issuerOid: actor.oid });
          if (report.state !== 'ready' || report.operation !== 'catalog') {
            return failure(request.operation, upstreamFailure(report.state));
          }
          return {
            contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
            operation: 'catalog',
            state: 'ready',
            year: request.year,
            classes: report.classes.map((item) => ({ id: item.id, code: item.code, name: item.name })),
          };
        }

        if (request.operation === 'performance') {
          const comparison = comparisonRequest(request);
          const report = comparison === null
            ? await dependencies.performanceAnalysis.execute(analysisRequest(request))
            : await dependencies.performanceComparison.execute(comparison);
          if (report.state !== 'ready') {
            return failure(request.operation, upstreamFailure(report.state));
          }
          return {
            contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
            operation: 'performance',
            state: 'ready',
            family: request.family,
            report,
          };
        }

        if (request.operation === 'council') {
          const report = await dependencies.council.execute({
            contractVersion: 3,
            operation: 'workspace',
            year: request.year,
            classId: request.classId,
          });
          if (report.state !== 'ready' || report.operation !== 'workspace') {
            return failure(request.operation, upstreamFailure(report.state));
          }
          return {
            contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
            operation: 'council',
            state: 'ready',
            report,
          };
        }

        if (request.operation === 'audit') {
          const report = await dependencies.diagnostics.list(request);
          return {
            contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
            operation: 'audit',
            state: 'ready',
            items: report.items.map((item) => ({ ...item, academicYear: request.year })),
            nextOffset: report.nextOffset,
          };
        }

        if (request.operation === 'bulletin-history') {
          const report = await dependencies.bulletins.execute({
            contractVersion: 2,
            operation: 'history',
            year: request.year,
            classId: request.classId,
            ...(request.studentIds === undefined ? {} : { studentIds: request.studentIds }),
          }, { issuerOid: actor.oid });
          if (report.state !== 'ready' || report.operation !== 'history') {
            return failure(request.operation, upstreamFailure(report.state));
          }
          return {
            contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
            operation: 'bulletin-history',
            state: 'ready',
            report,
          };
        }

        const report = await dependencies.bulletins.execute({
          contractVersion: 2,
          operation: 'reprint',
          snapshotId: request.snapshotId,
          snapshotVersion: request.snapshotVersion,
        }, { issuerOid: actor.oid });
        if (report.state !== 'ready' || report.operation !== 'reprint') {
          return failure(request.operation, upstreamFailure(report.state));
        }
        return {
          contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
          operation: 'bulletin-reprint',
          state: 'ready',
          report,
        };
      } catch {
        return failure(request.operation, 'unavailable');
      }
    },
  });
}

export type RelationalInstitutionalReportsServiceV2 = ReturnType<
  typeof createRelationalInstitutionalReportsServiceV2
>;
