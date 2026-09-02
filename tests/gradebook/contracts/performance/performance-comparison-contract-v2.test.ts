import { describe, expect, it } from 'vitest';
import type { PlatformConfiguration } from '../../../../shared/platform-contract';
import type { ResultCoverageV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import { CLASS_PERFORMANCE_CONTRACT_V1 } from '../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import {
  DEFAULT_PERFORMANCE_COMPARISON_CONFIGURATION_V1,
  PERFORMANCE_COMPARISON_BASIS_V2,
  PERFORMANCE_COMPARISON_CONFIGURATION_KEY_V1,
  PERFORMANCE_COMPARISON_CONFIGURATION_SCOPE_V1,
  PERFORMANCE_COMPARISON_CONTRACT_V2,
  PERFORMANCE_COMPARISON_DEFAULT_ENABLED_V1,
  comparePerformancePercentagesV2,
  resolvePerformanceComparisonConfigurationV1,
  type PerformanceComparisonOperandV2,
  type PerformanceComparisonProfileRefV2,
  type PerformanceComparisonProjectionV2,
  type PerformanceProfileCompatibilityV2,
} from '../../../../shared/gradebook-contracts/performance/performance-comparison-contract-v2';

const profile2026: PerformanceComparisonProfileRefV2 = {
  profileId: 'evaluation-profile:synthetic:2026',
  profileVersion: '1',
  percentageSemanticsVersion: 'percentage-v1',
};

const futureScaleProfile: PerformanceComparisonProfileRefV2 = {
  profileId: 'evaluation-profile:synthetic:future-scale',
  profileVersion: '2',
  percentageSemanticsVersion: 'percentage-v1',
};

const incompatibleProfile: PerformanceComparisonProfileRefV2 = {
  profileId: 'evaluation-profile:synthetic:incompatible',
  profileVersion: '3',
  percentageSemanticsVersion: 'different-semantic-v1',
};

function completeCoverage(): ResultCoverageV1 {
  return {
    state: 'complete',
    expectedItemCount: 1,
    resolvedItemCount: 1,
    missingItemCount: 0,
    reasons: [],
  };
}

function operand(term: 1 | 2 | 3, points: number, maximum: number): PerformanceComparisonOperandV2 {
  return {
    period: { kind: 'term', term },
    percentage: { state: 'numeric', value: (points / maximum) * 100 },
    coverage: completeCoverage(),
  };
}

function compatibility(
  currentProfile: PerformanceComparisonProfileRefV2 = profile2026,
  referenceProfile: PerformanceComparisonProfileRefV2 = profile2026,
  source: Extract<
    PerformanceProfileCompatibilityV2,
    { state: 'compatible' }
  >['source'] = 'same-profile-semantics',
): Extract<PerformanceProfileCompatibilityV2, { state: 'compatible' }> {
  return {
    state: 'compatible',
    source,
    ruleVersion: 'profile-comparison:synthetic:v1',
    currentProfile,
    referenceProfile,
  };
}

