// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { learningFixtureV1 } from './learning-fixture-v1';
import { setupOperationsDomV1 } from '../../student-portal/ui/overview/dom-v1';
import {
  PerformanceAnalyticsWorkspaceV6,
} from '../../../src/features/gradebook/performance/performance-analytics-workspace-v6';
import {
  AnalyticsCompositionV6,
  AnalyticsCoverageV6,
  AnalyticsDistributionV6,
  AnalyticsRecoveryV6,
  AnalyticsTimelineV6,
} from '../../../src/features/gradebook/performance/performance-analytics-charts-v6';
import {
  analyticsPercentV6 as percent,
} from '../../../src/features/gradebook/performance/analytics-format-v6';
import {
  PerformanceDashboardWidgetsV5,
} from '../../../src/features/gradebook/performance/performance-dashboard-widgets-v5';
import {
  PerformanceTermComparisonPanelV4,
} from '../../../src/features/gradebook/performance/performance-term-comparison-panel-v4';
import {
  buildPerformanceAnalysisV3,
} from '../../../server/gradebook/application/read-models/performance/performance-analysis-v3';
import {
  buildPerformanceDashboardOverviewV5,
} from '../../../server/gradebook/application/read-models/performance/performance-dashboard-v5';
import {
  buildPerformanceTermComparisonV4,
} from '../../../server/gradebook/application/read-models/performance/performance-term-comparison-v4';
import {
  performanceAnalysisRequestSchemaV3,
} from '../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import {
  performanceTermComparisonRequestSchemaV4,
} from '../../../shared/gradebook-contracts/performance/performance-term-comparison-v4';
import type {
  PerformanceDashboardV5,
} from '../../../shared/gradebook-contracts/performance/performance-dashboard-v5';

beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function valueAfter(label: string): string | null {
  const term = screen.getByText(label);
  return term.parentElement?.querySelector('dd')?.textContent ?? null;
}

