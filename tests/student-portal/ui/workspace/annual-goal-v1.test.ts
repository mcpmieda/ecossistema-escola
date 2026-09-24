import { describe, expect, it } from 'vitest';
import { annualGoalV1 } from '../../../../src/features/student-portal/workspace/annual-goal-v1';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';

type SubjectV1 = SelfResponseV1['subjects'][number];
const scoreOf = (value: number, maximum: number | null) =>
  ({ kind: 'score', value, maximum, meetsMinimum: null }) as const;
function subjectOf(periods: SubjectV1['periods'], extra: Partial<SubjectV1> = {}): SubjectV1 {
  return { subjectId: 1, label: 'MATEMÁTICA', order: 1, periods, ...extra };
}

describe('Meta do ano (2º trimestre)', () => {
  it('asks the 3º tri for what is left of 60, in exact milli points', () => {
    const goal = annualGoalV1(
      subjectOf([
        { period: 'T1', final: scoreOf(16.5, 30) },
        { period: 'T2', final: scoreOf(19.8, 30) },
        { period: 'T3', final: { kind: 'absent' } },
      ]),
      'regular',
    );
    expect(goal).toEqual({ state: 'reachable', soFarMilli: 36_300, t1Milli: 16_500, t2Milli: 19_800, neededMilli: 23_700 });
  });

  it('says the goal is reached at exactly 60 and beyond when more than 40 is missing', () => {
    const at = (t1: number, t2: number) =>
      annualGoalV1(subjectOf([{ period: 'T1', final: scoreOf(t1, 30) }, { period: 'T2', final: scoreOf(t2, 30) }]), 'regular');
    expect(at(30, 30)?.state).toBe('reached');
    expect(at(10, 10)?.state).toBe('reachable'); // exactly 40 needed
    expect(at(10, 9.9)?.state).toBe('beyond');
  });

  it('stays silent when the reading would not be exact or does not apply', () => {
    const base = [
      { period: 'T1' as const, final: scoreOf(15, 30) },
      { period: 'T2' as const, final: scoreOf(15, 30) },
    ];
    expect(annualGoalV1(subjectOf([...base, { period: 'T3', final: scoreOf(20, 40) }]), 'regular')).toBeNull();
    expect(annualGoalV1(subjectOf([base[0]!]), 'regular')).toBeNull();
    expect(annualGoalV1(subjectOf([base[0]!, { period: 'T2', final: scoreOf(15, 25) }]), 'regular')).toBeNull();
    expect(annualGoalV1(subjectOf([base[0]!, { period: 'T2', final: scoreOf(15, null) }]), 'regular')).toBeNull();
    expect(annualGoalV1(subjectOf([base[0]!, { period: 'T2', final: { kind: 'nc' } }]), 'regular')).toBeNull();
    expect(annualGoalV1(subjectOf(base), 'assisted')).toBeNull();
    expect(annualGoalV1(subjectOf(base), 'special')).toBeNull();
    expect(annualGoalV1(subjectOf(base, { officialOutcome: 'approved' }), 'regular')).toBeNull();
  });
});
