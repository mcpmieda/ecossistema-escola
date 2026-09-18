// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { learningFixtureV1 } from './learning-fixture-v1';
import {
  performanceCellV2,
  type PerformanceProjectionV2,
} from '../../../server/gradebook/application/results/relational-performance-facts-v2';
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
  PerformanceAnalyticsStatsV6,
  PerformanceAnalyticsSummaryV6,
  PerformanceAnalyticsV6,
} from '../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import type {
  PerformanceMatrixV2,
  PerformancePeriodV2,
} from '../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { isParticipationLabelV1 } from '../../../shared/gradebook-contracts/performance/performance-learning-v1';
import { SIMPLIFIED_TERM_MAXIMUM_MILLI_V1 } from '../../../src/gradebook-domain/calculations/simplified/resolve-simplified-academic-engine-v1';

const TERMS = [1, 2, 3] as const;
const ANNUAL_MAXIMUM = TERMS.reduce(
  (sum, term) => sum + SIMPLIFIED_TERM_MAXIMUM_MILLI_V1[term],
  0,
);
const numeric = (values: readonly (number | null)[]) =>
  values.filter((value): value is number => value !== null);
const mean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value / values.length, 0) : null;
const ratio = (value: number | null, maximum: number | null) =>
  value !== null && maximum !== null && maximum > 0 ? (value / maximum) * 100 : null;

function stats(values: readonly number[]): PerformanceAnalyticsStatsV6 {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length)
    return { n: 0, mean: null, median: null, deviation: null, min: null, max: null };
  const average = mean(sorted)!;
  const mid = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    mean: average,
    median:
      sorted.length % 2
        ? sorted[mid]!
        : (sorted[mid - 1]! + sorted[mid]!) / 2,
    deviation: Math.sqrt(
      sorted.reduce(
        (sum, value) => sum + (value - average) ** 2 / sorted.length,
        0,
      ),
    ),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

function expectMetric(actual: number | null, expected: number | null) {
  if (expected === null) expect(actual).toBeNull();
  else expect(actual).toBeCloseTo(expected, 10);
}
function expectStats(actual: PerformanceAnalyticsStatsV6, expected: PerformanceAnalyticsStatsV6) {
  expect(actual.n).toBe(expected.n);
  for (const key of ['mean', 'median', 'deviation', 'min', 'max'] as const)
    expectMetric(actual[key], expected[key]);
}

type OracleDimension = {
  valueMilli: number | null;
  maximumMilli: number | null;
  percent: number | null;
  complete: boolean;
};

function oracleDimension(
  projection: PerformanceProjectionV2,
  period: PerformancePeriodV2,
  quantitative: boolean,
): OracleDimension {
  const terms = period === 'annual' ? TERMS : [period];
  const outcomes = terms.map((term) => projection.terms[term - 1]);
  if (outcomes.some((outcome) => outcome === null))
    return { valueMilli: null, maximumMilli: null, percent: null, complete: false };
  const factsByTerm = terms.map((term, index) =>
    projection.facts.filter(
      (fact) =>
        fact.term === term &&
        (quantitative
          ? fact.slot <= 3 && outcomes[index]!.coverage.requiredSlots.includes(fact.slot)
          : fact.slot >= 11),
    ),
  );
  if (factsByTerm.some((facts) => facts.length === 0))
    return { valueMilli: null, maximumMilli: null, percent: null, complete: false };
  const resolved = factsByTerm.flatMap((facts, index) =>
    facts.map((fact) => outcomes[index]!.coverage.resolvedSlots.includes(fact.slot)),
  );
  const hasGain =
    quantitative &&
    outcomes.some(
      (outcome) => outcome!.quantitativeConsideredMilli > outcome!.quantitativeOriginalMilli,
    );
  const complete = resolved.every(Boolean);
  const recorded = resolved.some(Boolean) || hasGain;
  const maxima = quantitative
    ? outcomes.map((outcome) => outcome!.quantitativeMaximumMilli)
    : factsByTerm.flat().map((fact) => fact.maximumMilli);
  const maximumMilli = maxima.some((value) => value === null)
    ? null
    : (maxima as number[]).reduce((sum, value) => sum + value, 0) || null;
  const valueMilli = !recorded
    ? null
    : outcomes.reduce(
        (sum, outcome) =>
          sum +
          (quantitative
            ? outcome!.quantitativeConsideredMilli
            : outcome!.qualitativeOperationalMilli),
        0,
      );
  return {
    valueMilli,
    maximumMilli,
    percent: complete ? ratio(valueMilli, maximumMilli) : null,
    complete,
  };
}

