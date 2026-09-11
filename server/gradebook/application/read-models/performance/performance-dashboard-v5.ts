import {
  dashboardAnalysisRequestV3,
  performanceDashboardMatchesV5,
  performanceDashboardRequestSchemaV5,
  performanceDashboardResponseSchemaV5,
  type PerformanceDashboardResponseV5,
  type PerformanceDashboardV5,
} from '../../../../../shared/gradebook-contracts/performance/performance-dashboard-v5';
import { performanceTermComparisonRequestSchemaV4 } from '../../../../../shared/gradebook-contracts/performance/performance-term-comparison-v4';
import type { PerformanceAnalysisV3 } from '../../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import type { PerformanceProjectionV2 } from '../../results/relational-performance-facts-v2';
import type { D1WriteDatabaseV1 } from '../../../persistence/d1/write/d1-write-adapter-v1';
import { buildPerformanceAnalysisV3 } from './performance-analysis-v3';
import { buildPerformanceTermComparisonV4 } from './performance-term-comparison-v4';
import { readRelationalPerformanceV2 } from './relational-performance-v2';

export function buildPerformanceDashboardOverviewV5(
  analysis: PerformanceAnalysisV3,
): PerformanceDashboardV5['overview'] {
  const eligibleIds = analysis.matrix.rows
    .filter((row) => row.student.indicatorEligible)
    .map((row) => row.student.id);
  const groups = {
    allAtOrAbove: [] as number[],
    withBelow: [] as number[],
    pending: [] as number[],
  };
  const rows = new Map(analysis.rows.map((row) => [row.studentId, row]));
  for (const studentId of eligibleIds) {
    const row = rows.get(studentId);
    const buckets = row?.values.map((value) => value.bucket) ?? [];
    if (buckets.some((bucket) => bucket === 'below')) groups.withBelow.push(studentId);
    else if (buckets.length > 0 && buckets.every((bucket) => bucket === 'above')) {
      groups.allAtOrAbove.push(studentId);
    } else groups.pending.push(studentId);
  }
  return {
    denominator: 'eligible-students-in-current-scope',
    students: {
      eligible: eligibleIds.length,
      classified: groups.allAtOrAbove.length + groups.withBelow.length,
      allAtOrAbove: groups.allAtOrAbove.length,
      withBelow: groups.withBelow.length,
      pending: groups.pending.length,
    },
    groups,
    columns: analysis.columns.map((column) => ({
      key: column.key,
      offerId: column.offerId,
      label: column.label,
      considered: column.summary.considered,
      atOrAbove: column.summary.groups.above.length,
      below: column.summary.groups.below.length,
      incomplete: column.summary.groups.incomplete.length,
      noShow: column.summary.groups['no-show'].length,
      unscaled: column.summary.groups.unscaled.length,
    })),
  };
}

export function createPerformanceDashboardV5(database: D1WriteDatabaseV1) {
  return {
    async execute(input: unknown): Promise<PerformanceDashboardResponseV5> {
      const parsed = performanceDashboardRequestSchemaV5.safeParse(input);
      if (!parsed.success) return { transportVersion: 5, state: 'invalid-request' };
      if (!('transaction' in database) || typeof database.transaction !== 'function') {
        return { transportVersion: 5, state: 'unavailable' };
      }
      const request = parsed.data;
      const db = database as D1WriteDatabaseV1 & {
        transaction<T>(operation: (tx: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
      };
      return db.transaction(async (tx) => {
        await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        let projections: ReadonlyMap<number, readonly PerformanceProjectionV2[]> = new Map();
        const matrix = await readRelationalPerformanceV2(
          tx,
          {
            transportVersion: 2,
            operation: 'matrix',
            year: request.year,
            classId: request.classId,
            period: request.period,
            mode: request.mode,
            statuses: request.statuses,
          },
          {
            ...(request.offerId === null ? {} : { descriptionOfferId: request.offerId }),
            collect: (value) => {
              projections = value;
            },
          },
        );
        if (matrix.state !== 'ready') return { transportVersion: 5, state: matrix.state } as const;
        if (matrix.operation !== 'matrix') throw new Error('unexpected-dashboard-operation');
        if (
          request.offerId !== null &&
          !matrix.offers.some((offer) => offer.id === request.offerId)
        ) {
          return { transportVersion: 5, state: 'not-found' } as const;
        }
        const analysis = buildPerformanceAnalysisV3(
          matrix,
          projections,
          dashboardAnalysisRequestV3(request),
        );
        const view =
          request.referencePeriod === null
            ? analysis
            : buildPerformanceTermComparisonV4(
                matrix,
                projections,
                performanceTermComparisonRequestSchemaV4.parse({
                  transportVersion: 4,
                  operation: 'term-comparison',
                  year: request.year,
                  classId: request.classId,
                  period: request.period,
                  mode: request.mode,
                  statuses: request.statuses,
                  lens: request.lens,
                  offerId: null,
                  referencePeriod: request.referencePeriod,
                }),
              );
        const response = performanceDashboardResponseSchemaV5.parse({
          transportVersion: 5,
          operation: 'dashboard',
          state: 'ready',
          view,
          overview: buildPerformanceDashboardOverviewV5(analysis),
        });
        if (!performanceDashboardMatchesV5(request, response)) {
          throw new Error('inconsistent-dashboard-response');
        }
        return response;
      });
    },
  };
}
