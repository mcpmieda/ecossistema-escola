import { describe, expect, it } from 'vitest';
import type { PlatformConfiguration } from '../../../shared/platform-contract';
import {
  DEFAULT_PERFORMANCE_COMPARISON_CONFIGURATION_V1,
  type PerformanceComparisonOperandV2,
  type PerformanceComparisonProfileRefV2,
} from '../../../shared/gradebook-contracts/performance/performance-comparison-contract-v2';
import { resolveCurrentPerformanceComparisonConfigurationV1 } from '../../../server/gradebook/application/read-models/performance/performance-comparison-configuration-v1';
import {
  resolvePerformanceComparisonProjectionV2,
  resolvePerformanceProfileCompatibilityV2,
} from '../../../server/gradebook/application/read-models/performance/performance-comparison-resolver-v2';

const profile2026: PerformanceComparisonProfileRefV2 = {
  profileId: 'evaluation-profile:2026',
  profileVersion: '1',
  percentageSemanticsVersion: 'official-percentage:2026:v1',
};

function operand(term: 1 | 2 | 3, points: number, maximum: number): PerformanceComparisonOperandV2 {
  return {
    period: { kind: 'term', term },
    percentage: { state: 'numeric', value: (points / maximum) * 100 },
    coverage: {
      state: 'complete',
      expectedItemCount: 1,
      resolvedItemCount: 1,
      missingItemCount: 0,
      reasons: [],
    },
  };
}

function resolved(
  current: PerformanceComparisonOperandV2,
  reference: PerformanceComparisonOperandV2,
) {
  return resolvePerformanceComparisonProjectionV2({
    selection: { current: current.period, reference: reference.period },
    configuration: DEFAULT_PERFORMANCE_COMPARISON_CONFIGURATION_V1,
    current,
    reference,
    currentProfile: profile2026,
    referenceProfile: profile2026,
  });
}

describe('resolvedor runtime da comparação proporcional V2', () => {
  it('compara 24/30 e 32/40 como iguais usando somente percentuais oficiais', () => {
    const projection = resolved(operand(1, 24, 30), operand(3, 32, 40));
    expect(projection).toMatchObject({
      state: 'resolved',
      comparison: {
        state: 'comparable',
        basis: 'percentage',
        relation: 'proportionally-equal',
      },
    });
    expect(JSON.stringify(projection)).not.toMatch(/tolerance|epsilon|maximum/u);
  });

  it.each([
    [21, 30, 32, 40, 'proportionally-lower'],
    [27, 30, 32, 40, 'proportionally-higher'],
  ] as const)(
    'ordena maior/menor sem tolerância',
    (points, maximum, referencePoints, referenceMaximum, relation) => {
      expect(
        resolved(operand(1, points, maximum), operand(3, referencePoints, referenceMaximum)),
      ).toMatchObject({
        state: 'resolved',
        comparison: { state: 'comparable', relation },
      });
    },
  );

  it('aceita escala futura somente com compatibilidade cross-profile declarada', () => {
    const futureProfile: PerformanceComparisonProfileRefV2 = {
      profileId: 'evaluation-profile:future',
      profileVersion: '2',
      percentageSemanticsVersion: 'official-percentage:future:v1',
    };
    const compatibility = resolvePerformanceProfileCompatibilityV2({
      current: futureProfile,
      reference: profile2026,
      declarations: [
        {
          current: futureProfile,
          reference: profile2026,
          ruleVersion: 'declared-cross-profile:future-2026:v1',
        },
      ],
    });
    expect(compatibility).toMatchObject({
      state: 'compatible',
      source: 'declared-cross-profile-compatibility',
    });
  });

  it('mantém perfil desconhecido e cobertura ausente fail-closed', () => {
    const unknown = { ...profile2026, percentageSemanticsVersion: 'not-declared' };
    expect(
      resolvePerformanceProfileCompatibilityV2({ current: unknown, reference: unknown }),
    ).toMatchObject({
      state: 'not-compatible',
      reason: 'profile-semantics-not-declared-compatible',
    });
    const projection = resolvePerformanceComparisonProjectionV2({
      selection: { current: { kind: 'term', term: 1 }, reference: { kind: 'term', term: 2 } },
      configuration: DEFAULT_PERFORMANCE_COMPARISON_CONFIGURATION_V1,
      current: null,
      reference: operand(2, 24, 30),
      currentProfile: profile2026,
      referenceProfile: profile2026,
    });
    expect(projection).toMatchObject({
      state: 'resolved',
      comparison: { state: 'not-comparable', reason: 'current-coverage-insufficient-data' },
    });
  });

  it('seleciona uma única configuração vigente, usa o default sem linha e rejeita ambiguidade', () => {
    const disabled: PlatformConfiguration = {
      id: 'configuration:comparison:disabled',
      key: 'gradebook.performance.proportional-comparison',
      scope: 'global',
      version: '2',
      active: false,
      effectiveFrom: '2026-09-01T00:00:00.000Z',
      effectiveUntil: '',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    expect(
      resolveCurrentPerformanceComparisonConfigurationV1([], '2026-09-02T12:00:00.000Z'),
    ).toEqual(DEFAULT_PERFORMANCE_COMPARISON_CONFIGURATION_V1);
    expect(
      resolveCurrentPerformanceComparisonConfigurationV1([disabled], '2026-09-02T12:00:00.000Z'),
    ).toMatchObject({ source: 'platform-configuration', enabled: false, version: '2' });
    expect(() =>
      resolveCurrentPerformanceComparisonConfigurationV1(
        [disabled, { ...disabled, id: 'configuration:comparison:duplicate', version: '3' }],
        '2026-09-02T12:00:00.000Z',
      ),
    ).toThrow('ambiguous-performance-comparison-configuration');
  });
});
