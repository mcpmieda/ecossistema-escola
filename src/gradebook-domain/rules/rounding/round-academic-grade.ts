export interface RoundingProfileV1 {
  readonly version: 1;
  readonly lowerThreshold: 0.25;
  readonly upperThreshold: 0.75;
  readonly middleIncrement: 0.5;
}

export const ACADEMIC_ROUNDING_PROFILE_V1: RoundingProfileV1 = Object.freeze({
  version: 1,
  lowerThreshold: 0.25,
  upperThreshold: 0.75,
  middleIncrement: 0.5,
});

const FLOATING_POINT_SAFETY_FACTOR = 8;
const MAX_BOUNDARY_TOLERANCE = 1e-12;
const INVALID_PROFILE_MESSAGE =
  'profile must match rounding V1: version 1, thresholds 0.25/0.75, middle increment 0.5';

function isRoundingProfileV1(profile: RoundingProfileV1): boolean {
  return (
    profile !== null &&
    typeof profile === 'object' &&
    profile.version === ACADEMIC_ROUNDING_PROFILE_V1.version &&
    profile.lowerThreshold === ACADEMIC_ROUNDING_PROFILE_V1.lowerThreshold &&
    profile.upperThreshold === ACADEMIC_ROUNDING_PROFILE_V1.upperThreshold &&
    profile.middleIncrement === ACADEMIC_ROUNDING_PROFILE_V1.middleIncrement
  );
}

/**
 * Applies the versioned academic rounding rule to a finite numeric grade.
 *
 * The rule is evaluated over the positive absolute value and the original sign
 * is restored explicitly. Boundary comparisons use a small tolerance based on
 * IEEE-754 representation error, capped at 1e-12. This absorbs ordinary binary
 * noise without quantizing the input or changing genuinely nearby decimals.
 */
export function roundAcademicGrade(value: number, profile: RoundingProfileV1): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('value must be a finite number');
  }

  if (!isRoundingProfileV1(profile)) {
    throw new RangeError(INVALID_PROFILE_MESSAGE);
  }

  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude);
  const fraction = magnitude - whole;
  const boundaryTolerance = Math.min(
    MAX_BOUNDARY_TOLERANCE,
    Number.EPSILON * Math.max(1, magnitude) * FLOATING_POINT_SAFETY_FACTOR,
  );

  let roundedMagnitude: number;

  if (fraction + boundaryTolerance < profile.lowerThreshold) {
    roundedMagnitude = whole;
  } else if (fraction + boundaryTolerance < profile.upperThreshold) {
    roundedMagnitude = whole + profile.middleIncrement;
  } else {
    roundedMagnitude = whole + 1;
  }

  if (roundedMagnitude === 0) {
    return 0;
  }

  return value < 0 ? -roundedMagnitude : roundedMagnitude;
}
