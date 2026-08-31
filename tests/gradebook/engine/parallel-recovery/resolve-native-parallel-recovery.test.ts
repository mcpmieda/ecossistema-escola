import { describe, expect, it } from 'vitest';

import type { AcademicGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  NATIVE_PARALLEL_RECOVERY_PROFILE_2026_V1,
  resolveNativeParallelRecovery,
  type NativeParallelRecoveryInputV1,
  type NativeParallelRecoveryProfileV1,
} from '../../../../src/gradebook-domain/calculations/parallel-recovery/resolve-native-parallel-recovery';

const profile = NATIVE_PARALLEL_RECOVERY_PROFILE_2026_V1;

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function input(
  term: 1 | 2 | 3,
  quantitativeOriginal: AcademicGradeValueV1,
  parallelRecovery: AcademicGradeValueV1,
): NativeParallelRecoveryInputV1 {
  return { term, quantitativeOriginal, parallelRecovery };
}

describe('resolveNativeParallelRecovery', () => {
  it.each([
    [1, 13.5, 8.1],
    [2, 13.5, 8.1],
    [3, 18, 10.8],
  ] as const)(
    'derives term %s quantitative maximum %s and 60%% cutoff %s from composition profile',
    (term, maximum, cutoff) => {
      const result = resolveNativeParallelRecovery(
        input(term, numeric(cutoff), { state: 'absent' }),
        profile,
      );

      expect(result).toMatchObject({
        profileVersion: 1,
        academicYearProfile: 2026,
        term,
        quantitativeMaximum: maximum,
        applicabilityCutoff: cutoff,
        applicabilityRatio: 0.6,
      });
    },
  );

  it.each([
    [1, 8.1],
    [2, 8.1],
    [3, 10.8],
  ] as const)(
    'ENG-004: distinguishes immediately below, at, and above the term %s cutoff',
    (term, cutoff) => {
      const below = resolveNativeParallelRecovery(
        input(term, numeric(cutoff - Number.EPSILON * cutoff), { state: 'absent' }),
        profile,
      );
      const at = resolveNativeParallelRecovery(
        input(term, numeric(cutoff), { state: 'absent' }),
        profile,
      );
      const above = resolveNativeParallelRecovery(
        input(term, numeric(cutoff + Number.EPSILON * cutoff), { state: 'absent' }),
        profile,
      );

      expect(below.applicability).toEqual({ state: 'applicable' });
      expect(at.applicability).toEqual({
        state: 'not-applicable',
        reason: 'quantitative original reached the 60% applicability cutoff',
      });
      expect(above.applicability.state).toBe('not-applicable');
    },
  );

  it.each([
    ['greater', numeric(8), numeric(10), numeric(10), 2],
    ['equal', numeric(8), numeric(8), numeric(8), 0],
    ['lower', numeric(8), numeric(7), numeric(8), 0],
  ] as const)(
    'ENG-005: preserves both values and resolves a %s parallel recovery',
    (_comparison, original, parallel, considered, gain) => {
      const result = resolveNativeParallelRecovery(input(1, original, parallel), profile);

      expect(result.inputs).toEqual({
        quantitativeOriginal: original,
        parallelRecovery: parallel,
      });
      expect(result.quantitativeConsidered).toEqual(considered);
      expect(result.gain).toBe(gain);
      expect(result.coverage).toEqual({
        state: 'complete',
        expectedItemCount: 2,
        resolvedItemCount: 2,
        missingItemCount: 0,
        reasons: [],
      });
      expect(result.findings).toEqual([]);
    },
  );

  it('keeps the original as the current reference when an applicable recovery is absent', () => {
    const original = numeric(8);
    const result = resolveNativeParallelRecovery(input(1, original, { state: 'absent' }), profile);

    expect(result.applicability).toEqual({ state: 'applicable' });
    expect(result.quantitativeConsidered).toBe(original);
    expect(result.gain).toBeNull();
    expect(result.coverage).toEqual({
      state: 'partial',
      expectedItemCount: 2,
      resolvedItemCount: 1,
      missingItemCount: 1,
      reasons: ['parallel-recovery:absent'],
    });
  });

  it('does not use a filled recovery when the quantitative cutoff was already reached', () => {
    const original = numeric(8.2);
    const parallel = numeric(10);
    const result = resolveNativeParallelRecovery(input(1, original, parallel), profile);

    expect(result.applicability.state).toBe('not-applicable');
    expect(result.quantitativeConsidered).toBe(original);
    expect(result.gain).toBe(0);
    expect(result.coverage.state).toBe('not-applicable');
    expect(result.findings).toEqual([
      {
        code: 'parallel-recovery-present-when-not-applicable',
        input: 'parallel-recovery',
        value: 10,
        minimum: 0,
        maximum: 13.5,
        message: 'parallel-recovery was provided even though the quantitative cutoff was reached',
      },
    ]);
  });

  it('uses only the quantitative cutoff even when a hypothetical term total could be below 60%', () => {
    const result = resolveNativeParallelRecovery(input(1, numeric(8.1), numeric(12)), profile);

    expect(result.applicability.state).toBe('not-applicable');
    expect(result.quantitativeConsidered).toEqual(numeric(8.1));
    expect(result.findings[0]?.code).toBe('parallel-recovery-present-when-not-applicable');
  });

  it('compares official and legacy zero without erasing their input classifications', () => {
    const officialZero: AcademicGradeValueV1 = {
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    };
    const legacyZero: AcademicGradeValueV1 = { state: 'legacy-zero', value: 0 };
    const equal = resolveNativeParallelRecovery(input(2, officialZero, legacyZero), profile);
    const improved = resolveNativeParallelRecovery(input(2, legacyZero, numeric(1)), profile);

    expect(equal.inputs).toEqual({
      quantitativeOriginal: officialZero,
      parallelRecovery: legacyZero,
    });
    expect(equal.quantitativeConsidered).toBe(officialZero);
    expect(equal.gain).toBe(0);
    expect(equal.coverage.state).toBe('complete');
    expect(improved.quantitativeConsidered).toEqual(numeric(1));
    expect(improved.gain).toBe(1);
  });

  it.each([
    [
      'absent original',
      { state: 'absent' } as AcademicGradeValueV1,
      numeric(5),
      'insufficient-data',
      'insufficient-data',
    ],
    [
      'not-applicable original',
      {
        state: 'not-applicable',
        reason: 'synthetic-original-not-applicable',
      } as AcademicGradeValueV1,
      { state: 'absent' } as AcademicGradeValueV1,
      'not-applicable',
      'not-applicable',
    ],
    [
      'insufficient original',
      { state: 'insufficient-data', reason: 'synthetic-source-gap' } as AcademicGradeValueV1,
      numeric(5),
      'insufficient-data',
      'insufficient-data',
    ],
  ] as const)(
    'preserves a %s state without converting it to zero',
    (_label, original, parallel, applicabilityState, coverageState) => {
      const result = resolveNativeParallelRecovery(input(1, original, parallel), profile);

      expect(result.inputs.quantitativeOriginal).toEqual(original);
      expect(result.applicability.state).toBe(applicabilityState);
      expect(result.coverage.state).toBe(coverageState);
      expect(result.gain).toBeNull();
      expect(result.quantitativeConsidered.state).not.toBe('numeric');
    },
  );

  it('reports a not-applicable parallel state that conflicts with calculated applicability', () => {
    const original = numeric(8);
    const parallel: AcademicGradeValueV1 = {
      state: 'not-applicable',
      reason: 'synthetic-source-marker',
    };
    const result = resolveNativeParallelRecovery(input(1, original, parallel), profile);

    expect(result.applicability).toEqual({ state: 'applicable' });
    expect(result.quantitativeConsidered).toBe(original);
    expect(result.gain).toBeNull();
    expect(result.coverage.state).toBe('insufficient-data');
    expect(result.findings).toEqual([
      {
        code: 'parallel-recovery-state-conflicts-with-applicability',
        input: 'parallel-recovery',
        message:
          'parallel-recovery is marked not-applicable although the quantitative cutoff applies',
      },
    ]);
  });

  it('preserves insufficient parallel data and keeps the original as reference', () => {
    const original = numeric(8);
    const parallel: AcademicGradeValueV1 = {
      state: 'insufficient-data',
      reason: 'synthetic-missing-cache',
    };
    const result = resolveNativeParallelRecovery(input(1, original, parallel), profile);

    expect(result.inputs.parallelRecovery).toEqual(parallel);
    expect(result.quantitativeConsidered).toBe(original);
    expect(result.gain).toBeNull();
    expect(result.coverage).toMatchObject({
      state: 'insufficient-data',
      resolvedItemCount: 1,
      missingItemCount: 1,
    });
  });

  it.each([
    ['negative original', numeric(-0.1), numeric(5), 'quantitative-original-below-zero'],
    ['above-maximum original', numeric(13.6), numeric(5), 'quantitative-original-above-maximum'],
  ] as const)(
    'preserves and reports a %s without correcting it',
    (_label, original, parallel, code) => {
      const result = resolveNativeParallelRecovery(input(1, original, parallel), profile);

      expect(result.inputs.quantitativeOriginal).toEqual(original);
      expect(result.applicability.state).toBe('insufficient-data');
      expect(result.quantitativeConsidered.state).toBe('insufficient-data');
      expect(result.gain).toBeNull();
      expect(result.coverage.state).toBe('insufficient-data');
      expect(result.findings[0]?.code).toBe(code);
    },
  );

  it.each([
    ['negative recovery', numeric(-0.1), 'parallel-recovery-below-zero'],
    ['above-maximum recovery', numeric(13.6), 'parallel-recovery-above-maximum'],
  ] as const)('preserves and reports a %s without applying it', (_label, parallel, code) => {
    const original = numeric(8);
    const result = resolveNativeParallelRecovery(input(1, original, parallel), profile);

    expect(result.inputs.parallelRecovery).toEqual(parallel);
    expect(result.quantitativeConsidered).toBe(original);
    expect(result.gain).toBeNull();
    expect(result.coverage.state).toBe('insufficient-data');
    expect(result.findings[0]?.code).toBe(code);
  });

  it.each([
    ['quantitative-original', input(1, numeric(Number.NaN), numeric(5))],
    ['quantitative-original', input(1, numeric(Number.NEGATIVE_INFINITY), numeric(5))],
    ['parallel-recovery', input(1, numeric(8), numeric(Number.POSITIVE_INFINITY))],
  ] as const)('rejects non-finite %s values explicitly', (field, sourceInput) => {
    expect(() => resolveNativeParallelRecovery(sourceInput, profile)).toThrow(
      new RangeError(`${field} value must be a finite number`),
    );
  });

  it.each([
    ['wrong version', { ...profile, version: 2 }],
    ['wrong applicability ratio', { ...profile, applicabilityRatio: 0.59 }],
    [
      'wrong term maximum',
      {
        ...profile,
        termCompositionProfile: {
          ...profile.termCompositionProfile,
          termMaximums: { 1: 30, 2: 30, 3: 39 },
        },
      },
    ],
    [
      'wrong quantitative weight',
      {
        ...profile,
        termCompositionProfile: {
          ...profile.termCompositionProfile,
          quantitativeWeight: 0.5,
        },
      },
    ],
    [
      'wrong integrated rounding profile',
      {
        ...profile,
        termCompositionProfile: {
          ...profile.termCompositionProfile,
          roundingProfile: {
            ...profile.termCompositionProfile.roundingProfile,
            lowerThreshold: 0.2,
          },
        },
      },
    ],
    ['missing profile', null],
  ])('rejects an invalid profile with %s explicitly', (_label, invalidProfile) => {
    expect(() =>
      resolveNativeParallelRecovery(
        input(1, numeric(8), numeric(9)),
        invalidProfile as unknown as NativeParallelRecoveryProfileV1,
      ),
    ).toThrow(
      new RangeError(
        'profile must match native parallel recovery 2026 V1: applicability 0.6 and integrated term composition profile',
      ),
    );
  });

  it('rejects an invalid term explicitly', () => {
    const invalidInput = {
      ...input(1, numeric(8), numeric(9)),
      term: 4,
    } as unknown as NativeParallelRecoveryInputV1;

    expect(() => resolveNativeParallelRecovery(invalidInput, profile)).toThrow(
      new RangeError('term must be 1, 2, or 3'),
    );
  });

  it('ENG-012: is deterministic and does not mutate input or profile', () => {
    const mutableInput = input(3, numeric(10.7), numeric(12));
    const inputBefore = structuredClone(mutableInput);
    const profileBefore = structuredClone(profile);

    expect(resolveNativeParallelRecovery(mutableInput, profile)).toEqual(
      resolveNativeParallelRecovery(mutableInput, profile),
    );
    expect(mutableInput).toEqual(inputBefore);
    expect(profile).toEqual(profileBefore);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.termCompositionProfile)).toBe(true);
    expect(Object.isFrozen(profile.termCompositionProfile.termMaximums)).toBe(true);
  });
});