type OraclePair = {
  studentId: number;
  projection: PerformanceProjectionV2;
  result: PerformanceMatrixV2['rows'][number]['cells'][number];
  quantitative: OracleDimension;
  qualitative: OracleDimension;
  timeline: readonly (number | null)[];
  direction: -1 | 0 | 1 | null;
  deltaPP: number | null;
};

function oraclePairs(
  matrix: PerformanceMatrixV2,
  projections: ReadonlyMap<number, readonly PerformanceProjectionV2[]>,
): OraclePair[] {
  return matrix.rows.flatMap((row) => {
    const byOffer = new Map(
      (projections.get(row.student.id) ?? []).map((projection) => [
        projection.offerId,
        projection,
      ]),
    );
    return row.cells.map((result) => {
      const projection = byOffer.get(result.offerId);
      if (!projection) throw new Error('proof-missing-projection');
      const reference =
        matrix.period === 2 || matrix.period === 3
          ? performanceCellV2(projection, (matrix.period - 1) as 1 | 2, 'regular')
          : null;
      const comparable = result.state === 'complete' && reference?.state === 'complete';
      const comparison = comparable
        ? BigInt(result.valueMilli!) * BigInt(reference!.maximumMilli) -
          BigInt(reference!.valueMilli!) * BigInt(result.maximumMilli)
        : null;
      return {
        studentId: row.student.id,
        projection,
        result,
        quantitative: oracleDimension(projection, matrix.period, true),
        qualitative: oracleDimension(projection, matrix.period, false),
        timeline: TERMS.map((term) => {
          const cell = performanceCellV2(projection, term, 'regular');
          return cell.state === 'complete' ? ratio(cell.valueMilli, cell.maximumMilli) : null;
        }),
        direction:
          comparison === null ? null : comparison > 0n ? 1 : comparison < 0n ? -1 : 0,
        deltaPP:
          comparison === null
            ? null
            : (Number(comparison) / (result.maximumMilli * reference!.maximumMilli)) * 100,
      };
    });
  });
}

