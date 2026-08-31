import { describe, expect, it } from 'vitest';

import {
  ACADEMIC_ROUNDING_PROFILE_V1,
  roundAcademicGrade,
  type RoundingProfileV1,
} from '../../../../src/gradebook-domain/rules/rounding/round-academic-grade';

const profile = ACADEMIC_ROUNDING_PROFILE_V1;

describe('roundAcademicGrade', () => {
  it.each([
    [0, 0],
    [0.24, 0],
    [0.25, 0.5],
    [0.74, 0.5],
    [0.75, 1],
    [0.99, 1],
    [0.999999, 1],
    [1, 1],
    [22, 22],
  ])('ENG-003: rounds boundary input %s to %s', (value, expected) => {
    expect(roundAcademicGrade(value, profile)).toBe(expected);
  });

  it.each([
    [22.12, 22],
    [22.37, 22.5],
    [22.64, 22.5],
    [22.75, 23],
  ])('returns the documented result for %s', (value, expected) => {
    expect(roundAcademicGrade(value, profile)).toBe(expected);
  });

  it.each([
    [-0.24, 0],
    [-0.25, -0.5],
    [-0.74, -0.5],
    [-0.75, -1],
    [-22.12, -22],
    [-22.37, -22.5],
    [-22.64, -22.5],
    [-22.75, -23],
  ])('ENG-003: applies explicit sign symmetry to %s', (value, expected) => {
    const result = roundAcademicGrade(value, profile);

    expect(result).toBe(expected);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('handles ordinary IEEE-754 noise at a boundary without decimal quantization', () => {
    const noisyQuarter = 0.29 - 0.04;

    expect(noisyQuarter).toBeLessThan(0.25);
    expect(roundAcademicGrade(noisyQuarter, profile)).toBe(0.5);
    expect(roundAcademicGrade(-noisyQuarter, profile)).toBe(-0.5);
    expect(roundAcademicGrade(0.249999999, profile)).toBe(0);
    expect(roundAcademicGrade(0.749999999, profile)).toBe(0.5);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite value %s deterministically',
    (value) => {
      expect(() => roundAcademicGrade(value, profile)).toThrow(
        new RangeError('value must be a finite number'),
      );
    },
  );

  it.each([
    ['wrong version', { ...profile, version: 2 }],
    ['wrong lower threshold', { ...profile, lowerThreshold: 0.24 }],
    ['wrong upper threshold', { ...profile, upperThreshold: 0.74 }],
    ['wrong middle increment', { ...profile, middleIncrement: Number.NaN }],
    ['missing profile', null],
  ])('rejects an invalid profile with %s deterministically', (_label, invalidProfile) => {
    expect(() => roundAcademicGrade(22.37, invalidProfile as unknown as RoundingProfileV1)).toThrow(
      new RangeError(
        'profile must match rounding V1: version 1, thresholds 0.25/0.75, middle increment 0.5',
      ),
    );
  });

  it('ENG-012: is deterministic and does not mutate the value or profile', () => {
    const value = 22.64;
    const mutableProfile: RoundingProfileV1 = { ...profile };
    const profileBefore = structuredClone(mutableProfile);

    expect(roundAcademicGrade(value, mutableProfile)).toBe(
      roundAcademicGrade(value, mutableProfile),
    );
    expect(value).toBe(22.64);
    expect(mutableProfile).toEqual(profileBefore);
    expect(profile).toEqual({
      version: 1,
      lowerThreshold: 0.25,
      upperThreshold: 0.75,
      middleIncrement: 0.5,
    });
    expect(Object.isFrozen(profile)).toBe(true);
  });
});
