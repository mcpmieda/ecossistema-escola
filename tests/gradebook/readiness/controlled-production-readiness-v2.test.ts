import { describe, expect, it } from 'vitest';

import {
  evaluateGradebookControlledProductionReadinessV2,
  GRADEBOOK_CONTROLLED_PRODUCTION_STATUS_V2,
  GRADEBOOK_POST_WAVE_23_HARD_STOPS_V2,
  type GradebookControlledProductionReadinessInputV2,
} from '../../../server/gradebook/readiness/controlled-production-readiness-v2';
import {
  evaluateGradebookProductionReadinessPreparationV1,
  GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
} from '../../../server/gradebook/readiness/production-readiness-v1';

function wave23State(
  overrides: Partial<GradebookControlledProductionReadinessInputV2> = {},
): GradebookControlledProductionReadinessInputV2 {
  return {
    authorityMode: 'imported-source',
    productionD1ResourcePresent: true,
    productionD1BindingPresent: true,
    remoteMigrationsApplied: 4,
    schemaVersion: 4,
    tableCount: 25,
    pendingMigrations: 0,
    productionSyntheticSmokeCompleted: true,
    syntheticResidueCount: 0,
    recoveryCapabilityConfirmed: true,
    productionAcademicRuntimeEnabled: false,
    realPilotExecuted: false,
    nativeAuthorityEnabled: false,
    ...overrides,
  };
}

describe('controlled production readiness V2', () => {
  it('representa a onda 23 fechada sem confundir infraestrutura validada com piloto', () => {
    expect(evaluateGradebookControlledProductionReadinessV2(wave23State())).toEqual({
      version: 2,
      status: GRADEBOOK_CONTROLLED_PRODUCTION_STATUS_V2,
      missingEvidence: [],
      scopeViolations: [],
      hardStops: GRADEBOOK_POST_WAVE_23_HARD_STOPS_V2,
    });
    expect(GRADEBOOK_POST_WAVE_23_HARD_STOPS_V2).toEqual([
      'private-real-pilot-authorization',
      'native-authority-separate-authorization',
    ]);
  });

  it('permanece incompleto enquanto recurso, binding, smoke ou recovery não forem confirmados', () => {
    expect(
      evaluateGradebookControlledProductionReadinessV2(
        wave23State({
          productionD1ResourcePresent: false,
          productionD1BindingPresent: false,
          remoteMigrationsApplied: 0,
          schemaVersion: 0,
          tableCount: 0,
          productionSyntheticSmokeCompleted: false,
          recoveryCapabilityConfirmed: false,
        }),
      ),
    ).toMatchObject({
      status: 'incomplete',
      missingEvidence: [
        'production-resource-confirmed',
        'production-binding-confirmed',
        'remote-schema-v4-25-confirmed',
        'production-synthetic-smoke-confirmed',
        'recovery-capability-confirmed',
      ],
      scopeViolations: [],
    });
  });

  it('falha fechado se o gate ficar aberto, piloto real ocorrer ou autoridade mudar', () => {
    expect(
      evaluateGradebookControlledProductionReadinessV2(
        wave23State({
          productionAcademicRuntimeEnabled: true,
          realPilotExecuted: true,
          authorityMode: 'native-engine',
          nativeAuthorityEnabled: true,
        }),
      ),
    ).toMatchObject({
      status: 'scope-violation',
      scopeViolations: [
        'authority-mode-changed',
        'production-gate-left-open',
        'real-pilot-already-executed',
        'native-authority-enabled',
      ],
    });
  });

  it('trata schema remoto divergente e resíduo sintético como hard stop de estado', () => {
    expect(
      evaluateGradebookControlledProductionReadinessV2(
        wave23State({ tableCount: 24, pendingMigrations: 1, syntheticResidueCount: 1 }),
      ),
    ).toMatchObject({
      status: 'scope-violation',
      scopeViolations: ['synthetic-residue-present', 'remote-schema-contract-mismatch'],
    });
  });

  it('preserva o V1 histórico: binding/migration continuam scope-violation na preparação antiga', () => {
    expect(
      evaluateGradebookProductionReadinessPreparationV1({
        authorityMode: 'imported-source',
        productionAcademicRuntimeEnabled: false,
        productionD1BindingPresent: true,
        remoteMigrationsApplied: true,
        realPilotExecuted: false,
        completedEvidence: GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
      }),
    ).toMatchObject({
      status: 'scope-violation',
      scopeViolations: ['production-d1-binding-present', 'remote-migrations-applied'],
    });
  });
});
