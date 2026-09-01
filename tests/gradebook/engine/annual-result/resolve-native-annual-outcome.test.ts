import { describe, expect, it } from 'vitest';

import type {
  AcademicGradeValueV1,
  AnnualFinalDecisionV1,
  ResultCoverageV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1,
  resolveNativeAnnualOutcome,
  type NativeAnnualComponentInputV1,
  type NativeAnnualOutcomeProfileV1,
} from '../../../../src/gradebook-domain/calculations/annual-result/resolve-native-annual-outcome';
import {
  NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
  resolveNativeFinalRecovery,
  type AcademicTermGradeMapV1,
} from '../../../../src/gradebook-domain/calculations/final-recovery/resolve-native-final-recovery';

const profile = NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1;
const pendingDecision: AnnualFinalDecisionV1 = { status: 'pending' };

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function coverage(
  state: ResultCoverageV1['state'] = 'complete',
  reasons: readonly string[] = [],
): ResultCoverageV1 {
  if (state === 'partial') {
    return {
      state,
      expectedItemCount: 2,
      resolvedItemCount: 1,
      missingItemCount: 1,
      reasons,
    };
  }

  const resolvedItemCount = state === 'insufficient-data' ? 0 : 1;
  return {
    state,
    expectedItemCount: 1,
    resolvedItemCount,
    missingItemCount: 1 - resolvedItemCount,
    reasons,
  };
}

function component(
  componentKey: string,
  originalTotal: AcademicGradeValueV1,
  postRecoveryTotal: AcademicGradeValueV1 = originalTotal,
  sourceCoverage: ResultCoverageV1 = coverage(),
): NativeAnnualComponentInputV1 {
  return { componentKey, originalTotal, postRecoveryTotal, coverage: sourceCoverage };
}

function approvedDirect(componentKey: string): NativeAnnualComponentInputV1 {
  return component(componentKey, numeric(60));
}

function approvedAfterRecovery(componentKey: string): NativeAnnualComponentInputV1 {
  return component(componentKey, numeric(59.9), numeric(60));
}

function notApproved(componentKey: string): NativeAnnualComponentInputV1 {
  return component(componentKey, numeric(59.9), numeric(59.9));
}

function resolve(
  components: readonly NativeAnnualComponentInputV1[],
  finalDecision: AnnualFinalDecisionV1 = pendingDecision,
) {
  return resolveNativeAnnualOutcome({ components, finalDecision }, profile);
}

function termGrades(term1: number, term2: number, term3: number): AcademicTermGradeMapV1 {
  return { 1: numeric(term1), 2: numeric(term2), 3: numeric(term3) };
}

function absentTermGrades(): AcademicTermGradeMapV1 {
  return { 1: { state: 'absent' }, 2: { state: 'absent' }, 3: { state: 'absent' } };
}

