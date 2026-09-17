// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isParticipationLabelV1 } from '../../../shared/gradebook-contracts/performance/performance-learning-v1';
import { performanceAnalyticsResponseSchemaV6 } from '../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import { learningFixtureV1 } from './learning-fixture-v1';
import { performanceAnalyticsFixtureV6 } from './performance-analytics-fixture-v6';

describe('participation recognition is a controlled category, not an identity', () => {
  it.each(['PARTICIPAÇÃO', 'participacao', '  Participação  ', 'PART', 'PART.', 'PARTC.', 'PARTIC.', 'PARTICIP.', '1ª PARTICIPAÇÃO', '2ª Participação', 'Participação 1', 'Participação 2', 'part 1', 'part 2', 'part I', 'PART II', 'III PARTICIPAÇÃO', 'participação IV', 'PART-01', 'PART. 02', 'PARTICIPAÇÕES', 'participação 1ª'])('recognizes %s', (label) => expect(isParticipationLabelV1(label)).toBe(true));
  it.each(['', 'PARTE', 'PARTIDO', 'TRABALHO EM PARTES', 'PARTICIPAÇÃO + TRABALHO', 'NÃO PARTICIPAÇÃO', 'participação e prova', 'CAED', 'PESQUISA', 'part 2026', 'compartilhamento', 'participação / atividade'])('does not guess %s', (label) => expect(isParticipationLabelV1(label)).toBe(false));
});
it('combines divided participation by points, keeping both instrument identities and student weights', () => {
  const { value } = learningFixtureV1({ studentCount: 2, componentCount: 1, override: (fact, student) => {
    if (fact.slot === 11) return { valueMilli: 0 };
    if (fact.slot === 12) return { valueMilli: student === 0 ? fact.maximumMilli : 0 };
    return {};
  } });
  expect(value.learning!.students[0]!.participation.percent).toBeCloseTo(200 / 3);
  expect(value.learning!.students[0]!.participation.recorded).toBe(2);
  expect(value.learning!.students[1]!.participation.percent).toBe(0);
  expect(value.learning!.participation.percent).toBeCloseTo(100 / 3);
  expect(value.components[0]!.instruments.filter((item) => item.slot === 11 || item.slot === 12)).toHaveLength(2);
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(true);
});
it('does not turn missing participation into zero or compare partial participation periods', () => {
  const { value } = learningFixtureV1({ studentCount: 1, componentCount: 1, override: (fact) => fact.slot === 11 ? { valueMilli: null } : {} });
  const participation = value.learning!.students[0]!.participation;
  expect(participation.percent).toBe(80);
  expect(participation.recorded).toBe(1);
  expect(participation.expected).toBe(2);
  expect(participation.deltaPP).toBeNull();
  expect(value.learning!.participation.comparedStudents).toBe(0);
});
it('excludes an unknown maximum and reports that limitation without inventing a denominator', () => {
  const { value } = learningFixtureV1({ studentCount: 1, componentCount: 1, override: (fact) => fact.slot === 11 ? { maximumMilli: null } : {} });
  expect(value.learning!.participation.unscaled).toBe(1);
  expect(value.learning!.participation.percent).toBe(80);
  expect(value.learning!.participation.deltaPP).toBeNull();
});
it('compares participation only on the same complete components of consecutive terms', () => {
  const { value } = learningFixtureV1({ studentCount: 1, componentCount: 2, override: (fact, _student, component) => component === 1 && fact.term === 1 && fact.slot >= 11 ? { valueMilli: null } : {} });
  expect(value.learning!.students[0]!.participation.components).toBe(2);
  expect(value.learning!.students[0]!.participation.comparedComponents).toBe(1);
  expect(value.learning!.participation.deltaPP).toBeCloseTo(20);
  expect(learningFixtureV1({ period: 1 }).value.learning!.participation.deltaPP).toBeNull();
  expect(learningFixtureV1({ period: 'annual' }).value.learning!.participation.deltaPP).toBeNull();
});
it('does not use low participation alone as recurrent instrument difficulty', () => {
  const { value } = learningFixtureV1({ studentCount: 1, componentCount: 1, override: (fact) => ({ valueMilli: fact.maximumMilli === null ? null : fact.slot === 11 || fact.slot === 12 ? 0 : Math.round(fact.maximumMilli * .95) }) });
  expect(value.learning!.students[0]!.recurrenceAssessed).toBe(true);
  expect(value.learning!.students[0]!.recurring).toEqual([]);
});
it('requires at least three numeric instruments and two low scores in the same component', () => {
  const { value } = learningFixtureV1({ studentCount: 1, componentCount: 1 });
  expect(value.learning!.students[0]!.recurring[0]!.instrumentTerms).toEqual([2]);
  const insufficient = learningFixtureV1({ studentCount: 1, componentCount: 1, override: (fact) => fact.term === 1 || fact.slot === 13 ? { valueMilli: null } : {} }).value;
  expect(insufficient.learning!.students[0]!.recurrenceAssessed).toBe(false);
  expect(insufficient.learning!.students[0]!.recurring).toEqual([]);
});
it('detects repeated low complete term results and keeps no-evidence students unclassified', () => {
  const { value } = learningFixtureV1();
  expect(value.learning!.students[0]!.recurring[0]!.consecutiveTerms).toEqual([2]);
  expect(value.learning!.students[3]!.recurrenceAssessed).toBe(false);
  expect(value.learning!.students[3]!.participation.percent).toBeNull();
  expect(value.learning!.students[3]!.recurring).toEqual([]);
});
it('keeps recovery gain separate from the original quantitative comparison and the official result', () => {
  const before = learningFixtureV1({ studentCount: 1, componentCount: 1 }).value;
  const after = learningFixtureV1({ studentCount: 1, componentCount: 1, override: (fact) => fact.term === 2 && fact.slot === 3 ? { valueMilli: 13000 } : {} }).value;
  expect(after.learning!.parallel.students).toBe(1);
  expect(after.learning!.parallel.improvements).toBe(1);
  expect(after.learning!.parallel.meanGainPP).toBeGreaterThan(0);
  expect(after.learning!.dimensions.quantitativePercent).toBe(before.learning!.dimensions.quantitativePercent);
  expect(after.summary.result.mean!).toBeGreaterThan(before.summary.result.mean!);
});
it('keeps free activity labels, excludes participation from activity highlights and validates identities', () => {
  const { value } = learningFixtureV1();
  expect(value.learning!.activitiesToReview.length).toBeGreaterThan(0);
  expect(value.learning!.activitiesToReview.every((key) => key.endsWith(':13'))).toBe(true);
  const modified = structuredClone(value);
  modified.learning!.students[0]!.studentId = 999999;
  expect(performanceAnalyticsResponseSchemaV6.safeParse(modified).success).toBe(false);
  const legacy = structuredClone(value);
  delete legacy.learning;
  expect(performanceAnalyticsResponseSchemaV6.safeParse(legacy).success).toBe(true);
});
it('remains inside the existing transport budget with 1,000 student-component pairs', () => {
  const value = performanceAnalyticsFixtureV6({ studentCount: 100, componentCount: 10, period: 2 });
  expect(performanceAnalyticsResponseSchemaV6.safeParse(value).success).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(2_000_000);
});
