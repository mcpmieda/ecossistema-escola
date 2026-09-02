import type { PlatformConfiguration } from '../../../../../shared/platform-contract';
import {
  PERFORMANCE_COMPARISON_CONFIGURATION_KEY_V1,
  PERFORMANCE_COMPARISON_CONFIGURATION_SCOPE_V1,
  resolvePerformanceComparisonConfigurationV1,
  type PerformanceComparisonConfigurationV1,
} from '../../../../../shared/gradebook-contracts/performance/performance-comparison-contract-v2';

function instant(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Selects the single effective global row. Ambiguous or malformed institutional state fails closed
 * instead of inventing version precedence. Absence alone activates the canonical enabled default.
 */
export function resolveCurrentPerformanceComparisonConfigurationV1(
  configurations: readonly PlatformConfiguration[],
  now: string,
): PerformanceComparisonConfigurationV1 {
  const nowInstant = instant(now);
  if (nowInstant === null) throw new Error('invalid-performance-comparison-clock');

  const candidates = configurations.filter(
    (configuration) =>
      configuration.key === PERFORMANCE_COMPARISON_CONFIGURATION_KEY_V1 &&
      configuration.scope === PERFORMANCE_COMPARISON_CONFIGURATION_SCOPE_V1,
  );
  const applicable = candidates.filter((configuration) => {
    const from = instant(configuration.effectiveFrom);
    const until = instant(configuration.effectiveUntil);
    if (from === null || (configuration.effectiveUntil.trim().length > 0 && until === null)) {
      throw new Error('invalid-performance-comparison-effective-period');
    }
    return from <= nowInstant && (until === null || nowInstant < until);
  });

  if (applicable.length === 0) return resolvePerformanceComparisonConfigurationV1(null);
  if (applicable.length !== 1) throw new Error('ambiguous-performance-comparison-configuration');
  return resolvePerformanceComparisonConfigurationV1(applicable[0]!);
}
