import { describe, expect, it } from 'vitest';
import { initialPolicyDefaultsV1 } from '../../../server/student-portal/policies/defaults-v1';
import { portalNoticesForPolicyV1 } from '../../../server/student-portal/policies/calendar-v1';
import { portalStatusResponseV1 } from '../../../shared/student-portal-contracts/notices-v1';

function policy(
  overrides: Record<string, unknown> = {},
  calendar: Record<string, unknown> = {},
): Parameters<typeof portalNoticesForPolicyV1>[0] {
  const defaults = initialPolicyDefaultsV1();
  return {
    ...defaults,
    accessEnabled: true,
    allowedPeriods: ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'],
    ...overrides,
    calendar: {
      ...defaults.calendar,
      yearStartsAt: '2026-01-01T00:00:00-03:00',
      t1EndsAt: '2026-05-16T00:00:00-03:00',
      t2StartsAt: '2026-05-18T00:00:00-03:00',
      t2EndsAt: '2026-09-01T00:00:00-03:00',
      t3StartsAt: '2026-09-01T00:00:00-03:00',
      t3EndsAt: '2026-12-01T00:00:00-03:00',
      recoveriesStartAt: '2026-12-01T00:00:00-03:00',
      yearEndsAt: '2027-01-01T00:00:00-03:00',
      finalDisclosureAt: null,
      disclosure: {
        mode: 'per-period' as const,
        at: { T1: null, T2: null, T3: null, REC1: null, REC2: null, REC3: null },
      },
      ...calendar,
    },
  } as Parameters<typeof portalNoticesForPolicyV1>[0];
}
const at = (iso: string) => new Date(iso);

describe('Portal notices from the effective policy', () => {
  it('reports a closed Portal and its configured opening', () => {
    const notices = portalNoticesForPolicyV1(
      policy({}, { accessStartsAt: '2026-10-01T08:00:00-03:00' }),
      at('2026-09-26T12:00:00-03:00'),
    );
    expect(notices).toMatchObject({ access: 'closed', accessOpensAt: '2026-10-01T11:00:00.000Z' });
  });

  it('does not announce an opening when access is switched off', () => {
    const notices = portalNoticesForPolicyV1(
      policy({ accessEnabled: false }, { accessStartsAt: '2026-10-01T08:00:00-03:00' }),
      at('2026-09-26T12:00:00-03:00'),
    );
    expect(notices).toMatchObject({ access: 'closed', accessOpensAt: null, gradesReleaseAt: null });
  });

  it('counts down only to an explicit "Liberar notas em" date still in the future', () => {
    const later = policy(
      {},
      {
        disclosure: {
          mode: 'per-period',
          at: {
            T1: '2026-05-20T00:00:00-03:00',
            T2: '2026-09-30T18:00:00-03:00',
            T3: null,
            REC1: null,
            REC2: null,
            REC3: null,
          },
        },
      },
    );
    const notices = portalNoticesForPolicyV1(later, at('2026-09-26T12:00:00-03:00'));
    expect(notices).toMatchObject({ access: 'open', gradesReleaseAt: '2026-09-30T21:00:00.000Z' });
    // T3 starts later but has no configured date: no countdown for it once T2 is released.
    expect(
      portalNoticesForPolicyV1(later, at('2026-10-01T00:00:00-03:00')).gradesReleaseAt,
    ).toBeNull();
  });

  it('names the period whose disclosure already ended ("Ocultar notas em")', () => {
    const ending = policy(
      {},
      {
        disclosure: {
          mode: 'per-period',
          at: {
            T1: '2026-05-20T00:00:00-03:00',
            T2: '2026-09-02T00:00:00-03:00',
            T3: null,
            REC1: null,
            REC2: null,
            REC3: null,
          },
          endsAt: {
            T1: '2026-06-20T00:00:00-03:00',
            T2: '2026-09-25T00:00:00-03:00',
            T3: null,
            REC1: null,
            REC2: null,
            REC3: null,
          },
        },
      },
    );
    expect(
      portalNoticesForPolicyV1(ending, at('2026-09-26T12:00:00-03:00')).disclosureEnded,
    ).toEqual({ period: 'T2', at: '2026-09-25T03:00:00.000Z' });
    expect(
      portalNoticesForPolicyV1(ending, at('2026-06-01T12:00:00-03:00')).disclosureEnded,
    ).toBeNull();
  });

  it('wraps notices in the public status response without any grade', () => {
    const response = portalStatusResponseV1.parse({
      contractVersion: 1,
      requestId: crypto.randomUUID(),
      state: 'status',
      scope: 'school',
      serverNow: '2026-09-26T15:00:00.000Z',
      notices: portalNoticesForPolicyV1(policy(), at('2026-09-26T12:00:00-03:00')),
    });
    expect(Object.keys(response.notices).sort()).toEqual(
      ['access', 'accessOpensAt', 'disclosureEnded', 'gradesReleaseAt'].sort(),
    );
  });
});