function oracleSummary(
  matrix: PerformanceMatrixV2,
  pairs: readonly OraclePair[],
  studentIds: readonly number[],
): PerformanceAnalyticsSummaryV6 {
  const selectedTerms = matrix.period === 'annual' ? TERMS : [matrix.period];
  const complete = pairs.filter((pair) => pair.result.state === 'complete');
  const below = complete.filter((pair) => pair.result.level === 'below');
  const byStudent = new Map(
    studentIds.map((id) => [id, pairs.filter((pair) => pair.studentId === id)]),
  );
  const studentsBelow = new Set(below.map((pair) => pair.studentId)).size;
  const studentsAtOrAbove = [...byStudent.values()].filter(
    (items) =>
      items.length > 0 &&
      items.every(
        (pair) =>
          pair.result.state === 'complete' && pair.result.level === 'at-or-above',
      ),
  ).length;
  const facts = pairs.flatMap((pair) =>
    pair.projection.facts.filter(
      (fact) =>
        selectedTerms.includes(fact.term) &&
        (fact.slot !== 3 ||
          pair.projection.terms[fact.term - 1]?.coverage.requiredSlots.includes(3)),
    ),
  );
  const paired = pairs.filter(
    (pair) => pair.quantitative.percent !== null && pair.qualitative.percent !== null,
  );
  const quantitativePoints = paired.reduce(
    (sum, pair) => sum + pair.quantitative.valueMilli!,
    0,
  );
  const qualitativePoints = paired.reduce(
    (sum, pair) => sum + pair.qualitative.valueMilli!,
    0,
  );
  const recovery = {
    applicable: 0,
    recorded: 0,
    pending: 0,
    noShow: 0,
    repeatFailure: 0,
    unknown: 0,
    changed: 0,
    meanGainMilli: null as number | null,
  };
  const recoveryGains: number[] = [];
  const parallelGains: number[] = [];
  let parallelApplicable = 0;
  let parallelApplied = 0;
  for (const pair of pairs) {
    for (const term of selectedTerms) {
      const currentRecovery = pair.projection.recovery?.recoveryTerms[term];
      if (currentRecovery?.source === 'RR') recovery.repeatFailure++;
      if (currentRecovery?.applicable == null) recovery.unknown++;
      if (currentRecovery?.applicable === true) {
        recovery.applicable++;
        if (currentRecovery.source === 'NC') recovery.noShow++;
        else if (currentRecovery.source === null) recovery.pending++;
        else if (typeof currentRecovery.source === 'number') {
          recovery.recorded++;
          const original = pair.projection.terms[term - 1];
          if (original?.coverage.complete && currentRecovery.replacementMilli !== null) {
            const gain = currentRecovery.replacementMilli - original.roundedMilli;
            recoveryGains.push(gain);
            if (gain !== 0) recovery.changed++;
          }
        }
      }
      const outcome = pair.projection.terms[term - 1];
      if (outcome?.parallelApplicable === true) parallelApplicable++;
      if (
        outcome &&
        outcome.quantitativeConsideredMilli > outcome.quantitativeOriginalMilli
      ) {
        parallelApplied++;
        parallelGains.push(
          outcome.quantitativeConsideredMilli - outcome.quantitativeOriginalMilli,
        );
      }
    }
  }
  recovery.meanGainMilli = mean(recoveryGains);
  const percentages = complete.map((pair) => ratio(pair.result.valueMilli, pair.result.maximumMilli)!);
  const distribution = ['0–<20%', '20–<40%', '40–<60%', '60–<80%', '80–100%', '>100%'].map(
    (label) => ({ label, count: 0 }),
  );
  for (const percentage of percentages)
    distribution[
      percentage > 100 ? 5 : Math.min(4, Math.floor(percentage / 20))
    ]!.count++;
  const changes = pairs.filter((pair) => pair.direction !== null);
  const comparableSource = pairs.filter(
    (pair) => pair.result.sourceComparison !== 'unavailable',
  );
  return {
    students: studentIds.length,
    readings: pairs.length,
    complete: complete.length,
    partial: pairs.filter((pair) => pair.result.state === 'partial').length,
    missing: pairs.filter((pair) => pair.result.state === 'not-recorded').length,
    unavailable: pairs.filter((pair) => pair.result.state === 'unavailable').length,
    above: complete.length - below.length,
    below: below.length,
    studentsBelow,
    studentsAtOrAbove,
    studentsPending: studentIds.length - studentsBelow - studentsAtOrAbove,
    result: stats(percentages),
    quantitative: stats(numeric(pairs.map((pair) => pair.quantitative.percent))),
    qualitative: stats(numeric(pairs.map((pair) => pair.qualitative.percent))),
    dimensionGap: {
      n: paired.length,
      meanPP: mean(
        paired.map((pair) => pair.qualitative.percent! - pair.quantitative.percent!),
      ),
    },
    composition: {
      n: paired.length,
      quantitativeShare: ratio(
        quantitativePoints,
        quantitativePoints + qualitativePoints,
      ),
      qualitativeShare: ratio(
        qualitativePoints,
        quantitativePoints + qualitativePoints,
      ),
    },
    coverage: {
      expected: facts.length,
      recorded: facts.filter((fact) => fact.valueMilli !== null).length,
      missing: facts.filter((fact) => fact.valueMilli === null).length,
      zeros: facts.filter((fact) => fact.valueMilli === 0).length,
      percent: facts.length
        ? (facts.filter((fact) => fact.valueMilli !== null).length / facts.length) * 100
        : null,
    },
    recovery,
    parallel: {
      applicable: parallelApplicable,
      applied: parallelApplied,
      meanGainMilli: mean(parallelGains),
    },
    movement: {
      reference: matrix.period === 2 ? 1 : matrix.period === 3 ? 2 : null,
      n: changes.length,
      increased: changes.filter((pair) => pair.direction === 1).length,
      decreased: changes.filter((pair) => pair.direction === -1).length,
      unchanged: changes.filter((pair) => pair.direction === 0).length,
      meanDeltaPP: mean(changes.map((pair) => pair.deltaPP!)),
    },
    timeline: TERMS.map((term) => ({
      term,
      ...stats(numeric(pairs.map((pair) => pair.timeline[term - 1]!))),
    })),
    distribution,
    source: {
      recorded: pairs.filter((pair) => pair.result.sourceReferenceMilli !== null).length,
      comparable: comparableSource.length,
      different: comparableSource.filter(
        (pair) => pair.result.sourceComparison === 'mismatch',
      ).length,
    },
  };
}

