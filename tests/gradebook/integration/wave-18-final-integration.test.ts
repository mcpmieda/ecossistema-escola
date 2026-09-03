import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração final da onda 18 — durabilidade, Conselho V2 e relatórios', () => {
  it('compõe a durabilidade D1 sem manter snapshots/decisões process-local no runtime central', () => {
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const bulletin = source('server/gradebook/http/bulletin-routes-v1.ts');

    expect(runtime).toContain('createGradebookD1BulletinCouncilDurabilityV1');
    expect(runtime).toContain('bulletinSnapshotRepository()');
    expect(runtime).toContain('councilDecisionStore()');
    expect(runtime).toContain('decisions: this.durability.councilDecisions');
    expect(runtime).not.toContain('createLocalCouncilDecisionStoreV1');
    expect(bulletin).toContain('snapshots: runtime.bulletinSnapshotRepository()');
    expect(bulletin).toContain('crypto.randomUUID()');
    expect(bulletin).not.toContain('createLocalBulletinSnapshotRepositoryV1');
  });

  it('monta Conselho V2 no mesmo bridge, sem inventar identidade de diretor', () => {
    const functions = source('functions/[[path]].ts');
    const route = source('server/gradebook/http/council-routes-v1.ts');
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const surface = source('src/platform/gradebook-council-surface.tsx');

    expect(functions).toContain('createInstitutionalWorkspace(runtimeEnv, server)');
    expect(functions).toContain('.councilInstitutionalWorkspace(');
    expect(route.split('/api/gradebook/council-workspace')).toHaveLength(2);
    expect(runtime).toContain('createCouncilInstitutionalWorkspaceV2');
    expect(surface).toContain('CouncilInstitutionalPanelV2');
    expect(route).toContain('tie-break');
    expect(route).not.toContain('ADMINISTRADOR == diretor');
    expect(route).not.toContain('directorRole');
  });

  it('expõe um único bridge e uma superfície lazy de Relatórios', () => {
    const functions = source('functions/[[path]].ts');
    const route = source('server/gradebook/http/institutional-reports-routes-v1.ts');
    const shell = source('src/platform/gradebook-workspace-shell.tsx');
    const notes = source('src/platform/notes-module.ts');

    expect(route.split('/api/gradebook/reports')).toHaveLength(2);
    expect(functions.match(/handleInstitutionalReportsRequestV1/gu)).toHaveLength(2);
    expect(shell).toContain("id: 'reports'");
    expect(shell).toContain("import('../features/gradebook/reports/institutional-reports-page')");
    expect(notes).toContain("notesAreaHref('reports')");
  });

  it('preserva fail-closed analítico e limites bounded dos artefatos', () => {
    const reports = source('server/gradebook/application/reports/institutional-reports-service-v1.ts');
    const contract = source('shared/gradebook-contracts/reports/institutional-reports-contract-v1.ts');
    const batch = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-batch-actions-v1.ts');

    expect(reports).toContain('INSTITUTIONAL_REPORT_DERIVED_INDICATORS_HARD_STOP_V1');
    expect(contract).toContain('official-semantics-not-integrated');
    expect(contract).toContain('derived-academic-indicators');
    expect(batch).toContain('maxDocuments: 3');
    expect(batch).toContain('maxTotalPages: 72');
    expect(batch).toContain('concurrentDocuments: 1');
    expect(batch).not.toContain('Promise.all');
    expect(batch).toContain("result.source !== 'historical-snapshot'");
  });

  it('mantém produção e autoridade acadêmica fechadas na onda 18', () => {
    const councilRoute = source('server/gradebook/http/council-routes-v1.ts');
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const reportsRoute = source('server/gradebook/http/institutional-reports-routes-v1.ts');
    const context = source('docs/gradebook/ACADEMIC_CONTEXT.md');

    expect(councilRoute).not.toContain("env.RUNTIME_ENVIRONMENT === 'production'");
    expect(runtime).toContain("env.GRADEBOOK_PRODUCTION_ENABLED !== 'true'");
    expect(reportsRoute).toContain('createGradebookD1RuntimeV1');
    expect(context).toContain('authorityMode: imported-source');
    expect(context).not.toContain('authorityMode: native-engine');
  });

  it('não introduz storage acadêmico persistente no navegador nas novas superfícies', () => {
    const frontend = [
      'src/features/gradebook/reports/institutional-reports-page.tsx',
      'src/features/gradebook/reports/institutional-reports-client.ts',
      'src/features/gradebook/council/council-institutional-panel-v2.tsx',
      'src/features/gradebook/council/council-institutional-client-v2.ts',
      'src/platform/gradebook-council-surface.tsx',
      'src/platform/gradebook-workspace-shell.tsx',
    ]
      .map(source)
      .join('\n');

    expect(frontend).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open/u);
  });
});
