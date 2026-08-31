import { describe, expect, it } from 'vitest';

import type { AcademicGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
  resolveNativeFinalRecovery,
  type AcademicTermGradeMapV1,
  type NativeFinalRecoveryInputV1,
  type NativeFinalRecoveryProfileV1,
} from '../../../../src/gradebook-domain/calculations/final-recovery/resolve-native-final-recovery';

const profile = NATIVE_FINAL_RECOVERY_PROFILE_2026_V1;

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function grades(
  term1: AcademicGradeValueV1,
  term2: AcademicGradeValueV1,
  term3: AcademicGradeValueV1,
): AcademicTermGradeMapV1 {
  return { 1: term1, 2: term2, 3: term3 };
}

function numericGrades(term1: number, term2: number, term3: number): AcademicTermGradeMapV1 {
  return grades(numeric(term1), numeric(term2), numeric(term3));
}

function absentGrades(): AcademicTermGradeMapV1 {
  return grades({ state: 'absent' }, { state: 'absent' }, { state: 'absent' });
}

function input(
  originalTermGrades: AcademicTermGradeMapV1,
  recoveryGrades: AcademicTermGradeMapV1 = absentGrades(),
): NativeFinalRecoveryInputV1 {
  return { originalTermGrades, recoveryGrades };
}

