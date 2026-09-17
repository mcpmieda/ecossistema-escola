// @vitest-environment jsdom
import { gzipSync } from 'node:zlib';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { learningFixtureV1 } from './learning-fixture-v1';
import { buildPerformanceAnalyticsV6 } from '../../../server/gradebook/application/read-models/performance/performance-analytics-v6';
import {
  performanceAnalyticsMatchesV6,
  performanceAnalyticsRequestSchemaV6,
  performanceAnalyticsResponseSchemaV6,
  type PerformanceAnalyticsV6,
} from '../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import { PerformanceAnalyticsWorkspaceV6 } from '../../../src/features/gradebook/performance/performance-analytics-workspace-v6';
import { analyticsDeltaV6 as delta, analyticsPercentV6 as percent } from '../../../src/features/gradebook/performance/analytics-format-v6';
import { setupOperationsDomV1 } from '../../student-portal/ui/overview/dom-v1';

beforeEach(setupOperationsDomV1);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function comparisonFixture(noCommon = false, qualitativeRate = 0.8) {
  return learningFixtureV1({ studentCount: 1, componentCount: 3, override(fact, _student, component) {
    if (fact.term !== 2) return {};
    if (fact.slot === 3) return { valueMilli: component === 0 ? 10800 : null };
    if ((component === 1 && fact.slot === 13) || (component === 2 && fact.slot === 2) ||
      (noCommon && component === 0 && fact.slot === 13)) return { valueMilli: null };
    const rate = fact.slot <= 2 ? [0.4, 0.2, 0.3][component]! : component === 0 ? qualitativeRate : 1;
    return { valueMilli: Math.round(fact.maximumMilli! * rate) };
  } });
}
function panel(value: PerformanceAnalyticsV6, studentId = 1) {
  render(<PerformanceAnalyticsWorkspaceV6 value={value} tab="students"
    selection={{ studentId, offerId: null, teacherId: null }}
    onSelection={vi.fn()} onNavigate={vi.fn()} onPeriod={vi.fn()} onCell={vi.fn()} onNotes={vi.fn()} />);
  const element = screen.getByRole('heading', { name: 'Quantitativo × qualitativo' }).closest('[data-slot="card"]');
  expect(element).toBeTruthy();
  return within(element as HTMLElement);
}
it('uses original assessments and identical complete components for both bars and the gap', () => {
  const { value, matrix, projections } = comparisonFixture();
  const dimensions = value.learning!.students[0]!.dimensions!;
  expect(dimensions.components).toBe(1);
  expect(dimensions.quantitativePercent).toBeCloseTo(40);
  expect(dimensions.qualitativePercent).toBeCloseTo(80);
  expect(dimensions.gapPP).toBeCloseTo(40);
  expect(dimensions.gapPP).toBe(dimensions.qualitativePercent! - dimensions.quantitativePercent!);
  expect(value.learning!.dimensions.quantitativePercent).toBe(dimensions.quantitativePercent);
  expect(value.learning!.dimensions.qualitativePercent).toBe(dimensions.qualitativePercent);
  // BN-DEC-033: 5400 + 13200 already exceeds 18000 before the recorded PARA.
  expect(value.learning!.students[0]!.parallelImprovements).toBe(0);
  expect(projections.get(matrix.rows[0]!.student.id)![0]!.terms[1]).toMatchObject({
    parallelApplicable: false, parallelMilli: 10800, quantitativeConsideredMilli: 5400, rawMilli: 18600,
  });
  // The old summary still has independent groups and the considered quantitative result.
  expect(value.students[0]!.summary.quantitative.n).toBe(2);
  expect(value.students[0]!.summary.qualitative.n).toBe(2);
  expect(value.students[0]!.summary.quantitative.mean).not.toBeCloseTo(dimensions.quantitativePercent!);
  const oldClient = buildPerformanceAnalyticsV6(matrix, projections, true, false);
  expect(value.students).toEqual(oldClient.students);
  expect(value.summary).toEqual(oldClient.summary);
  expect(value.components).toEqual(oldClient.components);
  expect(value.teachers).toEqual(oldClient.teachers);
  expect(value.learning!.dimensions).toEqual(oldClient.learning!.dimensions);
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(true);
});
it('keeps dimensional comparison on original marks when an eligible PARA improves the result', () => {
  const { value, matrix, projections } = comparisonFixture(false, 0.7);
  const dimensions = value.learning!.students[0]!.dimensions!;
  expect(dimensions.components).toBe(1);
  expect(dimensions.quantitativePercent).toBeCloseTo(40);
  expect(dimensions.qualitativePercent).toBeCloseTo(70);
  expect(dimensions.gapPP).toBeCloseTo(30);
  expect(value.learning!.students[0]!.parallelImprovements).toBe(1);
  // 5400 + 11550 is below 18000; the superior PARA contributes once to the result only.
  expect(projections.get(matrix.rows[0]!.student.id)![0]!.terms[1]).toMatchObject({
    parallelApplicable: true, quantitativeOriginalMilli: 5400,
    quantitativeConsideredMilli: 16200, rawMilli: 27750, roundedMilli: 28000,
  });
  expect(value.students[0]!.summary.quantitative.mean).toBeCloseTo(70);
  expect(value.students[0]!.summary.quantitative.mean).not.toBeCloseTo(dimensions.quantitativePercent!);
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(true);
});
it('renders the canonical numbers instead of the adjusted summary without requesting more data', () => {
  const { value } = comparisonFixture();
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const block = panel(value);
  expect(Number(block.getByRole('meter', { name: 'Quantitativo' }).getAttribute('aria-valuenow'))).toBeCloseTo(40);
  expect(Number(block.getByRole('meter', { name: 'Qualitativo' }).getAttribute('aria-valuenow'))).toBeCloseTo(80);
  expect(block.getByText(delta(40))).toBeTruthy();
  expect(block.getByText('Duas avaliações · antes da paralela')).toBeTruthy();
  expect(block.getByText('Componentes comparados: 1.')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it('does not compare disjoint complete groups or manufacture a zero when there is no common component', () => {
  const { value } = comparisonFixture(true);
  expect(value.students[0]!.summary.quantitative.n).toBeGreaterThan(0);
  expect(value.students[0]!.summary.qualitative.n).toBeGreaterThan(0);
  expect(value.learning!.students[0]!.dimensions).toEqual({
    quantitativePercent: null, qualitativePercent: null, gapPP: null, components: 0,
  });
  const block = panel(value);
  expect(block.queryAllByRole('meter')).toHaveLength(0);
  expect(block.getAllByText('—')).toHaveLength(2);
  expect(block.getByText('Ainda sem base comum suficiente para comparar.')).toBeTruthy();
});
it('never falls back to incompatible legacy summaries when the extension is absent', () => {
  const { matrix, projections } = comparisonFixture();
  const value = buildPerformanceAnalyticsV6(matrix, projections, true, false);
  expect(value.students[0]!.summary.quantitative.mean).not.toBeNull();
  const block = panel(value);
  expect(block.queryAllByRole('meter')).toHaveLength(0);
  expect(block.getByText('Ainda sem base comum suficiente para comparar.')).toBeTruthy();
});
it.each([0, 1.2])('preserves real zero and results above 100 percent (rate %s)', (rate) => {
  const { value } = learningFixtureV1({ studentCount: 1, componentCount: 1, override(fact) {
    return fact.slot === 3 ? { valueMilli: null } : { valueMilli: Math.round(fact.maximumMilli! * rate) };
  } });
  const dimensions = value.learning!.students[0]!.dimensions!;
  expect(dimensions.components).toBe(1);
  expect(dimensions.quantitativePercent).toBeCloseTo(rate * 100);
  expect(dimensions.qualitativePercent).toBeCloseTo(rate * 100);
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(true);
  const block = panel(value);
  expect(block.getByRole('meter', { name: 'Quantitativo' }).getAttribute('aria-valuenow')).toBe(String(rate * 100));
  expect(block.getAllByText(percent(rate * 100))).toHaveLength(2);
});
it('normalizes the annual comparison by 30/30/40 maxima rather than averaging trimester percentages', () => {
  const { value } = learningFixtureV1({ period: 'annual', studentCount: 1, componentCount: 1, override(fact) {
    if (fact.slot === 3) return { valueMilli: null };
    const rates = fact.slot <= 2 ? [0.2, 0.4, 0.8] : [0.9, 0.7, 0.6];
    return { valueMilli: Math.round(fact.maximumMilli! * rates[fact.term - 1]!) };
  } });
  const dimensions = value.learning!.students[0]!.dimensions!;
  expect(dimensions.components).toBe(1);
  expect(dimensions.quantitativePercent).toBeCloseTo(50);
  expect(dimensions.qualitativePercent).toBeCloseTo(72);
  expect(dimensions.gapPP).toBeCloseTo(22);
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(true);
});
it('keeps the overview equal to the mean of comparable student evidence without changing their weights', () => {
  const { value } = learningFixtureV1();
  const comparable = value.learning!.students.map((student) => student.dimensions!).filter((item) => item.components > 0);
  const mean = (values: number[]) => values.reduce((sum, item) => sum + item / values.length, 0);
  expect(value.learning!.dimensions.quantitativePercent).toBe(mean(comparable.map((item) => item.quantitativePercent!)));
  expect(value.learning!.dimensions.qualitativePercent).toBe(mean(comparable.map((item) => item.qualitativePercent!)));
  expect(value.learning!.dimensions.components).toBe(comparable.reduce((sum, item) => sum + item.components, 0));
});
it('requires a separate opt-in so clients already using strict learning v1 keep their previous fields', () => {
  const { value, matrix, projections } = comparisonFixture();
  const oldClient = buildPerformanceAnalyticsV6(matrix, projections, true, false);
  const request = { transportVersion: 6, operation: 'analytics', year: value.context.year,
    classId: value.classGroup.id, period: value.period, includeLearning: true } as const;
  expect(oldClient.learning!.students.every((student) => !Object.hasOwn(student, 'dimensions'))).toBe(true);
  expect(performanceAnalyticsRequestSchemaV6.safeParse({ ...request, includeStudentDimensions: true }).success).toBe(true);
  expect(performanceAnalyticsRequestSchemaV6.safeParse({ ...request, includeLearning: undefined, includeStudentDimensions: true }).success).toBe(false);
  expect(performanceAnalyticsRequestSchemaV6.safeParse({ ...request, includeStudentDimensions: 'true' }).success).toBe(false);
  expect(performanceAnalyticsResponseSchemaV6.safeParse(oldClient).success).toBe(true);
  expect(performanceAnalyticsMatchesV6(request, oldClient)).toBe(true);
  expect(performanceAnalyticsMatchesV6({ ...request, includeStudentDimensions: true }, oldClient)).toBe(false);
  expect(performanceAnalyticsMatchesV6({ ...request, includeStudentDimensions: true }, value)).toBe(true);
});
it.each(['gap', 'count', 'missing-value', 'identity', 'mixed-extension'] as const)('rejects inconsistent student comparison: %s', (kind) => {
  const value = structuredClone(learningFixtureV1().value);
  const student = value.learning!.students[0]!;
  if (kind === 'gap') student.dimensions!.gapPP = 999;
  else if (kind === 'count') student.dimensions!.components = 0;
  else if (kind === 'missing-value') student.dimensions!.quantitativePercent = null;
  else if (kind === 'identity') student.studentId = 999;
  else delete student.dimensions;
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(false);
});
it('keeps all student comparisons within the existing 1000-pair and 2 MB snapshot budget', () => {
  const { value } = learningFixtureV1({ studentCount: 100, componentCount: 10 });
  expect(value.summary.readings).toBe(1000);
  expect(value.learning!.students.every((student) => student.dimensions !== undefined)).toBe(true);
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(true);
  const json = JSON.stringify(value);
  expect(Buffer.byteLength(json)).toBeLessThan(2_000_000);
  expect(gzipSync(json).length).toBeLessThan(500_000);
});
