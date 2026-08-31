import type {
  AcademicGradeValueV1,
  AcademicTermV1,
  ResultCoverageV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  NATIVE_PARALLEL_RECOVERY_PROFILE_2026_V1,
  resolveNativeParallelRecovery,
  type NativeParallelRecoveryFindingV1,
  type NativeParallelRecoveryProfileV1,
  type NativeParallelRecoveryV1,
} from '../parallel-recovery/resolve-native-parallel-recovery';
import {
  composeNativeTermResult,
  NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
  type NativeTermCompositionFindingV1,
  type NativeTermCompositionProfileV1,
  type NativeTermCompositionV1,
} from '../term/compose-native-term-result';

export interface NativeTermOutcomeProfileV1 {
  readonly version: 1;
  readonly academicYear: 2026;
  readonly parallelRecoveryProfile: NativeParallelRecoveryProfileV1;
  readonly termCompositionProfile: NativeTermCompositionProfileV1;
}

export const NATIVE_TERM_OUTCOME_PROFILE_2026_V1: NativeTermOutcomeProfileV1 = Object.freeze({
  version: 1,
  academicYear: 2026,
  parallelRecoveryProfile: NATIVE_PARALLEL_RECOVERY_PROFILE_2026_V1,
  termCompositionProfile: NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
});

export interface NativeTermOutcomeInputV1 {
  readonly term: AcademicTermV1;
  readonly quantitativeOriginal: AcademicGradeValueV1;
  readonly parallelRecovery: AcademicGradeValueV1;
  readonly qualitativeOperational: AcademicGradeValueV1;
}

export type NativeTermOutcomeFindingV1 =
  | {
      readonly stage: 'parallel-recovery';
      readonly finding: NativeParallelRecoveryFindingV1;
    }
  | {
      readonly stage: 'term-composition';
      readonly finding: NativeTermCompositionFindingV1;
    };

export interface NativeTermOutcomeV1 {
  readonly profileVersion: 1;
  readonly academicYearProfile: 2026;
  readonly term: AcademicTermV1;
  readonly maximum: number;
  readonly inputs: NativeTermOutcomeInputV1;
  readonly parallelRecoveryResolution: NativeParallelRecoveryV1;
  readonly composition: NativeTermCompositionV1;
  readonly rawGrade: AcademicGradeValueV1;
  readonly nativeGrade: AcademicGradeValueV1;
  readonly nativePercentage: AcademicGradeValueV1;
  readonly coverage: ResultCoverageV1;
  readonly findings: readonly NativeTermOutcomeFindingV1[];
}

const INVALID_PROFILE_MESSAGE =
  'profile must match native term outcome 2026 V1 and its integrated parallel recovery and term composition profiles';

function validateProfile(profile: NativeTermOutcomeProfileV1): void {
  if (
    profile === null ||
    typeof profile !== 'object' ||
    profile.version !== 1 ||
    profile.academicYear !== 2026 ||
    profile.parallelRecoveryProfile === null ||
    typeof profile.parallelRecoveryProfile !== 'object' ||
    profile.termCompositionProfile === null ||
    typeof profile.termCompositionProfile !== 'object'
  ) {
    throw new RangeError(INVALID_PROFILE_MESSAGE);
  }
}

function isComparable(value: AcademicGradeValueV1): boolean {
  return (
    value.state === 'numeric' || value.state === 'official-zero' || value.state === 'legacy-zero'
  );
}

function parallelSlotResolved(resolution: NativeParallelRecoveryV1): boolean {
  if (resolution.applicability.state === 'not-applicable') return true;
  if (resolution.applicability.state !== 'applicable') return false;

  return (
    isComparable(resolution.inputs.parallelRecovery) &&
    !resolution.findings.some((finding) => finding.input === 'parallel-recovery')
  );
}