function expectSummary(
  actual: PerformanceAnalyticsSummaryV6,
  expected: PerformanceAnalyticsSummaryV6,
) {
  for (const key of [
    'students',
    'readings',
    'complete',
    'partial',
    'missing',
    'unavailable',
    'above',
    'below',
    'studentsBelow',
    'studentsAtOrAbove',
    'studentsPending',
  ] as const)
    expect(actual[key]).toBe(expected[key]);
  expectStats(actual.result, expected.result);
  expectStats(actual.quantitative, expected.quantitative);
  expectStats(actual.qualitative, expected.qualitative);
  expect(actual.dimensionGap.n).toBe(expected.dimensionGap.n);
  expectMetric(actual.dimensionGap.meanPP, expected.dimensionGap.meanPP);
  expect(actual.composition.n).toBe(expected.composition.n);
  expectMetric(actual.composition.quantitativeShare, expected.composition.quantitativeShare);
  expectMetric(actual.composition.qualitativeShare, expected.composition.qualitativeShare);
  expect(actual.coverage).toMatchObject({
    expected: expected.coverage.expected,
    recorded: expected.coverage.recorded,
    missing: expected.coverage.missing,
    zeros: expected.coverage.zeros,
  });
  expectMetric(actual.coverage.percent, expected.coverage.percent);
  for (const key of [
    'applicable',
    'recorded',
    'pending',
    'noShow',
    'repeatFailure',
    'unknown',
    'changed',
  ] as const)
    expect(actual.recovery[key]).toBe(expected.recovery[key]);
  expectMetric(actual.recovery.meanGainMilli, expected.recovery.meanGainMilli);
  expect(actual.parallel.applicable).toBe(expected.parallel.applicable);
  expect(actual.parallel.applied).toBe(expected.parallel.applied);
  expectMetric(actual.parallel.meanGainMilli, expected.parallel.meanGainMilli);
  expect(actual.movement).toMatchObject({
    reference: expected.movement.reference,
    n: expected.movement.n,
    increased: expected.movement.increased,
    decreased: expected.movement.decreased,
    unchanged: expected.movement.unchanged,
  });
  expectMetric(actual.movement.meanDeltaPP, expected.movement.meanDeltaPP);
  expect(actual.timeline.map((item) => item.term)).toEqual([1, 2, 3]);
  actual.timeline.forEach((item, index) => expectStats(item, expected.timeline[index]!));
  expect(actual.distribution).toEqual(expected.distribution);
  expect(actual.source).toEqual(expected.source);
}

