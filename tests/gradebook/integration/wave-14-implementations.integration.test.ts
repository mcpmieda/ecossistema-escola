import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BULLETIN_AUTHORITY_MODE_V1 } from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import { PERFORMANCE_AUTHORITY_MODE_V1 } from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import { createAuditWorkspaceV1 } from '../../../server/gradebook/application/audit-workspace/audit-workspace-v1';
import { createBulletinEmissionServiceV1 } from '../../../server/gradebook/application/bulletins/bulletin-emission-service-v1';
import { createClassPerformanceReadModelV1 } from '../../../server/gradebook/application/read-models/performance/class-performance-read-model-v1';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração da onda 14 F4/F5/F6/F8', () => {
  it('mantém as implementações provider-independent disponíveis com autoridade imported-source', () => {
    expect(createAuditWorkspaceV1).toBeTypeOf('function');
    expect(createClassPerformanceReadModelV1).toBeTypeOf('function');
    expect(createBulletinEmissionServiceV1).toBeTypeOf('function');
    expect(PERFORMANCE_AUTHORITY_MODE_V1).toBe('imported-source');
    expect(BULLETIN_AUTHORITY_MODE_V1).toBe('imported-source');
  });

  it('compõe Auditoria e Desempenho no runtime físico e preserva os bridges autorizados sem nova autoridade', () => {
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const runtimeAuthorization = source(
      'server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1.ts',
    );
    const capabilities = source('server/auth/capabilities.ts');
    const functions = source('functions/[[path]].ts');
    const auditRoute = source('server/gradebook/http/audit-workspace-routes-v1.ts');

    expect(runtime).toContain('createAuditWorkspaceV1');
    expect(runtime).toContain('GradebookD1AuditWorkspaceSourceV1');
    expect(runtime).toContain('createClassPerformanceReadModelV1');
    expect(runtime).toContain('createGradebookD1ClassPerformanceSourceV1');
    expect(runtime).toContain('requireGradebookD1RuntimeAuthorizationV1(this.authorization)');
    expect(runtime).not.toContain('createBulletinEmissionServiceV1');

    expect(functions.match(/handleOperationalWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handleAuditWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions).not.toMatch(/performance.*request/iu);
    expect(functions).not.toMatch(/bulletin.*request/iu);
    expect(auditRoute.match(/'\/api\/gradebook\/audit-workspace'/gu)).toHaveLength(1);
    expect(auditRoute.match(/request\.method !== 'POST'/gu)).toHaveLength(1);
    expect(auditRoute).toContain('authorizeGradebookD1RuntimeV1');
    expect(auditRoute).not.toContain('requireCapability');
    expect(runtimeAuthorization.match(/gradebook\.persistence\.admin/gu)).toHaveLength(1);
    expect(capabilities.match(/'gradebook\.persistence\.admin'/gu)).toHaveLength(1);
  });

  it('mantém um único bridge operacional, Auditoria local/preview e produção fail-closed', () => {
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const operationalRoute = source('server/gradebook/http/operational-workspace-routes-v1.ts');
    const auditRoute = source('server/gradebook/http/audit-workspace-routes-v1.ts');
    const functions = source('functions/[[path]].ts');

    expect(operationalRoute.match(/'\/api\/gradebook\/operational-workspace'/gu)).toHaveLength(1);
    expect(operationalRoute.match(/request\.method !== 'POST'/gu)).toHaveLength(1);
    expect(functions.match(/handleOperationalWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(auditRoute.match(/'\/api\/gradebook\/audit-workspace'/gu)).toHaveLength(1);
    expect(auditRoute.match(/request\.method !== 'POST'/gu)).toHaveLength(1);
    expect(functions.match(/handleAuditWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions).not.toMatch(/performance.*request/iu);
    expect(functions).not.toMatch(/bulletin.*request/iu);
    expect(functions).not.toMatch(/bulletin.*pdf|pdf.*bulletin/iu);

    const environmentGate = runtime.indexOf('const environment = runtimeEnvironment(env);');
    const bindingAccess = runtime.indexOf('const database = requireDatabase(env.GRADEBOOK_D1);');
    expect(environmentGate).toBeGreaterThanOrEqual(0);
    expect(bindingAccess).toBeGreaterThan(environmentGate);
  });
});
