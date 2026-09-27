import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';

type SubjectV1 = SelfResponseV1['subjects'][number];
type MarkV1 = SubjectV1['periods'][number]['final'];

/*
 * Selos brilhantes (owner idea 27/09/2026): a trimester mark of 95% or more, reached the minimum,
 * earns the student a seal in that subject — something to collect across the year. The same rule
 * as the Brilhante band of the trimester header; recoveries never earn seals themselves.
 *
 * A red trimester mark in ANY subject means no seal in that trimester (owner decision 27/09/2026).
 * Only earned seals are ever shown: nothing locked, nothing "almost" — a missing seal is simply
 * not there. A closed trimester cannot be recovered: the year-end recovery (REC1–REC3) does not
 * count. Only a teacher correcting the mark changes it, and the rule always reads current marks.
 */
const SEAL_PERIODS_V1 = ['T1', 'T2', 'T3'] as const;
type SealPeriodV1 = (typeof SEAL_PERIODS_V1)[number];

const isSealPeriodV1 = (period: string): period is SealPeriodV1 =>
  (SEAL_PERIODS_V1 as readonly string[]).includes(period);
const markOf = (subject: SubjectV1, period: string) => subject.periods.find((item) => item.period === period)?.final;

export function isBrilliantMarkV1(mark: MarkV1 | undefined): boolean {
  if (mark?.kind !== 'score' || mark.meetsMinimum !== true || !mark.maximum) return false;
  // ≥ 95% ⇔ 20·value ≥ 19·maximum, in milli units to stay exact.
  return Math.round(mark.value * 1000) * 20 >= Math.round(mark.maximum * 1000) * 19;
}

/** Some subject is red (below the minimum) in the trimester. */
function hasRedMarkV1(subjects: readonly SubjectV1[], period: SealPeriodV1): boolean {
  return subjects.some((subject) => {
    const mark = markOf(subject, period);
    return mark?.kind === 'score' && mark.meetsMinimum === false;
  });
}

/** Whether the subject holds a seal in the trimester. */
export function earnsSealV1(subjects: readonly SubjectV1[], subject: SubjectV1, period: string): boolean {
  return isSealPeriodV1(period) && isBrilliantMarkV1(markOf(subject, period)) && !hasRedMarkV1(subjects, period);
}

/** Seals the student holds this year: one per subject and trimester. */
export function brilliantSealCountV1(subjects: readonly SubjectV1[]): number {
  return SEAL_PERIODS_V1.reduce(
    (total, period) => total + subjects.filter((subject) => earnsSealV1(subjects, subject, period)).length,
    0,
  );
}
