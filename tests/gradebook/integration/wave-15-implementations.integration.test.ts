import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BULLETIN_AUTHORITY_MODE_V1 } from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import { PERFORMANCE_AUTHORITY_MODE_V1 } from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração da onda 15 F4/F5/F6/F8', () => {
  it('preserva os dois bridges autorizados e não expõe Desempenho ou Boletins por HTTP', () => {
    const functions = source('functions/[[path]].ts');
    const auditRoute = source('server/gradebook/http/audit-workspace-routes-v1.ts');
    const operationalRoute = source('server/gradebook/http/operational-workspace-routes-v1.ts');

    expect(auditRoute.match(/'\/api\/gradebook\/audit-workspace'/gu)).toHaveLength(1);
    expect(operationalRoute.match(/'\/api\/gradebook\/operational-workspace'/gu)).toHaveLength(1);
    expect(functions.match(/handleAuditWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handleOperationalWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions).not.toMatch(/performance.*request/iu);
    expect(functions).not.toMatch(/bulletin.*request/iu);
    expect(functions).not.toMatch(/bulletin.*pdf|pdf.*bulletin/iu);
  });

  it('compõe Desempenho apenas no runtime interno e preserva a autoridade imported-source', () => {
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const performanceSource = source(
      'server/gradebook/persistence/d1/performance/d1-class-performance-source-v1.ts',
    );

    expect(runtime).toContain('createGradebookD1ClassPerformanceSourceV1');
    expect(runtime).toContain('createClassPerformanceReadModelV1');
    expect(runtime).toContain('classPerformanceReadModel()');
    expect(runtime).toContain('requireGradebookD1RuntimeAuthorizationV1(this.authorization)');
    expect(runtime).not.toContain('createBulletinEmissionServiceV1');
    expect(performanceSource).toContain("reason: 'comparison-semantics-not-integrated'");
    expect(performanceSource).toContain("reasons: ['official-projection-unavailable']");
    expect(PERFORMANCE_AUTHORITY_MODE_V1).toBe('imported-source');
    expect(BULLETIN_AUTHORITY_MODE_V1).toBe('imported-source');
  });

  it('preserva hardening de Boletins e Operational Workspace sem alterar seus limites físicos', () => {
    const materializer = source(
      'server/gradebook/application/bulletins/bulletin-model-materializer-v1.ts',
    );
    const snapshots = source(
      'server/gradebook/application/bulletins/bulletin-snapshot-repository-v1.ts',
    );
    const operationalPage = source(
      'src/features/gradebook/operational-workspace/operational-workspace-page.tsx',
    );
    const operationalGate = source(
      'src/features/gradebook/operational-workspace/operational-workspace-request-gate.ts',
    );

    expect(materializer).toContain('materializeBatch');
    expect(materializer).toContain('classGroups = new Map');
    expect(snapshots).toContain('cloneSnapshot');
    expect(snapshots).toContain('freezeBulletinSnapshotV1(cloneSnapshot(candidate))');
    expect(operationalPage).toContain('createOperationalWorkspaceRequestGate');
    expect(operationalPage).toContain('ticket.isCurrent()');
    expect(operationalGate).toContain('active?.controller.abort()');
  });

  it('mantém produção acadêmica fail-closed antes do binding', () => {
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const environmentGate = runtime.indexOf('const environment = runtimeEnvironment(env);');
    const bindingAccess = runtime.indexOf('const database = requireDatabase(env.GRADEBOOK_D1);');

    expect(environmentGate).toBeGreaterThanOrEqual(0);
    expect(bindingAccess).toBeGreaterThan(environmentGate);
  });
});
