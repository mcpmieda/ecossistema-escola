import { describe, expect, it } from 'vitest';

import type { AcademicGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  composeNativeTermOutcome,
  NATIVE_TERM_OUTCOME_PROFILE_2026_V1,
  type NativeTermOutcomeInputV1,
  type NativeTermOutcomeProfileV1,
} from '../../../../src/gradebook-domain/calculations/term-result/compose-native-term-outcome';

const profile = NATIVE_TERM_OUTCOME_PROFILE_2026_V1;

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function input(
  term: 1 | 2 | 3,
  quantitativeOriginal: AcademicGradeValueV1,
  parallelRecovery: AcademicGradeValueV1,
  qualitativeOperational: AcademicGradeValueV1,
): NativeTermOutcomeInputV1 {
  return { term, quantitativeOriginal, parallelRecovery, qualitativeOperational };
}

describe('composeNativeTermOutcome', () => {
  it.each([
    [1, 10, 10, 30, 20, 66.66666666666666],
    [2, 10, 10, 30, 20, 66.66666666666666],
    [3, 15, 20, 40, 35, 87.5],
  ] as const)(
    'ENG-001/ENG-002: composes T%s with integrated maximum, grade, and percentage',
    (term, quantitative, qualitative, maximum, grade, percentage) => {
      const result = composeNativeTermOutcome(
        input(term, numeric(quantitative), { state: 'absent' }, numeric(qualitative)),
        profile,
      );

      expect(result.maximum).toBe(maximum);
      expect(result.parallelRecoveryResolution.applicability.state).toBe('not-applicable');
      expect(result.rawGrade).toEqual(numeric(grade));
      expect(result.nativeGrade).toEqual(numeric(grade));
      expect(result.nativePercentage).toEqual(numeric(percentage));
      expect(result.coverage).toEqual({
        state: 'complete',
        expectedItemCount: 3,
        resolvedItemCount: 3,
        missingItemCount: 0,
        reasons: [],
      });
    },
  );

  it('uses the original in a normal composition when parallel recovery is not applicable', () => {
    const original = numeric(8.1);
    const result = composeNativeTermOutcome(
      input(1, original, { state: 'absent' }, numeric(10.4)),
      profile,
    );

    expect(result.parallelRecoveryResolution.quantitativeConsidered).toBe(original);
    expect(result.composition.inputs.quantitativeConsidered).toBe(original);
    expect(result.rawGrade).toEqual(numeric(18.5));
    expect(result.nativeGrade).toEqual(numeric(18.5));
    expect(result.coverage.state).toBe('complete');
  });

  it('ENG-005: preserves both values and uses the greater valid parallel recovery', () => {
    const original = numeric(8);
    const parallel = numeric(10);
    const result = composeNativeTermOutcome(input(1, original, parallel, numeric(10.2)), profile);

    expect(result.inputs.quantitativeOriginal).toBe(original);
    expect(result.inputs.parallelRecovery).toBe(parallel);
    expect(result.parallelRecoveryResolution.inputs).toEqual({
      quantitativeOriginal: original,
      parallelRecovery: parallel,
    });
    expect(result.parallelRecoveryResolution.quantitativeConsidered).toBe(parallel);
    expect(result.composition.inputs.quantitativeConsidered).toBe(parallel);
    expect(result.rawGrade).toEqual(numeric(20.2));
    expect(result.nativeGrade).toEqual(numeric(20));
    expect(result.nativePercentage).toEqual(numeric((20 / 30) * 100));
    expect(result.coverage.state).toBe('complete');
  });

  it('keeps the greater original when a valid applicable parallel recovery is lower', () => {
    const original = numeric(8);
    const parallel = numeric(7);
    const result = composeNativeTermOutcome(input(1, original, parallel, numeric(10)), profile);

    expect(result.parallelRecoveryResolution.quantitativeConsidered).toBe(original);
    expect(result.parallelRecoveryResolution.gain).toBe(0);
    expect(result.nativeGrade).toEqual(numeric(18));
    expect(result.coverage.state).toBe('complete');
  });

  it('keeps a provisional original and percentage but downgrades consolidated coverage when required recovery is absent', () => {
    const original = numeric(8);
    const result = composeNativeTermOutcome(
      input(1, original, { state: 'absent' }, numeric(10)),
      profile,
    );

    expect(result.parallelRecoveryResolution.applicability).toEqual({ state: 'applicable' });
    expect(result.parallelRecoveryResolution.quantitativeConsidered).toBe(original);
    expect(result.nativeGrade).toEqual(numeric(18));
    expect(result.nativePercentage).toEqual(numeric(60));
    expect(result.coverage).toEqual({
      state: 'partial',
      expectedItemCount: 3,
      resolvedItemCount: 2,
      missingItemCount: 1,
      reasons: ['parallel-recovery:parallel-recovery:absent'],
    });
  });

  it('ENG-011: does not invent a final grade or percentage when qualitative data is absent', () => {
    const result = composeNativeTermOutcome(
      input(2, numeric(10), { state: 'absent' }, { state: 'absent' }),
      profile,
    );

    expect(result.rawGrade).toMatchObject({ state: 'insufficient-data' });
    expect(result.nativeGrade).toMatchObject({ state: 'insufficient-data' });
    expect(result.nativePercentage).toMatchObject({ state: 'insufficient-data' });
    expect(result.coverage).toEqual({
      state: 'partial',
      expectedItemCount: 3,
      resolvedItemCount: 2,
      missingItemCount: 1,
      reasons: ['term-composition:qualitative-operational:absent'],
    });
  });

  it('preserves official and legacy zero classifications while comparing and composing them', () => {
    const officialZero: AcademicGradeValueV1 = {
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    };
    const legacyZero: AcademicGradeValueV1 = { state: 'legacy-zero', value: 0 };
    const result = composeNativeTermOutcome(
      input(1, officialZero, legacyZero, legacyZero),
      profile,
    );

    expect(result.inputs).toEqual({
      term: 1,
      quantitativeOriginal: officialZero,
      parallelRecovery: legacyZero,
      qualitativeOperational: legacyZero,
    });
    expect(result.parallelRecoveryResolution.quantitativeConsidered).toBe(officialZero);
    expect(result.composition.inputs.qualitativeOperational).toBe(legacyZero);
    expect(result.rawGrade).toEqual(numeric(0));
    expect(result.nativeGrade).toEqual(numeric(0));
    expect(result.nativePercentage).toEqual(numeric(0));
    expect(result.coverage.state).toBe('complete');
  });

  it('keeps findings from both integrated stages ordered and explicitly attributed', () => {
    const result = composeNativeTermOutcome(
      input(1, numeric(8.2), numeric(10), numeric(17)),
      profile,
    );

    expect(result.findings.map(({ stage, finding }) => [stage, finding.code])).toEqual([
      ['parallel-recovery', 'parallel-recovery-present-when-not-applicable'],
      ['term-composition', 'qualitative-above-maximum'],
    ]);
    expect(result.coverage.state).toBe('insufficient-data');
    expect(result.nativePercentage.state).toBe('insufficient-data');
  });

  it.each([
    ['quantitative-original', input(1, numeric(Number.NaN), numeric(5), numeric(10))],
    ['parallel-recovery', input(1, numeric(8), numeric(Number.POSITIVE_INFINITY), numeric(10))],
    [
      'qualitative-operational',
      input(1, numeric(10), { state: 'absent' }, numeric(Number.NEGATIVE_INFINITY)),
    ],
  ] as const)('rejects a non-finite %s explicitly', (field, sourceInput) => {
    expect(() => composeNativeTermOutcome(sourceInput, profile)).toThrow(
      new RangeError(`${field} value must be a finite number`),
    );
  });

  it.each([
    ['wrong outcome version', { ...profile, version: 2 }],
    ['missing outcome profile', null],
  ])('rejects an invalid outer profile with %s', (_label, invalidProfile) => {
    expect(() =>
      composeNativeTermOutcome(
        input(1, numeric(10), { state: 'absent' }, numeric(10)),
        invalidProfile as unknown as NativeTermOutcomeProfileV1,
      ),
    ).toThrow(
      new RangeError(
        'profile must match native term outcome 2026 V1 and its integrated parallel recovery and term composition profiles',
      ),
    );
  });

  it('rejects an incompatible integrated profile explicitly', () => {
    const invalidProfile = {
      ...profile,
      parallelRecoveryProfile: {
        ...profile.parallelRecoveryProfile,
        applicabilityRatio: 0.59,
      },
    } as unknown as NativeTermOutcomeProfileV1;

    expect(() =>
      composeNativeTermOutcome(input(1, numeric(8), numeric(9), numeric(10)), invalidProfile),
    ).toThrow(
      new RangeError(
        'profile must match native parallel recovery 2026 V1: applicability 0.6 and integrated term composition profile',
      ),
    );
  });

  it('ENG-012: is deterministic and does not mutate input or profile', () => {
    const mutableInput = input(3, numeric(10.7), numeric(12), numeric(20.37));
    const inputBefore = structuredClone(mutableInput);
    const profileBefore = structuredClone(profile);

    expect(composeNativeTermOutcome(mutableInput, profile)).toEqual(
      composeNativeTermOutcome(mutableInput, profile),
    );
    expect(mutableInput).toEqual(inputBefore);
    expect(profile).toEqual(profileBefore);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.parallelRecoveryProfile)).toBe(true);
    expect(Object.isFrozen(profile.termCompositionProfile)).toBe(true);
  });
});