function proofAllV6Scopes(
  value: PerformanceAnalyticsV6,
  matrix: PerformanceMatrixV2,
  projections: ReadonlyMap<number, readonly PerformanceProjectionV2[]>,
) {
  const pairs = oraclePairs(matrix, projections);
  const studentIds = matrix.rows.map((row) => row.student.id);
  expectSummary(value.summary, oracleSummary(matrix, pairs, studentIds));

  for (const student of value.students) {
    const own = pairs.filter((pair) => pair.studentId === student.student.id);
    expectSummary(student.summary, oracleSummary(matrix, own, [student.student.id]));
  }
  for (const component of value.components) {
    const own = pairs.filter(
      (pair) => pair.projection.offerId === component.offer.id,
    );
    expectSummary(component.summary, oracleSummary(matrix, own, studentIds));
  }
  for (const teacher of value.teachers) {
    const own = pairs.filter((pair) => teacher.offerIds.includes(pair.projection.offerId));
    expectSummary(teacher.summary, oracleSummary(matrix, own, studentIds));
    for (const student of teacher.students) {
      const expected = oracleSummary(
        matrix,
        own.filter((pair) => pair.studentId === student.studentId),
        [student.studentId],
      );
      expect(student.complete).toBe(expected.complete);
      expect(student.partial).toBe(expected.partial);
      expect(student.below).toBe(expected.below);
      expectMetric(student.meanPercent, expected.result.mean);
      expectMetric(student.deltaPP, expected.movement.meanDeltaPP);
    }
  }

  const learning = value.learning!;
  expect(learning.students.map((item) => item.studentId)).toEqual(studentIds);
  expect(learning.participation.students).toBe(
    learning.students.filter((item) => item.participation.percent !== null).length,
  );
  expect(learning.participation.comparedStudents).toBe(
    learning.students.filter((item) => item.participation.deltaPP !== null).length,
  );
  expect(learning.participation.recorded).toBe(
    learning.students.reduce((sum, item) => sum + item.participation.recorded, 0),
  );
  expect(learning.participation.expected).toBe(
    learning.students.reduce((sum, item) => sum + item.participation.expected, 0),
  );
  expect(learning.participation.unscaled).toBe(
    learning.students.reduce((sum, item) => sum + item.participation.unscaled, 0),
  );
  expect(learning.parallel.students).toBe(
    learning.students.filter((item) => item.parallelImprovements > 0).length,
  );
  expect(learning.parallel.improvements).toBe(
    learning.students.reduce((sum, item) => sum + item.parallelImprovements, 0),
  );
  expect(learning.dimensions.students).toBe(
    learning.students.filter((item) => (item.dimensions?.components ?? 0) > 0).length,
  );
  expect(learning.dimensions.components).toBe(
    learning.students.reduce(
      (sum, item) => sum + (item.dimensions?.components ?? 0),
      0,
    ),
  );
  const expectedActivities = value.components
    .flatMap((component) => component.instruments)
    .filter(
      (instrument) =>
        instrument.slot >= 11 &&
        !isParticipationLabelV1(instrument.label) &&
        instrument.stats.n >= 3 &&
        instrument.maximumMilli !== null &&
        instrument.maximumMilli > 0 &&
        instrument.below > 0,
    )
    .sort(
      (left, right) =>
        right.below / right.stats.n - left.below / left.stats.n ||
        (left.stats.mean ?? Infinity) - (right.stats.mean ?? Infinity) ||
        left.key.localeCompare(right.key),
    )
    .map((instrument) => instrument.key);
  expect(learning.activitiesToReview).toEqual(expectedActivities);

  expect(value.summary.complete + value.summary.partial + value.summary.missing + value.summary.unavailable)
    .toBe(value.summary.readings);
  expect(value.summary.above + value.summary.below).toBe(value.summary.complete);
  expect(value.summary.studentsAtOrAbove + value.summary.studentsBelow + value.summary.studentsPending)
    .toBe(value.summary.students);
  expect(value.summary.distribution.reduce((sum, bin) => sum + bin.count, 0))
    .toBe(value.summary.complete);
}

