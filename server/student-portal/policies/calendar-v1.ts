import type { z } from 'zod';
import { calendarV1, settingsValueV1 } from '../../../shared/student-portal-contracts/policy-v1';
import { periodV1 } from '../../../shared/student-portal-contracts/core-v1';
import { selfResponseV1, type SelfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';

export type CalendarV1 = z.infer<typeof calendarV1>;
export type PolicyValueV1 = z.infer<typeof settingsValueV1>;
type PeriodV1 = z.infer<typeof periodV1>;

function timestamp(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

/** UTC persistence with second precision; dates are never filled from the current year. */
export function normalizeCalendarV1(input: unknown): CalendarV1 {
  const parsed = calendarV1.parse(input);
  const instant = (value: string | null): string | null => {
    if (value === null) return null;
    const date = new Date(value);
    if (/\.\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || date.getUTCMilliseconds() !== 0) throw new Error('student-portal-calendar-second-precision');
    return date.toISOString().replace('.000Z', 'Z');
  };
  return calendarV1.parse({
    ...parsed,
    enrollmentStartsAt: instant(parsed.enrollmentStartsAt), yearStartsAt: instant(parsed.yearStartsAt),
    t1EndsAt: instant(parsed.t1EndsAt), t2EndsAt: instant(parsed.t2EndsAt), t3EndsAt: instant(parsed.t3EndsAt),
    recoveriesStartAt: instant(parsed.recoveriesStartAt), yearEndsAt: instant(parsed.yearEndsAt),
    finalDisclosureAt: instant(parsed.finalDisclosureAt),
    disclosure: parsed.disclosure.mode === 'single'
      ? { ...parsed.disclosure, at: instant(parsed.disclosure.at) }
      : { mode: 'per-period', at: Object.fromEntries(Object.entries(parsed.disclosure.at).map(([key, value]) => [key, instant(value)])) },
  });
}

export function sessionExpiryV1(input: PolicyValueV1, now: Date, persistent: boolean): string | null {
  const value = settingsValueV1.parse(input);
  const current = now.getTime();
  const start = timestamp(value.calendar.yearStartsAt);
  const end = timestamp(value.calendar.yearEndsAt);
  if (!Number.isFinite(current) || !value.accessEnabled || start === null || end === null || current < start || current >= end) return null;
  const seconds = persistent ? value.risk.persistentSeconds : value.risk.shortSeconds;
  return new Date(Math.min(current + seconds * 1000, end)).toISOString();
}

export function periodDisclosureV1(input: PolicyValueV1, period: PeriodV1, now: Date): 'allowed' | 'disabled' | 'unavailable' | 'not-yet' {
  const value = settingsValueV1.parse(input);
  periodV1.parse(period);
  if (!Number.isFinite(now.getTime())) throw new Error('student-portal-clock-invalid');
  if (!value.allowedPeriods.includes(period)) return 'disabled';
  const calendar = value.calendar;
  const start = timestamp(period === 'T1' ? calendar.yearStartsAt : period === 'T2' ? calendar.t1EndsAt
    : period === 'T3' ? calendar.t2EndsAt : calendar.recoveriesStartAt);
  const disclosure = calendar.disclosure;
  if (disclosure.mode === 'single' && !disclosure.periods.includes(period)) return 'disabled';
  const at = timestamp(disclosure.mode === 'single' ? disclosure.at : disclosure.at[period]);
  if (start === null || at === null) return 'unavailable';
  return now.getTime() >= Math.max(start, at) ? 'allowed' : 'not-yet';
}

export function mayDiscloseFinalV1(input: PolicyValueV1, now: Date, officialSourceAuthorized: boolean): boolean {
  const value = settingsValueV1.parse(input);
  const at = timestamp(value.calendar.finalDisclosureAt);
  return officialSourceAuthorized && value.showFinalResult && at !== null && Number.isFinite(now.getTime()) && now.getTime() >= at;
}

/** Filters an already published projection; it never promotes an unpublished academic fact. */
export function applyPublishedVisibilityV1(
  input: SelfResponseV1,
  policy: PolicyValueV1,
  now: Date,
  officialSourceAuthorized: boolean,
): SelfResponseV1 {
  const projection = selfResponseV1.parse(input);
  const value = settingsValueV1.parse(policy);
  const final = mayDiscloseFinalV1(value, now, officialSourceAuthorized);
  const subjects = value.accessEnabled ? projection.subjects.map((subject) => {
    const { officialOutcome, ...base } = subject;
    return {
      ...base,
      ...(final && officialOutcome !== undefined ? { officialOutcome } : {}),
      periods: subject.periods.filter((period) => periodDisclosureV1(value, period.period, now) === 'allowed').map((period) => {
        const { partials, ...basePeriod } = period;
        return { ...basePeriod, ...(value.showPartials && partials !== undefined ? { partials } : {}) };
      }),
    };
  }).filter((subject) => subject.periods.length > 0) : [];
  return selfResponseV1.parse({
    ...projection,
    state: subjects.length > 0 ? 'ready' : 'no-publication',
    profile: { ...projection.profile, result: projection.profile.academicState === 'assisted' ? 'not-applicable'
      : final && value.accessEnabled ? projection.profile.result : 'in-progress' },
    subjects,
  });
}
