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

  it('compõe somente Auditoria no runtime físico e preserva o único bridge do Operational Workspace', () => {
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const functions = source('functions/[[path]].ts');

    expect(runtime).toContain('createAuditWorkspaceV1');
    expect(runtime).toContain('GradebookD1AuditWorkspaceSourceV1');
    expect(runtime).toContain('requireGradebookD1RuntimeAuthorizationV1(this.authorization)');
    expect(runtime).not.toContain('createClassPerformanceReadModelV1');
    expect(runtime).not.toContain('createBulletinEmissionServiceV1');

    expect(functions).toContain('handleOperationalWorkspaceRequestV1');
    expect(functions).not.toContain('audit-workspace-routes');
    expect(functions).not.toContain('class-performance');
    expect(functions).not.toContain('bulletin');
  });

  it('não cria uma segunda rota operacional nem expõe Auditoria, Desempenho ou Boletins por HTTP', () => {
    const operationalRoute = source('server/gradebook/http/operational-workspace-routes-v1.ts');
    const functions = source('functions/[[path]].ts');

    expect(operationalRoute).toContain("'/api/gradebook/operational-workspace'");
    expect(functions.match(/handleOperationalWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions).not.toMatch(/audit.*workspace.*request/iu);
    expect(functions).not.toMatch(/performance.*request/iu);
    expect(functions).not.toMatch(/bulletin.*request/iu);
  });
});