function analysisRequest(
  matrix: PerformanceMatrixV2,
  lens: 'result' | 'quantitative' | 'qualitative' | 'assessments',
  offerId: number | null,
) {
  return performanceAnalysisRequestSchemaV3.parse({
    transportVersion: 3,
    operation: 'analysis',
    year: matrix.context.year,
    classId: matrix.classGroup.id,
    period: matrix.period,
    mode: matrix.mode,
    statuses: [null, 7],
    lens,
    offerId,
  });
}

function proveAnalysisAndDashboard(
  matrix: PerformanceMatrixV2,
  projections: ReadonlyMap<number, readonly PerformanceProjectionV2[]>,
  lens: 'result' | 'quantitative' | 'qualitative' | 'assessments',
) {
  const offerId = lens === 'assessments' ? matrix.offers[0]!.id : null;
  const analysis = buildPerformanceAnalysisV3(
    matrix,
    projections,
    analysisRequest(matrix, lens, offerId),
  );
  for (const [columnIndex, column] of analysis.columns.entries()) {
    const values = analysis.rows.map((row) => row.values[columnIndex]!);
    const considered = values.filter((value) => value.bucket !== 'excluded');
    expect(column.summary.considered).toBe(considered.length);
    expect(column.summary.scaled).toBe(considered.filter((value) => value.percent !== null).length);
    for (const bucket of ['above', 'below', 'incomplete', 'no-show', 'unscaled'] as const)
      expect(column.summary.groups[bucket]).toEqual(
        analysis.rows
          .filter((row) => row.values[columnIndex]!.bucket === bucket)
          .map((row) => row.studentId),
      );
  }

  const overview = buildPerformanceDashboardOverviewV5(analysis);
  const eligibleIds = matrix.rows
    .filter((row) => row.student.indicatorEligible)
    .map((row) => row.student.id);
  const rows = new Map(analysis.rows.map((row) => [row.studentId, row]));
  const expected = {
    allAtOrAbove: [] as number[],
    withBelow: [] as number[],
    pending: [] as number[],
  };
  for (const studentId of eligibleIds) {
    const buckets = rows.get(studentId)?.values.map((value) => value.bucket) ?? [];
    if (buckets.some((bucket) => bucket === 'below')) expected.withBelow.push(studentId);
    else if (buckets.length > 0 && buckets.every((bucket) => bucket === 'above'))
      expected.allAtOrAbove.push(studentId);
    else expected.pending.push(studentId);
  }
  expect(overview.groups).toEqual(expected);
  expect(overview.students).toEqual({
    eligible: eligibleIds.length,
    classified: expected.allAtOrAbove.length + expected.withBelow.length,
    allAtOrAbove: expected.allAtOrAbove.length,
    withBelow: expected.withBelow.length,
    pending: expected.pending.length,
  });
  expect(overview.students.eligible).toBe(
    overview.students.classified + overview.students.pending,
  );

  for (const [index, column] of overview.columns.entries()) {
    const source = analysis.columns[index]!;
    expect(column).toMatchObject({
      considered: source.summary.considered,
      atOrAbove: source.summary.groups.above.length,
      below: source.summary.groups.below.length,
      incomplete: source.summary.groups.incomplete.length,
      noShow: source.summary.groups['no-show'].length,
      unscaled: source.summary.groups.unscaled.length,
    });
    expect(
      column.atOrAbove +
        column.below +
        column.incomplete +
        column.noShow +
        column.unscaled,
    ).toBe(column.considered);
  }

  const ranking = matrix.rows
    .filter(
      (row) =>
        row.student.indicatorEligible &&
        row.cells.length > 0 &&
        row.cells.every((cell) => cell.valueMilli !== null),
    )
    .map((row) => ({
      studentId: row.student.id,
      totalMilli: Number(
        row.cells.reduce((sum, cell) => sum + BigInt(cell.valueMilli!), 0n),
      ),
      partial: row.cells.some((cell) => cell.state === 'partial'),
      number: row.student.number,
    }))
    .sort(
      (left, right) =>
        right.totalMilli - left.totalMilli ||
        left.number - right.number ||
        left.studentId - right.studentId,
    )
    .slice(0, 10)
    .map(({ number: _number, ...entry }) => entry);
  expect(overview.ranking).toEqual(ranking);

  return { analysis, overview };
}

