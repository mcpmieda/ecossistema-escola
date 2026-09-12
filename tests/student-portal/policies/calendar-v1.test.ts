import { describe, expect, it } from 'vitest';
import { initialPolicyDefaultsV1 } from '../../../server/student-portal/policies/defaults-v1';
import { applyPublishedVisibilityV1, mayDiscloseFinalV1, normalizeCalendarV1, periodDisclosureV1, sessionExpiryV1 } from '../../../server/student-portal/policies/calendar-v1';
import { SYNTHETIC_SELF_V1 } from '../../../shared/student-portal-contracts/fixtures-v1';
import type { SelfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';

function policy(): ReturnType<typeof initialPolicyDefaultsV1> {
  const defaults = initialPolicyDefaultsV1();
  return { ...defaults, accessEnabled: true, allowedPeriods: ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'],
    calendar: { ...defaults.calendar, yearStartsAt: '2026-01-01T00:00:00-03:00',
      t1EndsAt: '2026-05-01T00:00:00-03:00', t2EndsAt: '2026-08-01T00:00:00-03:00',
      t3EndsAt: '2026-12-01T00:00:00-03:00', recoveriesStartAt: '2026-12-01T00:00:00-03:00',
      yearEndsAt: '2027-01-01T00:00:00-03:00', finalDisclosureAt: '2026-12-20T00:00:00-03:00',
      disclosure: { mode: 'single' as const, at: '2026-05-01T00:00:00-03:00', periods: ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'] } },
  };
}

const value = policy;

describe('calendar and session policy', () => {
  it('normalizes São Paulo midnight to the same UTC instant and rejects sub-second dates', () => {
    expect(normalizeCalendarV1(value().calendar).yearStartsAt).toBe('2026-01-01T03:00:00Z');
    expect(() => normalizeCalendarV1({ ...value().calendar, yearStartsAt: '2026-01-01T03:00:00.0001Z' })).toThrow();
    expect(() => normalizeCalendarV1({ ...value().calendar, t2EndsAt: '2026-02-01T00:00:00Z' })).toThrow();
  });

  it('uses inclusive session start, exclusive year end, and the approved 30d/12h durations', () => {
    const current = value();
    expect(sessionExpiryV1(current, new Date('2026-01-01T02:59:59Z'), true)).toBeNull();
    expect(sessionExpiryV1(current, new Date('2026-01-01T03:00:00Z'), true)).toBe('2026-01-31T03:00:00.000Z');
    expect(sessionExpiryV1(current, new Date('2026-01-01T03:00:00Z'), false)).toBe('2026-01-01T15:00:00.000Z');
    expect(sessionExpiryV1(current, new Date('2026-12-31T20:00:00Z'), true)).toBe('2027-01-01T03:00:00.000Z');
    expect(sessionExpiryV1(current, new Date('2027-01-01T03:00:00Z'), true)).toBeNull();
  });

  it('does not invent an end date or make enrollment dates a prerequisite for an otherwise valid session', () => {
    const current = value();
    expect(current.calendar.enrollmentStartsAt).toBeNull();
    expect(sessionExpiryV1(current, new Date('2026-06-01T00:00:00Z'), true)).not.toBeNull();
    expect(sessionExpiryV1({ ...current, calendar: { ...current.calendar, yearEndsAt: null } }, new Date('2026-06-01T00:00:00Z'), true)).toBeNull();
    expect(sessionExpiryV1({ ...current, accessEnabled: false }, new Date('2026-06-01T00:00:00Z'), true)).toBeNull();
  });

  it('resolves disclosure per period without publishing periods that have not started', () => {
    const current = value();
    expect(periodDisclosureV1(current, 'T1', new Date('2026-05-01T02:59:59Z'))).toBe('not-yet');
    expect(periodDisclosureV1(current, 'T1', new Date('2026-05-01T03:00:00Z'))).toBe('allowed');
    expect(periodDisclosureV1(current, 'T2', new Date('2026-05-01T03:00:00Z'))).toBe('allowed');
    expect(periodDisclosureV1(current, 'T3', new Date('2026-05-01T03:00:00Z'))).toBe('not-yet');
    expect(periodDisclosureV1(current, 'REC1', new Date('2026-05-01T03:00:00Z'))).toBe('not-yet');
    expect(periodDisclosureV1({ ...current, allowedPeriods: [] }, 'T1', new Date('2026-06-01T00:00:00Z'))).toBe('disabled');
  });

  it('keeps a null date local to its dependent period and replaces the inactive disclosure mode', () => {
    const current = value();
    current.calendar.disclosure = { mode: 'per-period', at: { T1: '2026-05-01T03:00:00Z', T2: null, T3: null, REC1: null, REC2: null, REC3: null } };
    expect(periodDisclosureV1(current, 'T1', new Date('2026-09-01T00:00:00Z'))).toBe('allowed');
    expect(periodDisclosureV1(current, 'T2', new Date('2026-09-01T00:00:00Z'))).toBe('unavailable');
    expect(() => normalizeCalendarV1({ ...current.calendar, disclosure: { ...current.calendar.disclosure, periods: ['T1'] } })).toThrow();
  });

  it('requires final ON, an effective date and separately authorized official authority', () => {
    const current = value();
    const after = new Date('2026-12-20T03:00:00Z');
    expect(mayDiscloseFinalV1(current, after, true)).toBe(false);
    current.showFinalResult = true;
    expect(mayDiscloseFinalV1(current, after, false)).toBe(false);
    expect(mayDiscloseFinalV1(current, new Date('2026-12-20T02:59:59Z'), true)).toBe(false);
    expect(mayDiscloseFinalV1(current, after, true)).toBe(true);
    expect(mayDiscloseFinalV1({ ...current, calendar: { ...current.calendar, finalDisclosureAt: null } }, after, true)).toBe(false);
  });

  it('removes hidden partials and future periods from the payload while preserving an actual zero', () => {
    const projection: SelfResponseV1 = { ...SYNTHETIC_SELF_V1, profile: { ...SYNTHETIC_SELF_V1.profile, result: 'approved' }, subjects: [{
      ...SYNTHETIC_SELF_V1.subjects[0]!, officialOutcome: 'approved', periods: [
        { ...SYNTHETIC_SELF_V1.subjects[0]!.periods[0]!, partials: [{ assessmentId: 900099, label: 'HIDDEN SYNTHETIC PARTIAL', mark: { kind: 'nc' } }] },
        { period: 'T3', final: { kind: 'rr' } },
      ],
    }] };
    const visible = applyPublishedVisibilityV1(projection, value(), new Date('2026-06-01T00:00:00Z'), true);
    expect(visible.profile.result).toBe('in-progress');
    expect(visible.subjects[0]!.periods).toEqual([{ period: 'T1', final: { kind: 'score', value: 0, maximum: 10, meetsMinimum: false } }]);
    expect(visible.subjects[0]).not.toHaveProperty('officialOutcome');
    expect(JSON.stringify(visible)).not.toContain('HIDDEN SYNTHETIC PARTIAL');
    expect(projection.subjects[0]!.periods[0]).toHaveProperty('partials');
    const noAccess = applyPublishedVisibilityV1(projection, { ...value(), accessEnabled: false }, new Date('2026-06-01T00:00:00Z'), true);
    expect(noAccess).toMatchObject({ state: 'no-publication', subjects: [] });
  });

  it('keeps ASSISTIDO without an invented global outcome', () => {
    const projection = { ...SYNTHETIC_SELF_V1, profile: { ...SYNTHETIC_SELF_V1.profile, academicState: 'assisted' as const, result: 'not-applicable' as const } };
    expect(applyPublishedVisibilityV1(projection, { ...value(), showFinalResult: true }, new Date('2026-12-21T00:00:00Z'), true).profile.result).toBe('not-applicable');
  });
});
