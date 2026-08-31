import { describe, expect, it } from 'vitest';

import type { AcademicGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
  composeNativeTermResult,
  type NativeTermCompositionInputV1,
  type NativeTermCompositionProfileV1,
} from '../../../../src/gradebook-domain/calculations/term/compose-native-term-result';

const profile = NATIVE_TERM_COMPOSITION_PROFILE_2026_V1;

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function input(
  term: 1 | 2 | 3,
  quantitativeConsidered: AcademicGradeValueV1,
  qualitativeOperational: AcademicGradeValueV1,
): NativeTermCompositionInputV1 {
  return { term, quantitativeConsidered, qualitativeOperational };
}

describe('composeNativeTermResult', () => {
  it.each([
    [1, 30, 13.5, 16.5],
    [2, 30, 13.5, 16.5],
    [3, 40, 18, 22],
  ] as const)(
    'ENG-001: derives term %s maximum %s into 45/55 blocks',
    (term, maximum, quantitativeMaximum, qualitativeMaximum) => {
      const result = composeNativeTermResult(
        input(term, numeric(quantitativeMaximum), numeric(qualitativeMaximum)),
        profile,
      );

      expect(result.maximums).toEqual({
        term: maximum,
        quantitative: quantitativeMaximum,
        qualitative: qualitativeMaximum,
      });
      expect(result.rawGrade).toEqual({ state: 'numeric', value: maximum });
      expect(result.nativeGrade).toEqual({ state: 'numeric', value: maximum });
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

  it('ENG-002: preserves both blocks, sums the raw grade and delegates rounding to V1', () => {
    const quantitative = numeric(10);
    const qualitative = numeric(12.37);
    const result = composeNativeTermResult(input(1, quantitative, qualitative), profile);

    expect(result.inputs).toEqual({
      quantitativeConsidered: quantitative,
      qualitativeOperational: qualitative,
    });
    expect(result.maximums).toEqual({ term: 30, quantitative: 13.5, qualitative: 16.5 });
    expect(result.rawGrade).toEqual({ state: 'numeric', value: 22.37 });
    expect(result.nativeGrade).toEqual({ state: 'numeric', value: 22.5 });
  });

  it('treats official and legacy zero as resolved zero without erasing their input semantics', () => {
    const quantitative: AcademicGradeValueV1 = {
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    };
    const qualitative: AcademicGradeValueV1 = { state: 'legacy-zero', value: 0 };
    const result = composeNativeTermResult(input(2, quantitative, qualitative), profile);

    expect(result.inputs.quantitativeConsidered).toEqual(quantitative);
    expect(result.inputs.qualitativeOperational).toEqual(qualitative);
    expect(result.rawGrade).toEqual({ state: 'numeric', value: 0 });
    expect(result.nativeGrade).toEqual({ state: 'numeric', value: 0 });
    expect(result.coverage.state).toBe('complete');
  });

  it('ENG-011: keeps an absent block partial instead of converting it to zero', () => {
    const result = composeNativeTermResult(input(1, numeric(10), { state: 'absent' }), profile);

    expect(result.inputs.qualitativeOperational).toEqual({ state: 'absent' });
    expect(result.coverage).toEqual({
      state: 'partial',
      expectedItemCount: 2,
      resolvedItemCount: 1,
      missingItemCount: 1,
      reasons: ['qualitative-operational:absent'],
    });
    expect(result.rawGrade).toMatchObject({ state: 'insufficient-data' });
    expect(result.nativeGrade).toMatchObject({ state: 'insufficient-data' });
  });

  it('keeps not-applicable and insufficient-data semantically distinct', () => {
    const notApplicable = composeNativeTermResult(
      input(1, { state: 'not-applicable', reason: 'synthetic-not-applicable' }, numeric(10)),
      profile,
    );
    const insufficient = composeNativeTermResult(
      input(1, { state: 'insufficient-data', reason: 'synthetic-missing-source' }, numeric(10)),
      profile,
    );

    expect(notApplicable.coverage.state).toBe('not-applicable');
    expect(notApplicable.rawGrade).toEqual({
      state: 'not-applicable',
      reason: 'synthetic-not-applicable',
    });
    expect(notApplicable.nativeGrade.state).toBe('not-applicable');

    expect(insufficient.coverage.state).toBe('insufficient-data');
    expect(insufficient.rawGrade).toMatchObject({ state: 'insufficient-data' });
    expect(insufficient.nativeGrade).toMatchObject({ state: 'insufficient-data' });
  });

  it('ENG-011: reports fully missing input as insufficient coverage with no invented grade', () => {
    const result = composeNativeTermResult(
      input(3, { state: 'absent' }, { state: 'absent' }),
      profile,
    );

    expect(result.coverage).toEqual({
      state: 'insufficient-data',
      expectedItemCount: 2,
      resolvedItemCount: 0,
      missingItemCount: 2,
      reasons: ['quantitative-considered:absent', 'qualitative-operational:absent'],
    });
    expect(result.rawGrade.state).toBe('insufficient-data');
    expect(result.nativeGrade.state).toBe('insufficient-data');
  });

  it('does not clamp negative or above-maximum values and emits deterministic findings', () => {
    const sourceInput = input(1, numeric(-0.5), numeric(17));
    const result = composeNativeTermResult(sourceInput, profile);

    expect(result.inputs).toEqual({
      quantitativeConsidered: numeric(-0.5),
      qualitativeOperational: numeric(17),
    });
    expect(result.findings).toEqual([
      {
        code: 'quantitative-below-zero',
        input: 'quantitative-considered',
        value: -0.5,
        minimum: 0,
        maximum: 13.5,
        message: 'quantitative-considered value -0.5 is below the allowed minimum 0',
      },
      {
        code: 'qualitative-above-maximum',
        input: 'qualitative-operational',
        value: 17,
        minimum: 0,
        maximum: 16.5,
        message: 'qualitative-operational value 17 exceeds the allowed maximum 16.5',
      },
    ]);
    expect(result.coverage.state).toBe('insufficient-data');
    expect(result.rawGrade.state).toBe('insufficient-data');
    expect(result.nativeGrade.state).toBe('insufficient-data');
  });

  it.each([
    ['quantitative-considered', input(1, numeric(Number.NaN), numeric(10))],
    ['qualitative-operational', input(1, numeric(10), numeric(Number.POSITIVE_INFINITY))],
  ] as const)('rejects non-finite %s values explicitly', (field, sourceInput) => {
    expect(() => composeNativeTermResult(sourceInput, profile)).toThrow(
      new RangeError(`${field} value must be a finite number`),
    );
  });

  it.each([
    ['wrong version', { ...profile, version: 2 }],
    ['wrong term maximum', { ...profile, termMaximums: { 1: 30, 2: 30, 3: 39 } }],
    ['wrong quantitative weight', { ...profile, quantitativeWeight: 0.5 }],
    ['missing profile', null],
  ])('rejects an invalid profile with %s explicitly', (_label, invalidProfile) => {
    expect(() =>
      composeNativeTermResult(
        input(1, numeric(10), numeric(10)),
        invalidProfile as unknown as NativeTermCompositionProfileV1,
      ),
    ).toThrow(
      new RangeError(
        'profile must match native term composition 2026 V1: terms 30/30/40 and weights 0.45/0.55',
      ),
    );
  });

  it('rejects an invalid integrated rounding profile explicitly', () => {
    const invalidProfile = {
      ...profile,
      roundingProfile: { ...profile.roundingProfile, lowerThreshold: 0.2 },
    } as unknown as NativeTermCompositionProfileV1;

    expect(() => composeNativeTermResult(input(1, numeric(10), numeric(10)), invalidProfile)).toThrow(
      new RangeError(
        'profile must match rounding V1: version 1, thresholds 0.25/0.75, middle increment 0.5',
      ),
    );
  });

  it('ENG-012: is deterministic and does not mutate input or profile', () => {
    const mutableInput = input(3, numeric(15.25), numeric(20.37));
    const inputBefore = structuredClone(mutableInput);
    const profileBefore = structuredClone(profile);

    const first = composeNativeTermResult(mutableInput, profile);
    const second = composeNativeTermResult(mutableInput, profile);

    expect(first).toEqual(second);
    expect(mutableInput).toEqual(inputBefore);
    expect(profile).toEqual(profileBefore);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.termMaximums)).toBe(true);
    expect(Object.isFrozen(profile.roundingProfile)).toBe(true);
  });
});