describe('performance count proof #852', () => {
  it.each([
    { period: 1 as const, label: 'T1' },
    { period: 2 as const, label: 'T2' },
    { period: 3 as const, label: 'T3 empty' },
    { period: 'annual' as const, label: 'annual' },
  ])('recounts every V6 denominator from raw matrix/projection facts: $label', ({ period }) => {
    const { value, matrix, projections } = learningFixtureV1({ period });
    proofAllV6Scopes(value, matrix, projections);
  });

  it('keeps zero, missing eligible PARA, superior PARA, >100% and unknown maximum separated', () => {
    const { value, matrix, projections } = learningFixtureV1({
      period: 2,
      override: (fact, student, component) => {
        if (student === 0 && component === 0 && fact.term === 2 && fact.slot === 3)
          return { valueMilli: null };
        if (student === 1 && component === 0 && fact.term === 2 && fact.slot === 3)
          return { valueMilli: 13_000 };
        if (student === 2 && component === 1 && fact.term === 2 && fact.slot === 13)
          return { valueMilli: (fact.maximumMilli ?? 1) * 2 };
        if (student === 2 && component === 2 && fact.term === 2 && fact.slot === 13)
          return { maximumMilli: null };
        return {};
      },
    });
    proofAllV6Scopes(value, matrix, projections);
    expect(value.summary.partial).toBeGreaterThan(0);
    expect(value.summary.parallel.applied).toBeGreaterThan(0);
    expect(value.summary.coverage.zeros).toBeGreaterThan(0);
    expect(value.components.some((component) =>
      component.instruments.some((instrument) => instrument.stats.max !== null && instrument.stats.max > 100),
    )).toBe(true);
    expect(value.components.some((component) =>
      component.instruments.some((instrument) => instrument.maximumMilli === null),
    )).toBe(true);
  });

  it.each(['result', 'quantitative', 'qualitative', 'assessments'] as const)(
    'recounts every V3/V5 bar, panorama bucket and ranking for lens %s',
    (lens) => {
      const { matrix, projections } = learningFixtureV1({ period: 2 });
      proveAnalysisAndDashboard(matrix, projections, lens);
    },
  );

  it('recounts the four trimester-comparison totals directly from every compared cell', () => {
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
        (result, value) => {
          result[value.state === 'unavailable' ? 'unavailable' : value.relation]++;
          return result;
        },
        { higher: 0, equal: 0, lower: 0, unavailable: 0 },
      );
    expect(
      totals.higher + totals.equal + totals.lower + totals.unavailable,
    ).toBe(comparison.rows.length * comparison.columns.length);
    for (const [columnIndex, column] of comparison.columns.entries()) {
      expect(column.summary.groups.higher).toEqual(
        comparison.rows
          .filter((row) => row.values[columnIndex]!.relation === 'higher')
          .map((row) => row.studentId),
      );
      expect(column.summary.groups.equal).toEqual(
        comparison.rows
          .filter((row) => row.values[columnIndex]!.relation === 'equal')
          .map((row) => row.studentId),
      );
      expect(column.summary.groups.lower).toEqual(
        comparison.rows
          .filter((row) => row.values[columnIndex]!.relation === 'lower')
          .map((row) => row.studentId),
      );
      expect(column.summary.groups.unavailable).toEqual(
        comparison.rows
          .filter((row) => row.values[columnIndex]!.state === 'unavailable')
          .map((row) => row.studentId),
      );
      expect(column.summary.comparable + column.summary.unavailable).toBe(
        comparison.rows.length,
      );
    }
  });
});
