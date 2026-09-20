/**
 * Stable order for opaque/canonical contract strings.
 *
 * This is deliberately locale-explicit so runtime/engine defaults cannot change
 * canonicalization, cache keys or structural equality checks.
 */
export function compareCanonicalStringsV1(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

/** Human-facing Portuguese labels with numeric segments (for example 1º, 2º, 10º). */
export function comparePtBrNumericLabelsV1(left: string, right: string): number {
  return left.localeCompare(right, 'pt-BR', { numeric: true });
}
