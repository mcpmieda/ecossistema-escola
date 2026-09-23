import { compareSourceSubjectPresentationV1 } from '../../../shared/gradebook-contracts/source/subject-abbreviations-v1';
import { settingsValueV1 } from '../../../shared/student-portal-contracts/policy-v1';
import { selfResponseV1, type SelfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';
import {
  TERM_CLOSING_PERIODS_V1,
  type TermClosingPeriodV1,
} from '../../../shared/student-portal-contracts/term-closing-v1';
import {
  assignTermClosingVariantsV1,
  termClosingSummaryV1,
  type TermClosingEvaluationV1,
} from '../academic/term-closing-v1';

type PolicyValueV1 = Parameters<typeof settingsValueV1.parse>[0];
const END_FIELD_V1 = { T1: 't1EndsAt', T2: 't2EndsAt', T3: 't3EndsAt' } as const;

/**
 * Trimesters whose official end date has passed (D2, R3). Empty when the feature is off, access is
 * closed, or the student is assisted/special (D9). Retroactive by construction (D15).
 */
export function closedTermClosingPeriodsV1(
  policy: PolicyValueV1,
  academicState: SelfResponseV1['profile']['academicState'],
  now: Date,
): TermClosingPeriodV1[] {
  const value = settingsValueV1.parse(policy);
  if (!value.showTermClosing || !value.accessEnabled || academicState !== 'regular') return [];
  return TERM_CLOSING_PERIODS_V1.filter((period) => {
    const end = value.calendar[END_FIELD_V1[period]];
    return end !== null && Number.isFinite(Date.parse(end)) && now.getTime() >= Date.parse(end);
  });
}

/** Shared by the student page and the admin preview so both show the same codes and variants. */
export function buildTermClosingsV1(input: {
  closedPeriods: readonly TermClosingPeriodV1[];
  evaluations: ReadonlyMap<number, readonly TermClosingEvaluationV1[]>;
  studentKey: string;
}) {
  const inScope = new Map<number, TermClosingEvaluationV1[]>();
  for (const [subjectId, list] of input.evaluations) {
    const kept = list.filter((evaluation) => input.closedPeriods.includes(evaluation.period));
    if (kept.length) inScope.set(subjectId, kept);
  }
  const closings = assignTermClosingVariantsV1(input.studentKey, inScope);
  const latest = [...input.closedPeriods].reverse().find((period) =>
    [...closings.values()].some((list) => list.some((closing) => closing.period === period)),
  );
  return { closings, summary: latest ? termClosingSummaryV1(input.studentKey, latest, closings) : undefined };
}

/**
 * Adds closings after the published-visibility filter. A closed trimester that is not released
 * yet still gets its closing, shown without marks (R2): its subject is added with no periods.
 */
export function attachTermClosingsV1(input: {
  projection: SelfResponseV1;
  closedPeriods: readonly TermClosingPeriodV1[];
  evaluations: ReadonlyMap<number, readonly TermClosingEvaluationV1[]>;
  sourceSubjects: readonly { subjectId: number; label: string }[];
  studentKey: string;
}): SelfResponseV1 {
  const { projection, closedPeriods } = input;
  if (closedPeriods.length === 0) return projection;
  const { closings, summary } = buildTermClosingsV1(input);
  if (closings.size === 0) return projection;

  const bySubject = new Map(projection.subjects.map((subject) => [subject.subjectId, subject]));
  for (const source of input.sourceSubjects)
    if (!bySubject.has(source.subjectId) && closings.has(source.subjectId))
      bySubject.set(source.subjectId, { subjectId: source.subjectId, label: source.label, order: 0, periods: [] });
  const subjects = [...bySubject.values()]
    .sort((a, b) => compareSourceSubjectPresentationV1(a.label, b.label) || a.subjectId - b.subjectId)
    .map((subject, order) => {
      const list = closings.get(subject.subjectId);
      return { ...subject, order, ...(list ? { closings: list } : {}) };
    });
  return selfResponseV1.parse({
    ...projection,
    state: subjects.length ? 'ready' : 'no-publication',
    subjects,
    ...(summary ? { closingSummary: summary } : {}),
  });
}