describe('resolveNativeFinalRecovery', () => {
  it('derives 30/30/40, term cutoffs, annual maximum, and annual cutoff from the integrated profile', () => {
    const result = resolveNativeFinalRecovery(input(numericGrades(20, 20, 20)), profile);

    expect(result.annualMaximum).toBe(100);
    expect(result.annualApplicabilityCutoff).toBe(60);
    expect(result.terms[1]).toMatchObject({ maximum: 30, applicabilityCutoff: 18 });
    expect(result.terms[2]).toMatchObject({ maximum: 30, applicabilityCutoff: 18 });
    expect(result.terms[3]).toMatchObject({ maximum: 40, applicabilityCutoff: 24 });
  });

  it('makes final recovery not applicable at an original total of exactly 60', () => {
    const originals = numericGrades(20, 20, 20);
    const result = resolveNativeFinalRecovery(input(originals), profile);

    expect(result.originalTotal).toEqual(numeric(60));
    expect(result.annualApplicability).toEqual({
      state: 'not-applicable',
      reason: 'annual original total reached the 60 point applicability cutoff',
    });
    expect(result.terms[1].applicability.state).toBe('not-applicable');
    expect(result.terms[2].applicability.state).toBe('not-applicable');
    expect(result.terms[3].applicability.state).toBe('not-applicable');
    expect(result.postRecoveryTotal).toEqual(numeric(60));
    expect(result.coverage.state).toBe('not-applicable');
  });

  it('enables term analysis at 59.99 and treats exact 18/24 limits as not applicable', () => {
    const result = resolveNativeFinalRecovery(input(numericGrades(17.99, 18, 24)), profile);

    expect(result.originalTotal).toEqual(numeric(59.99));
    expect(result.annualApplicability).toEqual({ state: 'applicable' });
    expect(result.terms[1].applicability).toEqual({ state: 'applicable' });
    expect(result.terms[2].applicability).toEqual({
      state: 'not-applicable',
      reason: 'original term grade reached the 60% applicability cutoff',
    });
    expect(result.terms[3].applicability.state).toBe('not-applicable');
    expect(result.postRecoveryTotal.state).toBe('insufficient-data');
    expect(result.coverage.state).toBe('partial');
  });

  it('treats 17.99 and 23.99 as applicable in their respective terms', () => {
    const result = resolveNativeFinalRecovery(input(numericGrades(18, 17.99, 23.99)), profile);

    expect(result.originalTotal).toEqual(numeric(59.98));
    expect(result.terms[1].applicability.state).toBe('not-applicable');
    expect(result.terms[2].applicability.state).toBe('applicable');
    expect(result.terms[3].applicability.state).toBe('applicable');
  });

  it.each([
    ['greater', 15, 60],
    ['equal', 10, 55],
    ['lower', 5, 50],
  ] as const)(
    'ENG-006/REC-004: obligatorily substitutes a %s applicable recovery',
    (_comparison, recovery, expectedTotal) => {
      const originals = numericGrades(10, 20, 25);
      const recoveries = grades(numeric(recovery), { state: 'absent' }, { state: 'absent' });
      const result = resolveNativeFinalRecovery(input(originals, recoveries), profile);

      expect(result.inputs.originalTermGrades).toBe(originals);
      expect(result.inputs.recoveryGrades).toBe(recoveries);
      expect(result.terms[1]).toMatchObject({
        originalTermGrade: numeric(10),
        applicability: { state: 'applicable' },
        recoveryGrade: numeric(recovery),
        replacementTermGrade: numeric(recovery),
      });
      expect(result.terms[2].replacementTermGrade).toEqual(numeric(20));
      expect(result.terms[3].replacementTermGrade).toEqual(numeric(25));
      expect(result.postRecoveryTotal).toEqual(numeric(expectedTotal));
      expect(result.coverage.state).toBe('complete');
    },
  );

  it('substitutes every applicable term independently', () => {
    const result = resolveNativeFinalRecovery(
      input(numericGrades(17, 17, 20), numericGrades(10, 15, 30)),
      profile,
    );

    expect(result.originalTotal).toEqual(numeric(54));
    expect(result.terms[1].replacementTermGrade).toEqual(numeric(10));
    expect(result.terms[2].replacementTermGrade).toEqual(numeric(15));
    expect(result.terms[3].replacementTermGrade).toEqual(numeric(30));
    expect(result.postRecoveryTotal).toEqual(numeric(55));
    expect(result.coverage.state).toBe('complete');
  });

  it('REC-005: does not invent a replacement or post-recovery total for a missing required REC', () => {
    const result = resolveNativeFinalRecovery(input(numericGrades(10, 20, 25)), profile);

    expect(result.terms[1].recoveryGrade).toEqual({ state: 'absent' });
    expect(result.terms[1].replacementTermGrade).toEqual({
      state: 'insufficient-data',
      reason: 'term 1 requires a valid recovery grade for replacement',
    });
    expect(result.terms[1].coverage.state).toBe('partial');
    expect(result.postRecoveryTotal).toEqual({
      state: 'insufficient-data',
      reason: 'post-recovery total requires all necessary term replacements',
    });
    expect(result.coverage.state).toBe('partial');
  });

  it('ignores an improper REC for a non-applicable term and emits an explicit finding', () => {
    const result = resolveNativeFinalRecovery(
      input(numericGrades(10, 20, 25), numericGrades(15, 1, 1)),
      profile,
    );

    expect(result.terms[2].replacementTermGrade).toEqual(numeric(20));
    expect(result.terms[3].replacementTermGrade).toEqual(numeric(25));
    expect(result.postRecoveryTotal).toEqual(numeric(60));
    expect(result.findings).toEqual([
      {
        code: 'recovery-present-when-not-applicable',
        term: 2,
        input: 'recovery-grade',
        value: 1,
        minimum: 0,
        maximum: 30,
        message: 'recovery-grade[2] was provided even though final recovery is not applicable',
      },
      {
        code: 'recovery-present-when-not-applicable',
        term: 3,
        input: 'recovery-grade',
        value: 1,
        minimum: 0,
        maximum: 40,
        message: 'recovery-grade[3] was provided even though final recovery is not applicable',
      },
    ]);
    expect(result.coverage.state).toBe('complete');
  });

  it('preserves official and legacy zero classifications through applicability and replacement', () => {
    const officialZero: AcademicGradeValueV1 = {
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    };
    const legacyZero: AcademicGradeValueV1 = { state: 'legacy-zero', value: 0 };
    const originals = grades(officialZero, numeric(18), numeric(24));
    const recoveries = grades(legacyZero, { state: 'absent' }, { state: 'absent' });
    const result = resolveNativeFinalRecovery(input(originals, recoveries), profile);

    expect(result.inputs.originalTermGrades[1]).toBe(officialZero);
    expect(result.terms[1].originalTermGrade).toBe(officialZero);
    expect(result.terms[1].recoveryGrade).toBe(legacyZero);
    expect(result.terms[1].replacementTermGrade).toBe(legacyZero);
    expect(result.postRecoveryTotal).toEqual(numeric(42));
    expect(result.coverage.state).toBe('complete');
  });

  it('preserves absent, not-applicable, and insufficient states without converting them to zero', () => {
    const absent = resolveNativeFinalRecovery(
      input(grades({ state: 'absent' }, numeric(20), numeric(25))),
      profile,
    );
    const notApplicable = resolveNativeFinalRecovery(
      input(
        grades(
          { state: 'not-applicable', reason: 'synthetic-special-status' },
          numeric(20),
          numeric(25),
        ),
      ),
      profile,
    );
    const insufficient = resolveNativeFinalRecovery(
      input(
        grades(
          { state: 'insufficient-data', reason: 'synthetic-source-gap' },
          numeric(20),
          numeric(25),
        ),
      ),
      profile,
    );

    expect(absent.originalTotal.state).toBe('insufficient-data');
    expect(absent.annualApplicability.state).toBe('insufficient-data');
    expect(absent.postRecoveryTotal.state).toBe('insufficient-data');
    expect(notApplicable.originalTotal).toEqual({
      state: 'not-applicable',
      reason: 'synthetic-special-status',
    });
    expect(notApplicable.annualApplicability.state).toBe('not-applicable');
    expect(notApplicable.postRecoveryTotal.state).toBe('not-applicable');
    expect(insufficient.originalTotal.state).toBe('insufficient-data');
  });

  it('reports a not-applicable recovery state that conflicts with calculated applicability', () => {
    const result = resolveNativeFinalRecovery(
      input(
        numericGrades(10, 20, 25),
        grades(
          { state: 'not-applicable', reason: 'synthetic-source-marker' },
          { state: 'absent' },
          { state: 'absent' },
        ),
      ),
      profile,
    );

    expect(result.terms[1].replacementTermGrade.state).toBe('insufficient-data');
    expect(result.terms[1].coverage.state).toBe('insufficient-data');
    expect(result.postRecoveryTotal.state).toBe('insufficient-data');
    expect(result.findings).toEqual([
      {
        code: 'recovery-state-conflicts-with-applicability',
        term: 1,
        input: 'recovery-grade',
        message: 'recovery-grade[1] is marked not-applicable although final recovery applies',
      },
    ]);
  });

  it.each([
    ['negative original', input(numericGrades(-0.1, 20, 25)), 'original-term-grade-below-zero'],
    [
      'original above maximum',
      input(numericGrades(30.1, 10, 15)),
      'original-term-grade-above-maximum',
    ],
    [
      'negative applicable recovery',
      input(numericGrades(10, 20, 25), numericGrades(-0.1, 0, 0)),
      'recovery-grade-below-zero',
    ],
    [
      'applicable recovery above maximum',
      input(numericGrades(10, 20, 25), numericGrades(30.1, 0, 0)),
      'recovery-grade-above-maximum',
    ],
  ] as const)('preserves and reports a %s without correcting it', (_label, sourceInput, code) => {
    const result = resolveNativeFinalRecovery(sourceInput, profile);

    expect(result.findings.some((finding) => finding.code === code)).toBe(true);
    expect(result.postRecoveryTotal.state).toBe('insufficient-data');
  });

  it.each([
    ['original-term-grade[1]', input(numericGrades(Number.NaN, 20, 25))],
    [
      'recovery-grade[1]',
      input(numericGrades(10, 20, 25), numericGrades(Number.POSITIVE_INFINITY, 0, 0)),
    ],
  ] as const)('rejects a non-finite %s explicitly', (field, sourceInput) => {
    expect(() => resolveNativeFinalRecovery(sourceInput, profile)).toThrow(
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
    ['missing profile', null],
  ])('rejects an invalid profile with %s explicitly', (_label, invalidProfile) => {
    expect(() =>
      resolveNativeFinalRecovery(
        input(numericGrades(10, 20, 25)),
        invalidProfile as unknown as NativeFinalRecoveryProfileV1,
      ),
    ).toThrow(
      new RangeError(
        'profile must match native final recovery 2026 V1: applicability 0.6 and integrated term composition profile',
      ),
    );
  });

  it('ENG-012: is deterministic and does not mutate input or profile', () => {
    const mutableInput = input(numericGrades(10, 20, 25), numericGrades(5, 0, 0));
    const inputBefore = structuredClone(mutableInput);
    const profileBefore = structuredClone(profile);

    expect(resolveNativeFinalRecovery(mutableInput, profile)).toEqual(
      resolveNativeFinalRecovery(mutableInput, profile),
    );
    expect(mutableInput).toEqual(inputBefore);
    expect(profile).toEqual(profileBefore);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.termCompositionProfile)).toBe(true);
    expect(Object.isFrozen(profile.termCompositionProfile.termMaximums)).toBe(true);
  });
});