describe('resolveNativeAnnualOutcome', () => {
  it('exposes the frozen V1 profile with the 0-100 scale, cutoff 60, and council limit 2', () => {
    expect(profile).toEqual({
      version: 1,
      academicYear: 2026,
      componentMinimum: 0,
      componentMaximum: 100,
      approvalCutoff: 60,
      councilEligibilityMaximumNotApprovedComponents: 2,
    });
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it('ENG-007: consumes a direct outcome from final recovery even when REC coverage is not applicable', () => {
    const finalRecovery = resolveNativeFinalRecovery(
      {
        originalTermGrades: termGrades(20, 20, 20),
        recoveryGrades: absentTermGrades(),
      },
      NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
    );

    expect(finalRecovery.coverage.state).toBe('not-applicable');
    const result = resolve([
      component(
        'component-a',
        finalRecovery.originalTotal,
        finalRecovery.postRecoveryTotal,
        finalRecovery.coverage,
      ),
    ]);

    expect(result.components[0]).toMatchObject({
      classification: 'approved-direct',
      resolved: true,
      approved: true,
      countsAsNotApproved: false,
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.calculatedAcademicState).toBe('approved-direct');
  });

  it('ENG-007: consumes original and post-REC totals and distinguishes approval after recovery', () => {
    const finalRecovery = resolveNativeFinalRecovery(
      {
        originalTermGrades: termGrades(10, 20, 25),
        recoveryGrades: {
          1: numeric(15),
          2: { state: 'absent' },
          3: { state: 'absent' },
        },
      },
      NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
    );

    expect(finalRecovery.originalTotal).toEqual(numeric(55));
    expect(finalRecovery.postRecoveryTotal).toEqual(numeric(60));
    expect(finalRecovery.coverage.state).toBe('complete');

    const result = resolve([
      component(
        'component-a',
        finalRecovery.originalTotal,
        finalRecovery.postRecoveryTotal,
        finalRecovery.coverage,
      ),
    ]);

    expect(result.components[0]?.classification).toBe('approved-after-recovery');
    expect(result.approvedAfterRecoveryComponentCount).toBe(1);
    expect(result.calculatedAcademicState).toBe('approved-after-recovery');
  });

  it.each([
    [59.9, 59.9, 'not-approved', 'eligible-for-council'],
    [59.9, 60, 'approved-after-recovery', 'approved-after-recovery'],
    [59.9, 60.1, 'approved-after-recovery', 'approved-after-recovery'],
    [60, 60, 'approved-direct', 'approved-direct'],
    [60.1, 60.1, 'approved-direct', 'approved-direct'],
  ] as const)(
    'ENG-008: classifies original %s and post-REC %s as %s',
    (original, postRecovery, classification, academicState) => {
      const result = resolve([component('component-a', numeric(original), numeric(postRecovery))]);

      expect(result.components[0]?.classification).toBe(classification);
      expect(result.calculatedAcademicState).toBe(academicState);
      expect(result.effectiveAcademicState).toBe(academicState);
    },
  );

  it('keeps direct and post-recovery approvals distinguishable in the same annual outcome', () => {
    const result = resolve([
      approvedDirect('component-a'),
      approvedAfterRecovery('component-b'),
    ]);

    expect(result.components.map((item) => item.classification)).toEqual([
      'approved-direct',
      'approved-after-recovery',
    ]);
    expect(result.approvedComponentCount).toBe(2);
    expect(result.approvedDirectComponentCount).toBe(1);
    expect(result.approvedAfterRecoveryComponentCount).toBe(1);
    expect(result.calculatedAcademicState).toBe('approved-after-recovery');
  });

  it.each([
    [0, 'not-required', 'approved-direct'],
    [1, 'eligible', 'eligible-for-council'],
    [2, 'eligible', 'eligible-for-council'],
    [3, 'not-eligible', 'not-eligible-for-council'],
    [4, 'not-eligible', 'not-eligible-for-council'],
  ] as const)(
    'ENG-009: maps %s not-approved components to %s',
    (notApprovedCount, eligibilityState, academicState) => {
      const components = [approvedDirect('approved-component')];
      for (let index = 0; index < notApprovedCount; index += 1) {
        components.push(notApproved(`not-approved-${index + 1}`));
      }

      const result = resolve(components);

      expect(result.notApprovedComponentCount).toBe(notApprovedCount);
      expect(result.councilEligibility).toMatchObject({
        state: eligibilityState,
        notApprovedComponentCount: notApprovedCount,
        maximumNotApprovedComponents: 2,
      });
      expect(result.calculatedAcademicState).toBe(academicState);
    },
  );

  it('uses approved-after-recovery when no component failed and at least one required REC', () => {
    const result = resolve([
      approvedDirect('component-a'),
      approvedAfterRecovery('component-b'),
      approvedDirect('component-c'),
    ]);

    expect(result.notApprovedComponentCount).toBe(0);
    expect(result.councilEligibility.state).toBe('not-required');
    expect(result.calculatedAcademicState).toBe('approved-after-recovery');
  });

  it('ENG-011: a missing component keeps the annual result partial without inventing a failure', () => {
    const missing = component(
      'component-b',
      { state: 'absent' },
      { state: 'absent' },
      coverage('partial', ['synthetic-source-gap']),
    );
    const result = resolve([approvedDirect('component-a'), missing]);

    expect(result.coverage).toMatchObject({
      state: 'partial',
      expectedItemCount: 2,
      resolvedItemCount: 1,
      missingItemCount: 1,
    });
    expect(result.components[1]).toMatchObject({
      classification: 'insufficient-data',
      resolved: false,
      countsAsNotApproved: false,
    });
    expect(result.notApprovedComponentCount).toBe(0);
    expect(result.unresolvedComponentCount).toBe(1);
    expect(result.councilEligibility.state).toBe('insufficient-data');
    expect(result.calculatedAcademicState).toBe('insufficient-data');
    expect(result.findings.map((finding) => finding.code)).toEqual([
      'component-original-total-unresolved',
      'component-post-recovery-total-unresolved',
      'component-coverage-incomplete',
    ]);
  });

  it('preserves official zero and legacy zero as comparable zeros without losing their states', () => {
    const officialZero: AcademicGradeValueV1 = {
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    };
    const legacyZero: AcademicGradeValueV1 = { state: 'legacy-zero', value: 0 };
    const result = resolve([
      component('component-a', officialZero, officialZero),
      component('component-b', legacyZero, legacyZero),
    ]);

    expect(result.components[0]?.originalTotal).toBe(officialZero);
    expect(result.components[0]?.postRecoveryTotal).toBe(officialZero);
    expect(result.components[1]?.originalTotal).toBe(legacyZero);
    expect(result.components[1]?.postRecoveryTotal).toBe(legacyZero);
    expect(result.components.map((item) => item.classification)).toEqual([
      'not-approved',
      'not-approved',
    ]);
    expect(result.notApprovedComponentCount).toBe(2);
    expect(result.calculatedAcademicState).toBe('eligible-for-council');
  });

  it('preserves not-applicable totals and does not turn them into failure or eligibility', () => {
    const notApplicable: AcademicGradeValueV1 = {
      state: 'not-applicable',
      reason: 'synthetic-special-status',
    };
    const result = resolve([
      component(
        'component-a',
        notApplicable,
        notApplicable,
        coverage('not-applicable', ['synthetic-special-status']),
      ),
    ]);

    expect(result.components[0]).toMatchObject({
      originalTotal: notApplicable,
      postRecoveryTotal: notApplicable,
      classification: 'not-applicable',
      resolved: false,
      countsAsNotApproved: false,
    });
    expect(result.notApprovedComponentCount).toBe(0);
    expect(result.coverage.state).toBe('not-applicable');
    expect(result.councilEligibility.state).toBe('insufficient-data');
    expect(result.calculatedAcademicState).toBe('insufficient-data');
  });

  it('preserves insufficient data and reports it without inventing a final result', () => {
    const insufficient: AcademicGradeValueV1 = {
      state: 'insufficient-data',
      reason: 'synthetic-source-gap',
    };
    const result = resolve([
      component(
        'component-a',
        insufficient,
        insufficient,
        coverage('insufficient-data', ['synthetic-source-gap']),
      ),
    ]);

    expect(result.components[0]?.originalTotal).toBe(insufficient);
    expect(result.components[0]?.classification).toBe('insufficient-data');
    expect(result.coverage.state).toBe('insufficient-data');
    expect(result.notApprovedComponentCount).toBe(0);
    expect(result.calculatedAcademicState).toBe('insufficient-data');
    expect(result.findings.map((finding) => finding.code)).toContain(
      'component-coverage-incomplete',
    );
  });

  it.each([
    [
      'negative original',
      component('component-a', numeric(-0.1), numeric(50)),
      'component-original-total-below-minimum',
    ],
    [
      'original above 100',
      component('component-a', numeric(100.1), numeric(50)),
      'component-original-total-above-maximum',
    ],
    [
      'negative post-REC',
      component('component-a', numeric(50), numeric(-0.1)),
      'component-post-recovery-total-below-minimum',
    ],
    [
      'post-REC above 100',
      component('component-a', numeric(50), numeric(100.1)),
      'component-post-recovery-total-above-maximum',
    ],
  ] as const)('reports a %s without silently correcting it', (_label, source, findingCode) => {
    const result = resolve([source]);

    expect(result.components[0]?.originalTotal).toBe(source.originalTotal);
    expect(result.components[0]?.postRecoveryTotal).toBe(source.postRecoveryTotal);
    expect(result.components[0]?.classification).toBe('insufficient-data');
    expect(result.findings.map((finding) => finding.code)).toContain(findingCode);
    expect(result.coverage.state).toBe('insufficient-data');
    expect(result.notApprovedComponentCount).toBe(0);
  });

  it.each([
    ['original-total', component('component-a', numeric(Number.NaN), numeric(50))],
    [
      'post-recovery-total',
      component('component-a', numeric(50), numeric(Number.POSITIVE_INFINITY)),
    ],
  ] as const)('rejects a non-finite %s explicitly', (inputName, source) => {
    expect(() => resolve([source])).toThrow(
      new RangeError(`components[component-a].${inputName} value must be a finite number`),
    );
  });

  it('keeps a pending formal decision separate and leaves the calculated state effective', () => {
    const decision: AnnualFinalDecisionV1 = { status: 'pending' };
    const result = resolve([notApproved('component-a')], decision);

    expect(result.calculatedAcademicState).toBe('eligible-for-council');
    expect(result.finalDecision).toBe(decision);
    expect(result.effectiveAcademicState).toBe('eligible-for-council');
    expect(result.effectiveStateSource).toBe('calculated');
  });

  it('ENG-010: preserves a recorded decision and applies only its explicit resultingState', () => {
    const decision: AnnualFinalDecisionV1 = {
      status: 'recorded',
      outcome: 'failed',
      basis: 'attendance',
      resultingState: 'failed-by-attendance',
      decidedAt: '2026-12-18T12:00:00.000Z',
      reference: 'synthetic-formal-decision',
    };
    const result = resolve([approvedDirect('component-a')], decision);

    expect(result.calculatedAcademicState).toBe('approved-direct');
    expect(result.finalDecision).toBe(decision);
    expect(result.effectiveAcademicState).toBe('failed-by-attendance');
    expect(result.effectiveStateSource).toBe('formal-decision');
    expect(result.components[0]?.classification).toBe('approved-direct');
  });

  it('does not infer a vote, tie break, attendance result, or council exception', () => {
    const result = resolve([notApproved('component-a'), notApproved('component-b')]);

    expect(result.calculatedAcademicState).toBe('eligible-for-council');
    expect(result.effectiveAcademicState).toBe('eligible-for-council');
    expect(result.finalDecision).toEqual({ status: 'pending' });
    expect(result).not.toHaveProperty('vote');
    expect(result).not.toHaveProperty('attendance');
  });

  it('returns explicit insufficient coverage for an empty component set', () => {
    const result = resolve([]);

    expect(result.coverage).toEqual({
      state: 'insufficient-data',
      expectedItemCount: 0,
      resolvedItemCount: 0,
      missingItemCount: 0,
      reasons: ['empty-component-set'],
    });
    expect(result.findings).toEqual([
      {
        code: 'empty-component-set',
        input: 'components',
        message: 'annual outcome requires at least one component',
      },
    ]);
    expect(result.calculatedAcademicState).toBe('insufficient-data');
  });

  it.each([
    ['wrong version', { ...profile, version: 2 }],
    ['wrong minimum', { ...profile, componentMinimum: -1 }],
    ['wrong maximum', { ...profile, componentMaximum: 99 }],
    ['wrong cutoff', { ...profile, approvalCutoff: 59.9 }],
    [
      'wrong council limit',
      { ...profile, councilEligibilityMaximumNotApprovedComponents: 3 },
    ],
    ['missing profile', null],
  ] as const)('rejects an invalid profile with %s explicitly', (_label, invalidProfile) => {
    expect(() =>
      resolveNativeAnnualOutcome(
        { components: [approvedDirect('component-a')], finalDecision: pendingDecision },
        invalidProfile as unknown as NativeAnnualOutcomeProfileV1,
      ),
    ).toThrow(
      new RangeError(
        'profile must match native annual outcome 2026 V1: component scale 0-100, cutoff 60, and council limit 2',
      ),
    );
  });

  it.each([
    ['empty key', [approvedDirect('')]],
    ['duplicate key', [approvedDirect('component-a'), approvedDirect('component-a')]],
  ] as const)('rejects an invalid component set with %s', (_label, components) => {
    expect(() => resolve(components)).toThrow(RangeError);
  });

  it('ENG-012: is deterministic and does not mutate inputs or profile', () => {
    const components: NativeAnnualComponentInputV1[] = [
      approvedDirect('component-a'),
      approvedAfterRecovery('component-b'),
      notApproved('component-c'),
    ];
    const input = { components, finalDecision: pendingDecision };
    const inputBefore = structuredClone(input);
    const profileBefore = structuredClone(profile);

    const first = resolveNativeAnnualOutcome(input, profile);
    const second = resolveNativeAnnualOutcome(input, profile);

    expect(first).toEqual(second);
    expect(input).toEqual(inputBefore);
    expect(profile).toEqual(profileBefore);
  });

  it('returns deterministic component reasons and council eligibility reasons', () => {
    const result = resolve([
      approvedDirect('component-a'),
      notApproved('component-b'),
      notApproved('component-c'),
    ]);

    expect(result.components[0]?.reasons).toEqual(['original-total-at-or-above-cutoff:60']);
    expect(result.components[1]?.reasons).toEqual(['post-recovery-total-below-cutoff:60']);
    expect(result.councilEligibility.reasons).toEqual([
      '2-not-approved-components-within-council-limit-2',
    ]);
  });
});
