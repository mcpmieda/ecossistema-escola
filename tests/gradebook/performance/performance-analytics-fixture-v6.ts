import { buildPerformanceAnalyticsV6 } from '../../../server/gradebook/application/read-models/performance/performance-analytics-v6';
import {
  EMPTY_PERFORMANCE_CLOSING_V2,
  performanceCellV2,
  projectPerformanceFactsV2,
} from '../../../server/gradebook/application/results/relational-performance-facts-v2';
import { performanceAnalyticsResponseSchemaV6 } from '../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import type {
  PerformanceMatrixV2,
  PerformancePeriodV2,
} from '../../../shared/gradebook-contracts/performance/relational-performance-v2';

/** Invented data only. Shared by interaction tests and local visual QA, never imported by production. */
export function performanceAnalyticsFixtureV6({
  year = 2026,
  classId = 10,
  period = 1,
  revision = 0,
  studentCount = 4,
  componentCount = 3,
}: {
  year?: number;
  classId?: number;
  period?: PerformancePeriodV2;
  revision?: number;
  studentCount?: number;
  componentCount?: number;
} = {}) {
  const names = ['Matemática', 'Português', 'Ciências', 'História', 'Geografia'];
  const offers = Array.from({ length: componentCount }, (_, index) => ({
    id: index + 10,
    subject: {
      id: index + 1,
      label: names[index] ?? `Componente ${index + 1}`,
      abbreviation: ['MAT', 'POR', 'CIE', 'HIS', 'GEO'][index] ?? `C${index + 1}`,
    },
    teacher: { id: (index % 2) + 1, label: `Docente sintético ${(index % 2) + 1}` },
  }));
  const projections = new Map(
    Array.from({ length: studentCount }, (_, student) => [
      student + 1,
      offers.map((offer, component) => {
        const facts = ([1, 2, 3] as const).flatMap((term) =>
          ([1, 2, 11, 12, 13, 14, 15] as const).map((slot) => {
            const maximumMilli = slot >= 11 ? (term === 3 ? 4400 : 3300) : term === 3 ? 9000 : 6750;
            const rate =
              0.3 + ((student * 13 + component * 17 + term * 7 + slot * 3 + revision) % 65) / 100;
            return {
              term,
              slot,
              label: slot >= 11 ? `Atividade ${slot - 10}` : `${slot}ª avaliação`,
              maximumMilli,
              valueMilli:
                (student === 2 && term === 2 && slot === 2) || (student === 3 && term === 3)
                  ? null
                  : student === 1 && slot === 1
                    ? 0
                    : Math.round(maximumMilli * rate),
            };
          }),
        );
        return projectPerformanceFactsV2(offer.id, facts, EMPTY_PERFORMANCE_CLOSING_V2, 60000);
      }),
    ]),
  );
  const rows: PerformanceMatrixV2['rows'] = [...projections].map(([id, values]) => ({
    student: {
      id,
      name: `Aluno exemplo ${String(id).padStart(2, '0')}`,
      number: id,
      status: null,
      statusLabel: 'Em curso',
      indicatorEligible: true,
    },
    calculatedAnnual: {
      state: 'in-progress',
      label: 'EM CURSO',
      councilEligibility: 'not-applicable',
    },
    formalCouncilDecision: null,
    cells: values.map((projection) => performanceCellV2(projection, period, 'regular')),
  }));
  const matrix: PerformanceMatrixV2 = {
    transportVersion: 2,
    state: 'ready',
    operation: 'matrix',
    authority: 'calculated-preview',
    context: { year, minimumApprovalMilli: 60000, maxCouncilComponents: 2 },
    classGroup: { id: classId, label: classId === 10 ? '8º A · Exemplo' : '8º B · Exemplo' },
    period,
    mode: 'regular',
    readAt: `2026-09-15T21:00:${String(revision % 60).padStart(2, '0')}Z`,
    offers,
    rows,
    statistics: {
      classRows: rows.length,
      visibleRows: rows.length,
      eligibleRows: rows.length,
      recoveryUnknownRows: 0,
      consideredCells: rows.length * offers.length,
      completeCells: rows.flatMap((row) => row.cells).filter((cell) => cell.state === 'complete')
        .length,
      noShowCells: 0,
      incompleteCells: 0,
      attentionRows: 0,
    },
    comparison: { available: false, reason: 'comparability-not-contracted' },
  };
  const result = performanceAnalyticsResponseSchemaV6.parse(
    buildPerformanceAnalyticsV6(matrix, projections),
  );
  if (result.state !== 'ready') throw new Error('invalid-synthetic-analytics');
  return result;
}