it('renders the overview KPI counts and the three exclusive situation groups from the proven payload', () => {
  const { value } = learningFixtureV1({ period: 2 });
  render(
    <PerformanceAnalyticsWorkspaceV6
      value={value}
      tab="overview"
      selection={{ studentId: null, offerId: null, teacherId: null }}
      onSelection={vi.fn()}
      onNavigate={vi.fn()}
      onPeriod={vi.fn()}
      onCell={vi.fn()}
      onNotes={vi.fn()}
    />,
  );
  const evidence = new Map(
    value.learning!.students.map((item) => [item.studentId, item]),
  );
  const rising = value.students.filter(
    (student) => student.summary.movement.meanDeltaPP !== null &&
      student.summary.movement.meanDeltaPP > 0,
  ).length;
  const compared = value.students.filter(
    (student) => student.summary.movement.meanDeltaPP !== null,
  ).length;
  const attention = value.students.filter(
    (student) => (evidence.get(student.student.id)?.recurring.length ?? 0) > 0,
  ).length;
  const assessed = value.learning!.students.filter(
    (student) => student.recurrenceAssessed,
  ).length;
  expect(screen.getByRole('button', { name: 'Ver alunos: Alunos em evolução' }).textContent)
    .toContain(String(rising));
  expect(screen.getByText('de ' + compared + ' alunos com comparação')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ver alunos: Atenção recorrente' }).textContent)
    .toContain(assessed ? String(attention) : '—');
  expect(screen.getByText(assessed + ' alunos com base para analisar')).toBeTruthy();

  const groups = [
    ['Na referência em todos', value.summary.studentsAtOrAbove],
    ['Abaixo em algum componente', value.summary.studentsBelow],
    ['Ainda sem conclusão', value.summary.studentsPending],
  ] as const;
  for (const [label, count] of groups) {
    const button = screen.getByText(label).closest('button');
    expect(button?.textContent).toContain(String(count));
  }
  expect(groups.reduce((sum, item) => sum + item[1], 0)).toBe(value.summary.students);
  expect(
    screen.getByText(
      value.learning!.participation.students + ' alunos · ' +
      value.learning!.participation.recorded + ' notas consideradas',
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      value.learning!.parallel.students + ' alunos melhoraram com a recuperação paralela',
    ),
  ).toBeTruthy();

  for (const component of value.components)
    expect(
      screen.getByText(
        component.summary.below + ' abaixo da referência · ' +
        component.summary.complete + ' com resultado',
        { exact: false },
      ),
    ).toBeTruthy();
});

it('renders timeline, histogram, composition, recovery and coverage with the exact payload denominators', () => {
  const { value } = learningFixtureV1({ period: 2 });
  const { container } = render(
    <div>
      <AnalyticsTimelineV6 summary={value.summary} onPeriod={vi.fn()} schoolLanguage />
      <AnalyticsDistributionV6 summary={value.summary} />
      <AnalyticsCompositionV6 summary={value.summary} />
      <AnalyticsRecoveryV6 summary={value.summary} />
      <AnalyticsCoverageV6 summary={value.summary} />
    </div>,
  );

  for (const item of value.summary.timeline)
    expect(
      screen.getByRole('button', {
        name:
          'Consultar ' + item.term + 'º trimestre: ' +
          percent(item.mean) + ', ' + item.n + ' resultados',
      }),
    ).toBeTruthy();

  const distribution = container.querySelector('figcaption');
  expect(distribution?.textContent).toBe(
    value.summary.distribution
      .map((bin) => bin.label + ': ' + bin.count)
      .join('; '),
  );
  expect(value.summary.distribution.reduce((sum, bin) => sum + bin.count, 0))
    .toBe(value.summary.result.n);

  const composition = screen.getByRole('img', { name: /Participação nos pontos/ });
  expect(composition.getAttribute('aria-label')).toBe(
    'Participação nos pontos: quantitativo ' +
      percent(value.summary.composition.quantitativeShare) +
      ', qualitativo ' +
      percent(value.summary.composition.qualitativeShare),
  );
  expect(screen.getByText(value.summary.composition.n + ' pares completos')).toBeTruthy();

  expect(valueAfter('REC aplicável')).toBe(String(value.summary.recovery.applicable));
  expect(valueAfter('REC lançada')).toBe(String(value.summary.recovery.recorded));
  expect(valueAfter('REC pendente')).toBe(String(value.summary.recovery.pending));
  expect(valueAfter('N/C')).toBe(String(value.summary.recovery.noShow));
  expect(valueAfter('R/R')).toBe(String(value.summary.recovery.repeatFailure));
  expect(
    screen.getByText(
      'Paralela aplicada: ' +
      value.summary.parallel.applied +
      '/' +
      value.summary.parallel.applicable,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      'Aplicabilidade indefinida: ' + value.summary.recovery.unknown,
    ),
  ).toBeTruthy();

  expect(valueAfter('Completos')).toBe(String(value.summary.complete));
  expect(valueAfter('Parciais')).toBe(String(value.summary.partial));
  expect(valueAfter('Sem nota')).toBe(String(value.summary.missing));
  expect(valueAfter('Indisponíveis')).toBe(String(value.summary.unavailable));
  expect(valueAfter('Zeros registrados')).toBe(String(value.summary.coverage.zeros));
  expect(valueAfter('Lançamentos ausentes')).toBe(String(value.summary.coverage.missing));
});

it('renders every Notas V5 component bar, class panorama and completeness KPI from server aggregates', () => {
  const { matrix, projections } = learningFixtureV1({ period: 2 });
  const request = performanceAnalysisRequestSchemaV3.parse({
    transportVersion: 3,
    operation: 'analysis',
    year: matrix.context.year,
    classId: matrix.classGroup.id,
    period: matrix.period,
    mode: 'regular',
    statuses: [null, 7],
    lens: 'result',
    offerId: null,
  });
  const analysis = buildPerformanceAnalysisV3(matrix, projections, request);
  const dashboard: PerformanceDashboardV5 = {
    transportVersion: 5,
    operation: 'dashboard',
    state: 'ready',
    view: analysis,
    overview: buildPerformanceDashboardOverviewV5(analysis),
  };
  const { container } = render(
    <PerformanceDashboardWidgetsV5
      value={dashboard}
      selection={null}
      onSelectionChange={vi.fn()}
      open={vi.fn()}
    />,
  );
  const kpis = screen.getByLabelText('Resumo da turma').querySelectorAll('.performance-kpi');
  expect(kpis[0]?.textContent).toContain(
    analysis.matrix.statistics.visibleRows + 'estudantes',
  );
  expect(kpis[1]?.textContent).toContain(
    dashboard.overview.students.withBelow + 'abaixo do mínimo',
  );
  const completePercent =
    analysis.matrix.statistics.consideredCells === 0
      ? 0
      : (analysis.matrix.statistics.completeCells /
          analysis.matrix.statistics.consideredCells) *
        100;
  expect(kpis[2]?.textContent).toContain(
    number.format(completePercent) + '%completos',
  );
  expect(kpis[3]?.textContent).toContain(
    dashboard.overview.students.pending + 'com pendências',
  );

  const offers = new Map(analysis.matrix.offers.map((offer) => [offer.id, offer]));
  for (const column of dashboard.overview.columns) {
    const title = offers.get(column.offerId)!.subject.label;
    expect(
      screen.getByRole('button', {
        name:
          title +
          ': ' +
          column.atOrAbove +
          ' estudante(s) no mínimo ou acima',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name:
          title +
          ': ' +
          column.below +
          ' estudante(s) abaixo do mínimo',
      }),
    ).toBeTruthy();
  }

  expect(
    screen.getByRole('img', {
      name:
        dashboard.overview.students.allAtOrAbove +
        ' estudantes com todos os componentes no mínimo ou acima, ' +
        dashboard.overview.students.withBelow +
        ' com pelo menos um abaixo e ' +
        dashboard.overview.students.pending +
        ' sem leitura classificada',
    }),
  ).toBeTruthy();
  expect(container.querySelectorAll('.performance-ranking li')).toHaveLength(
    dashboard.overview.ranking.length,
  );
});

it('renders the four V4 comparison totals as the exact partition of compared cells', () => {
  const { matrix, projections } = learningFixtureV1({ period: 2 });
  const request = performanceTermComparisonRequestSchemaV4.parse({
    transportVersion: 4,
    operation: 'term-comparison',
    year: matrix.context.year,
    classId: matrix.classGroup.id,
    period: 2,
    referencePeriod: 1,
    mode: 'regular',
    statuses: [null, 7],
    lens: 'result',
    offerId: null,
  });
  const comparison = buildPerformanceTermComparisonV4(matrix, projections, request);
  const totals = comparison.rows
    .flatMap((row) => row.values)
    .reduce(
      (result, item) => {
        result[item.state === 'unavailable' ? 'unavailable' : item.relation]++;
        return result;
      },
      { higher: 0, equal: 0, lower: 0, unavailable: 0 },
    );
  render(<PerformanceTermComparisonPanelV4 value={comparison} open={vi.fn()} />);
  const summary = screen.getByLabelText('Resumo comparativo');
  const cells = within(summary).getAllByText(/\d+/u, { selector: 'strong' });
  expect(cells.map((cell) => Number(cell.textContent))).toEqual([
    totals.higher,
    totals.equal,
    totals.lower,
    totals.unavailable,
  ]);
  expect(
    totals.higher + totals.equal + totals.lower + totals.unavailable,
  ).toBe(comparison.rows.length * comparison.columns.length);
});
