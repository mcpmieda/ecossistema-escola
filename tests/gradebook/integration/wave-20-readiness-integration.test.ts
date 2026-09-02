import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  evaluateGradebookProductionReadinessPreparationV1,
  GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1,
  GRADEBOOK_PRODUCTION_HARD_STOPS_V1,
  GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
} from '../../../server/gradebook/readiness/production-readiness-v1';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração final da onda 20 — readiness F9 inerte', () => {
  it('declara somente preparação para autorização manual e preserva os cinco hard stops', () => {
    const result = evaluateGradebookProductionReadinessPreparationV1({
      authorityMode: 'imported-source',
      productionAcademicRuntimeEnabled: false,
      productionD1BindingPresent: false,
      remoteMigrationsApplied: false,
      realPilotExecuted: false,
      completedEvidence: GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
    });

    expect(result.status).toBe('prepared-for-manual-authorization');
    expect(result.hardStops).toEqual(GRADEBOOK_PRODUCTION_HARD_STOPS_V1);
    expect(result.hardStops).toHaveLength(5);
  });

  it('mantém o plano de smoke futuro declarativo e todos os passos acadêmicos atrás de gate', () => {
    const academicSteps = GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1.filter(
      ({ path }) => path === '/api/gradebook/performance' || path === '/api/gradebook/bulletins',
    );

    expect(academicSteps).toHaveLength(2);
    expect(academicSteps.every(({ prerequisite }) => prerequisite !== null)).toBe(true);
    expect(JSON.stringify(GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1)).not.toContain(
      '/persistence/migrations',
    );
  });

  it('não conecta readiness ao runtime, Functions ou shell', () => {
    const productionRuntime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const functions = source('functions/[[path]].ts');
    const shell = source('src/platform/gradebook-workspace-shell.tsx');

    expect(productionRuntime).not.toContain('production-readiness-v1');
    expect(functions).not.toContain('production-readiness-v1');
    expect(shell).not.toContain('production-readiness-v1');
  });

  it('sincroniza o estado canônico sem ativar produção nem antecipar a #347', () => {
    const projectState = source('docs/gradebook/PROJECT_STATE.yaml');
    const startHere = source('docs/gradebook/COMECE_AQUI.md');

    expect(projectState).toContain('readiness_status: prepared-for-manual-authorization');
    expect(projectState).toContain('academic_authority_mode: imported-source');
    expect(projectState).toContain('production_academic_runtime_enabled: false');
    expect(projectState).toContain('production_d1_binding_present: false');
    expect(projectState).toContain('remote_migration_applied: false');
    expect(projectState).toContain('real_pilot_executed: false');
    expect(projectState).toContain('authority_transition_issue: 347');
    expect(startHere).toContain('readiness está `prepared-for-manual-authorization`');
    expect(startHere).toContain('#347 permanece separada e não autorizada');
  });
});
