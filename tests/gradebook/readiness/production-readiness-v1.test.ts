import { describe, expect, it } from 'vitest';

import {
  evaluateGradebookProductionReadinessPreparationV1,
  GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1,
  GRADEBOOK_PRODUCTION_HARD_STOPS_V1,
  GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
  GRADEBOOK_SYNTHETIC_READINESS_SCENARIOS_V1,
} from '../../../server/gradebook/readiness/production-readiness-v1';

const inertState = {
  authorityMode: 'imported-source',
  productionAcademicRuntimeEnabled: false,
  productionD1BindingPresent: false,
  remoteMigrationsApplied: false,
  realPilotExecuted: false,
} as const;

describe('F9 production readiness V1', () => {
  it('declara preparação completa sem remover nenhum hard stop produtivo', () => {
    expect(
      evaluateGradebookProductionReadinessPreparationV1({
        ...inertState,
        completedEvidence: GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
      }),
    ).toEqual({
      status: 'prepared-for-manual-authorization',
      missingEvidence: [],
      scopeViolations: [],
      hardStops: GRADEBOOK_PRODUCTION_HARD_STOPS_V1,
    });
  });

  it('permanece incompleta quando uma evidência preparatória está ausente', () => {
    const result = evaluateGradebookProductionReadinessPreparationV1({
      ...inertState,
      completedEvidence: GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1.filter(
        (evidence) => evidence !== 'rollback-recovery-rehearsal',
      ),
    });

    expect(result).toMatchObject({
      status: 'incomplete',
      missingEvidence: ['rollback-recovery-rehearsal'],
      scopeViolations: [],
    });
  });

  it.each([
    ['authority-mode-changed', { authorityMode: 'native-engine' }],
    ['production-academic-runtime-enabled', { productionAcademicRuntimeEnabled: true }],
    ['production-d1-binding-present', { productionD1BindingPresent: true }],
    ['remote-migrations-applied', { remoteMigrationsApplied: true }],
    ['real-pilot-executed', { realPilotExecuted: true }],
  ] as const)('trata %s como violação de escopo, nunca como readiness', (violation, change) => {
    const result = evaluateGradebookProductionReadinessPreparationV1({
      ...inertState,
      ...change,
      completedEvidence: GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
    });

    expect(result.status).toBe('scope-violation');
    expect(result.scopeViolations).toContain(violation);
    expect(result.hardStops).toEqual(GRADEBOOK_PRODUCTION_HARD_STOPS_V1);
  });

  it('mantém catálogo bounded de ensaios sintéticos e não inventa regra acadêmica', () => {
    expect(GRADEBOOK_SYNTHETIC_READINESS_SCENARIOS_V1.map(({ id }) => id)).toEqual([
      'bounded-import-batch',
      'local-schema-replay',
      'durable-bulletin-history',
      'durable-council-queue',
      'production-fail-closed',
    ]);
    expect(JSON.stringify(GRADEBOOK_SYNTHETIC_READINESS_SCENARIOS_V1)).not.toMatch(
      /average|ranking|tolerance|retention|native-engine/u,
    );
  });

  it('prepara smokes futuros como dados, sem executor de rede ou migration remota', () => {
    expect(GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1).toHaveLength(5);
    expect(GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1).toContainEqual(
      expect.objectContaining({
        id: 'unauthenticated-non-disclosure',
        dataProfile: 'none',
        prerequisite: null,
      }),
    );
    expect(
      GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1.filter(
        ({ dataProfile }) => dataProfile !== 'none',
      ).every(({ prerequisite }) => prerequisite !== null),
    ).toBe(true);
    expect(JSON.stringify(GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1)).not.toContain(
      '/persistence/migrations',
    );
  });
});
