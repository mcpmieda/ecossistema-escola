import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('superfície aposentada do Audit Workspace V1', () => {
  const removedPaths = [
    'server/gradebook/http/audit-workspace-routes-v1.ts',
    'src/features/gradebook/audit-workspace/audit-workspace-page.tsx',
    'src/features/gradebook/audit-workspace/audit-workspace-client.ts',
    'src/features/gradebook/audit-workspace/import-diagnostics-audit-panel-v1.tsx',
  ] as const;

  it('não mantém entrypoint HTTP ou módulos de interface sem consumidores', () => {
    for (const path of removedPaths) expect(existsSync(join(root, path)), path).toBe(false);

    const functions = source('functions/[[path]].ts');
    expect(functions).not.toContain('handleAuditWorkspaceRequestV1');
    expect(functions).not.toContain('/api/gradebook/audit-workspace');
  });

  it('mantém a Auditoria Atual V2 como única superfície montada', () => {
    const surface = source(
      'src/features/gradebook/audit-workspace/gradebook-audit-surface.tsx',
    );
    const page = source(
      'src/features/gradebook/audit-workspace/relational-current-audit-page-v2.tsx',
    );
    const client = source(
      'src/features/gradebook/import/import-diagnostics-client-v1.ts',
    );

    expect(surface).toContain('<RelationalCurrentAuditPageV2 />');
    expect(surface).not.toContain('AuditWorkspacePage');
    expect(surface).not.toContain('ImportDiagnosticsAuditPanelV1');
    expect(page).toContain('listGradebookImportDiagnosticsAuditV1');
    expect(client).toContain('/api/gradebook/import-diagnostics');
    expect(client).toContain("cache: 'no-store'");
  });

  it('preserva o núcleo histórico ainda consumido por Relatórios V1', () => {
    const reports = source('server/gradebook/http/institutional-reports-routes-v1.ts');
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');

    expect(reports).toContain('audit: runtime.auditWorkspace({');
    expect(runtime).toContain('createAuditWorkspaceV1');
    expect(runtime).toContain('GradebookD1AuditWorkspaceSourceV1');
  });
});
