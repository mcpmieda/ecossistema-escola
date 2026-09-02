import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração final da onda 17 — PDF canônico + F9', () => {
  it('abre resultados da busca diretamente na área correta sem criar nova rota de plataforma', () => {
    const contract = source('shared/platform-contract.ts');
    const notes = source('src/platform/notes-module.ts');
    const shell = source('src/platform/gradebook-workspace-shell.tsx');

    expect(contract).toContain("value.split(/[?#]/u)[0]");
    for (const area of ['operational', 'audit', 'performance', 'bulletins', 'council']) {
      expect(notes).toContain(`notesAreaHref('${area}')`);
    }
    expect(notes).toContain("platformHref('banco-de-notas')");
    expect(shell).toContain('workspaceSurfaceFromHash');
    expect(shell).toContain("new URLSearchParams(query).get('area')");
    expect(shell).toContain("window.addEventListener('hashchange', onHashChange)");
    expect(shell).toContain('window.history.replaceState');
  });

  it('preserva PDF oficial exclusivamente sobre snapshot canônico e renderer sob demanda', () => {
    const page = source('src/features/gradebook/bulletins/bulletin-page.tsx');
    const actions = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-actions-v1.ts');
    const renderer = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-renderer-v1.ts');

    expect(page).toContain('Baixar PDF oficial');
    expect(page).toContain('Imprimir PDF oficial');
    expect(page).toContain('snapshot && (');
    expect(actions).toContain("await import('./bulletin-pdf-renderer-v1')");
    expect(actions).not.toContain('/api/gradebook/');
    expect(renderer).toContain('BulletinPdfInputV1');
    expect(renderer).not.toMatch(/fetch\(|localStorage|sessionStorage|indexedDB|caches\.open/u);
  });

  it('mantém a rota e as cinco superfícies acadêmicas lazy e isoladas', () => {
    const notesPage = source('src/platform/notes-page.tsx');
    const shell = source('src/platform/gradebook-workspace-shell.tsx');
    const operationalSurface = source('src/platform/gradebook-operational-surface.tsx');

    expect(notesPage).toContain("import('./gradebook-workspace-page')");
    for (const imported of [
      'gradebook-operational-surface',
      'audit-workspace-page',
      'performance-page',
      'bulletin-page',
      'gradebook-council-surface',
    ]) {
      expect(shell).toContain(imported);
    }
    expect(operationalSurface).toContain('operational-workspace-page');
    expect(shell).toContain('class GradebookSurfaceBoundary');
    expect(shell).toContain('role="tablist"');
    expect(shell).toContain('aria-selected={selected}');
  });

  it('mantém exatamente os cinco bridges existentes, auth server-side e no-store', () => {
    const functions = source('functions/[[path]].ts');
    const handlers = [
      ['server/gradebook/http/operational-workspace-routes-v1.ts', '/api/gradebook/operational-workspace'],
      ['server/gradebook/http/audit-workspace-routes-v1.ts', '/api/gradebook/audit-workspace'],
      ['server/gradebook/http/performance-routes-v1.ts', '/api/gradebook/performance'],
      ['server/gradebook/http/bulletin-routes-v1.ts', '/api/gradebook/bulletins'],
      ['server/gradebook/http/council-routes-v1.ts', '/api/gradebook/council-workspace'],
    ] as const;

    for (const [path, endpoint] of handlers) {
      const handler = source(path);
      expect(handler.split(endpoint)).toHaveLength(2);
      expect(handler).toContain('requireAuth');
      expect(handler).toContain('authorizeGradebookD1RuntimeV1');
      expect(handler).toContain('no-store');
    }
    expect(functions.match(/handleOperationalWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handleAuditWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handlePerformanceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handleBulletinRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/createCouncilWorkspaceRequestHandlerV1/gu)).toHaveLength(2);
  });

  it('não introduz persistência acadêmica no navegador nem retry silencioso de writes', () => {
    const frontend = [
      'src/features/gradebook/operational-workspace/operational-workspace-page.tsx',
      'src/features/gradebook/audit-workspace/audit-workspace-page.tsx',
      'src/features/gradebook/performance/performance-page.tsx',
      'src/features/gradebook/bulletins/bulletin-page.tsx',
      'src/features/gradebook/council/council-workspace-page.tsx',
      'src/platform/gradebook-workspace-shell.tsx',
    ]
      .map(source)
      .join('\n');

    expect(frontend).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open/u);
    expect(frontend).not.toMatch(/retryDecision|retryEmit|autoRetry/u);
  });

  it('mantém as invariantes acadêmicas da onda 16 intactas', () => {
    const performance = source(
      'server/gradebook/persistence/d1/performance/d1-class-performance-source-v1.ts',
    );
    const council = source(
      'server/gradebook/application/council/council-official-projection-source-v1.ts',
    );
    const workspace = source('server/gradebook/application/council/council-workspace-v1.ts');

    expect(performance).toContain('comparison-semantics-not-integrated');
    expect(council).toContain('resolveNativeAnnualOutcome');
    expect(council).toContain('record.officialGrade.imported.value');
    expect(workspace).not.toContain('resolveNativeAnnualOutcome');
  });
});
