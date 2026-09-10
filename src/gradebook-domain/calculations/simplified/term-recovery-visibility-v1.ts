import type { SimplifiedTermOutcomeV1 } from './resolve-simplified-academic-engine-v1';

/** #646 is a display restriction only. It does not change Z replacement or annual REC. */
export function termRecoveryVisibilityV1(
  term: SimplifiedTermOutcomeV1 | null,
  finalRecoveryApplicable: boolean | null,
): { readonly showParallel: boolean; readonly showRecovery: boolean } {
  const eligible = term !== null && term.coverage.complete && term.parallelApplicable === true &&
    term.roundedMilli * 5 < term.termMaximumMilli * 3;
  return { showParallel: eligible, showRecovery: eligible && finalRecoveryApplicable === true };
}