describe('performance comparison contract v2', () => {
  it('treats 24/30 and 32/40 as proportionally equal by official percentage', () => {
    const comparison = comparePerformancePercentagesV2({
      current: operand(1, 24, 30),
      reference: operand(3, 32, 40),
      compatibility: compatibility(),
    });

    expect(comparison.state).toBe('comparable');
    if (comparison.state !== 'comparable') throw new Error('expected comparable synthetic case');
    expect(comparison.basis).toBe(PERFORMANCE_COMPARISON_BASIS_V2);
    expect(comparison.current.percentage).toEqual({ state: 'numeric', value: 80 });
    expect(comparison.reference.percentage).toEqual({ state: 'numeric', value: 80 });
    expect(comparison.relation).toBe('proportionally-equal');
    expect(comparison).not.toHaveProperty('tolerance');
    expect(comparison).not.toHaveProperty('epsilon');
  });

  it('treats 21/30 as proportionally lower than 32/40', () => {
    const comparison = comparePerformancePercentagesV2({
      current: operand(1, 21, 30),
      reference: operand(3, 32, 40),
      compatibility: compatibility(),
    });

    expect(comparison).toMatchObject({
      state: 'comparable',
      basis: 'percentage',
      relation: 'proportionally-lower',
    });
  });

  it('remains scale-independent for future maxima when compatibility is officially declared', () => {
    const comparison = comparePerformancePercentagesV2({
      current: operand(1, 48, 60),
      reference: operand(3, 32, 40),
      compatibility: compatibility(
        futureScaleProfile,
        profile2026,
        'declared-cross-profile-compatibility',
      ),
    });

    expect(comparison).toMatchObject({
      state: 'comparable',
      relation: 'proportionally-equal',
    });
  });

  it('fails closed when profile semantics are not officially compatible', () => {
    const profileCompatibility: PerformanceProfileCompatibilityV2 = {
      state: 'not-compatible',
      reason: 'profile-semantics-not-declared-compatible',
      ruleVersion: null,
      currentProfile: incompatibleProfile,
      referenceProfile: profile2026,
    };
    const comparison = comparePerformancePercentagesV2({
      current: operand(1, 24, 30),
      reference: operand(3, 32, 40),
      compatibility: profileCompatibility,
    });

    expect(comparison).toMatchObject({
      state: 'not-comparable',
      reason: 'profile-semantics-not-declared-compatible',
    });
  });

  it('distinguishes zero, absence, not-applicable and insufficient-data', () => {
    const zero: PerformanceComparisonOperandV2 = {
      period: { kind: 'term', term: 1 },
      percentage: { state: 'numeric', value: 0 },
      coverage: completeCoverage(),
    };
    const reference = operand(2, 0, 30);
    const zeroComparison = comparePerformancePercentagesV2({
      current: zero,
      reference,
      compatibility: compatibility(),
    });

    expect(zeroComparison).toMatchObject({
      state: 'comparable',
      relation: 'proportionally-equal',
    });

    for (const [percentage, reason] of [
      [{ state: 'absent' }, 'current-percentage-absent'],
      [{ state: 'not-applicable', reason: 'synthetic-not-applicable' }, 'current-percentage-not-applicable'],
      [
        { state: 'insufficient-data', reason: 'synthetic-insufficient-data' },
        'current-percentage-insufficient-data',
      ],
    ] as const) {
      const comparison = comparePerformancePercentagesV2({
        current: { ...zero, percentage },
        reference,
        compatibility: compatibility(),
      });
      expect(comparison).toMatchObject({ state: 'not-comparable', reason });
    }
  });

  it('fails closed on incomplete coverage even if a numeric percentage is present', () => {
    const comparison = comparePerformancePercentagesV2({
      current: {
        ...operand(1, 24, 30),
        coverage: {
          state: 'insufficient-data',
          expectedItemCount: 1,
          resolvedItemCount: 0,
          missingItemCount: 1,
          reasons: ['synthetic-missing-input'],
        },
      },
      reference: operand(3, 32, 40),
      compatibility: compatibility(),
    });

    expect(comparison).toMatchObject({
      state: 'not-comparable',
      reason: 'current-coverage-insufficient-data',
    });
  });

  it('uses the existing server platform configuration shape and defaults to enabled', () => {
    expect(PERFORMANCE_COMPARISON_DEFAULT_ENABLED_V1).toBe(true);
    expect(resolvePerformanceComparisonConfigurationV1(null)).toEqual(
      DEFAULT_PERFORMANCE_COMPARISON_CONFIGURATION_V1,
    );

    const platformConfiguration: PlatformConfiguration = {
      id: 'platform-config:synthetic:comparison',
      key: PERFORMANCE_COMPARISON_CONFIGURATION_KEY_V1,
      scope: PERFORMANCE_COMPARISON_CONFIGURATION_SCOPE_V1,
      version: '2',
      active: false,
      effectiveFrom: '2026-09-02T00:00:00Z',
      effectiveUntil: '',
      updatedAt: '2026-09-02T00:00:00Z',
    };
    const disabled = resolvePerformanceComparisonConfigurationV1(platformConfiguration);

    expect(disabled).toMatchObject({
      source: 'platform-configuration',
      enabled: false,
      version: '2',
    });
    if (disabled.enabled) throw new Error('expected disabled synthetic configuration');
    expect(PERFORMANCE_COMPARISON_CONTRACT_V2.configuration).toMatchObject({
      source: 'server-only',
      platformReadCapability: 'platform.settings.read',
      browserPreference: 'forbidden',
      writePath: 'not-integrated-hard-stop',
    });

    const projection: PerformanceComparisonProjectionV2 = {
      state: 'disabled',
      selection: {
        current: { kind: 'term', term: 1 },
        reference: { kind: 'term', term: 3 },
      },
      configuration: disabled,
    };
    expect(projection.state).toBe('disabled');
    expect(JSON.stringify(projection)).not.toContain('localStorage');
    expect(JSON.stringify(projection)).not.toContain('browserPreference');
  });

  it('keeps V1 historical semantics interpretable instead of mutating the old contract', () => {
    expect(CLASS_PERFORMANCE_CONTRACT_V1.version).toBe(1);
    expect(CLASS_PERFORMANCE_CONTRACT_V1.comparisonBases).toEqual(['official-value', 'percentage']);
    expect(PERFORMANCE_COMPARISON_CONTRACT_V2).toMatchObject({
      version: 2,
      predecessorVersion: 1,
      compatibility: { reinterpretHistoricalV1: false },
      tolerance: 'forbidden',
      derivedMetrics: 'forbidden',
    });
  });
});
