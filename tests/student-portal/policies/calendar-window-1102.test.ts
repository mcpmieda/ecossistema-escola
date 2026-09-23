import { describe, expect, it } from 'vitest';
import { initialPolicyDefaultsV1 } from '../../../server/student-portal/policies/defaults-v1';
import { publicationWindowV1 } from '../../../server/student-portal/policies/calendar-v1';

const at = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`;
function policy() {
  const value = initialPolicyDefaultsV1();
  value.accessEnabled = true;
  value.allowedPeriods = ['T1', 'T2'];
  Object.assign(value.calendar, {
    yearStartsAt: at(1),
    t1EndsAt: at(5),
    t2StartsAt: at(6),
    yearEndsAt: at(30),
    disclosure: { mode: 'single', at: null, periods: ['T1', 'T2'] },
  });
  return value;
}

describe('publication calendar #1102', () => {
  it('preserves legacy bounds and manual disclosure while intersecting period starts', () => {
    expect(publicationWindowV1(policy(), ['T1', 'T2'])).toEqual({
      start: new Date(at(6)),
      end: new Date(at(30)),
    });
  });

  it('uses explicit access bounds independently from the academic year end', () => {
    const value = policy();
    value.calendar.accessStartsAt = at(20);
    value.calendar.accessEndsAt = '2026-02-10T00:00:00Z';
    expect(publicationWindowV1(value, ['T1'])).toEqual({
      start: new Date(at(20)),
      end: new Date('2026-02-10T00:00:00Z'),
    });
    value.calendar.yearEndsAt = null;
    expect(publicationWindowV1(value, ['T1'])?.end).toEqual(new Date('2026-02-10T00:00:00Z'));
  });

  it('intersects independent disclosure ends and rejects an empty joint window', () => {
    const value = policy();
    value.calendar.disclosure = {
      mode: 'per-period',
      at: { T1: at(2), T2: at(8), T3: null, REC1: null, REC2: null, REC3: null },
      endsAt: { T1: at(10), T2: at(15), T3: null, REC1: null, REC2: null, REC3: null },
    };
    expect(publicationWindowV1(value, ['T1', 'T2'])).toEqual({
      start: new Date(at(8)),
      end: new Date(at(10)),
    });
    value.calendar.accessStartsAt = at(10);
    expect(publicationWindowV1(value, ['T1', 'T2'])).toBeNull();
  });

  it('respects school closure, disabled periods, selected single periods and missing starts', () => {
    const value = policy();
    expect(publicationWindowV1(value, [])).toBeNull();
    expect(publicationWindowV1(value, ['T3'])).toBeNull();
    value.calendar.disclosure = { mode: 'single', at: null, periods: ['T1'], endsAt: at(9) };
    expect(publicationWindowV1(value, ['T2'])).toBeNull();
    expect(publicationWindowV1(value, ['T1'])?.end).toEqual(new Date(at(9)));
    value.accessEnabled = false;
    expect(publicationWindowV1(value, ['T1'])).toBeNull();
    value.accessEnabled = true;
    value.calendar.yearStartsAt = null;
    value.calendar.accessStartsAt = at(1);
    expect(publicationWindowV1(value, ['T1'])).toBeNull();
  });
});