function consolidatedCoverage(
  resolution: NativeParallelRecoveryV1,
  composition: NativeTermCompositionV1,
): ResultCoverageV1 {
  const parallelResolved = parallelSlotResolved(resolution);
  const resolvedItemCount = composition.coverage.resolvedItemCount + Number(parallelResolved);
  const expectedItemCount = composition.coverage.expectedItemCount + 1;
  const recoveryReasons =
    resolution.applicability.state === 'not-applicable'
      ? []
      : resolution.coverage.reasons.map((reason) => `parallel-recovery:${reason}`);
  const reasons = Array.from(
    new Set([
      ...recoveryReasons,
      ...composition.coverage.reasons.map((reason) => `term-composition:${reason}`),
    ]),
  );

  let state: ResultCoverageV1['state'];
  if (composition.coverage.state === 'not-applicable') {
    state = 'not-applicable';
  } else if (
    composition.coverage.state === 'insufficient-data' ||
    resolution.applicability.state === 'insufficient-data' ||
    (resolution.applicability.state === 'applicable' &&
      resolution.coverage.state === 'insufficient-data')
  ) {
    state = 'insufficient-data';
  } else if (resolvedItemCount === expectedItemCount) {
    state = 'complete';
  } else if (resolvedItemCount > 0) {
    state = 'partial';
  } else {
    state = 'insufficient-data';
  }

  return {
    state,
    expectedItemCount,
    resolvedItemCount,
    missingItemCount: expectedItemCount - resolvedItemCount,
    reasons,
  };
}

function percentageForGrade(
  nativeGrade: AcademicGradeValueV1,
  maximum: number,
): AcademicGradeValueV1 {
  switch (nativeGrade.state) {
    case 'numeric':
    case 'official-zero':
    case 'legacy-zero':
      return { state: 'numeric', value: (nativeGrade.value / maximum) * 100 };
    case 'not-applicable':
      return {
        state: 'not-applicable',
        reason: nativeGrade.reason ?? 'native term grade is not applicable',
      };
    case 'absent':
      return {
        state: 'insufficient-data',
        reason: 'native percentage requires a comparable native term grade: absent',
      };
    case 'insufficient-data':
      return {
        state: 'insufficient-data',
        reason: `native percentage requires a comparable native term grade: ${nativeGrade.reason}`,
      };
  }
}

export function composeNativeTermOutcome(
  input: NativeTermOutcomeInputV1,
  profile: NativeTermOutcomeProfileV1,
): NativeTermOutcomeV1 {
  validateProfile(profile);

  const parallelRecoveryResolution = resolveNativeParallelRecovery(
    {
      term: input.term,
      quantitativeOriginal: input.quantitativeOriginal,
      parallelRecovery: input.parallelRecovery,
    },
    profile.parallelRecoveryProfile,
  );
  const composition = composeNativeTermResult(
    {
      term: input.term,
      quantitativeConsidered: parallelRecoveryResolution.quantitativeConsidered,
      qualitativeOperational: input.qualitativeOperational,
    },
    profile.termCompositionProfile,
  );
  const maximum = composition.maximums.term;
  const findings: NativeTermOutcomeFindingV1[] = [
    ...parallelRecoveryResolution.findings.map((finding): NativeTermOutcomeFindingV1 => ({
      stage: 'parallel-recovery',
      finding,
    })),
    ...composition.findings.map((finding): NativeTermOutcomeFindingV1 => ({
      stage: 'term-composition',
      finding,
    })),
  ];

  return {
    profileVersion: profile.version,
    academicYearProfile: profile.academicYear,
    term: input.term,
    maximum,
    inputs: {
      term: input.term,
      quantitativeOriginal: input.quantitativeOriginal,
      parallelRecovery: input.parallelRecovery,
      qualitativeOperational: input.qualitativeOperational,
    },
    parallelRecoveryResolution,
    composition,
    rawGrade: composition.rawGrade,
    nativeGrade: composition.nativeGrade,
    nativePercentage: percentageForGrade(composition.nativeGrade, maximum),
    coverage: consolidatedCoverage(parallelRecoveryResolution, composition),
    findings,
  };
}
