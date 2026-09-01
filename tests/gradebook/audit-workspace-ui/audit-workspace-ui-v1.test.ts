import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Audit Workspace HeroUI local/preview V1', () => {
  const page = source('src/features/gradebook/audit-workspace/audit-workspace-page.tsx');
  const client = source('src/features/gradebook/audit-workspace/audit-workspace-client.ts');
  const handler = source('server/gradebook/http/audit-workspace-routes-v1.ts');
  const app = source('src/App.tsx');
  const functions = source('functions/[[path]].ts');

  it('usa HeroUI no shell existente e cobre os estados operacionais explícitos', () => {
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('<Surface');
    expect(page).toContain('<Button');
    expect(page).toContain('<Alert');
    expect(page).toContain('<Spinner');
    for (const state of ['loading', 'ready', 'empty', 'unavailable', 'not-authorized']) {
      expect(page).toContain(`'${state}'`);
    }
    expect(app).toContain("./features/gradebook/audit-workspace/audit-workspace-page");
    expect(app).toContain("route === 'banco-de-notas' && <AuditWorkspacePage />");
  });

  it('mantém ano explícito, três coleções, filtros, paginação e detalhe sob demanda', () => {
    expect(page).toContain('Selecione o ano');
    expect(page).toContain('O sistema não escolhe o ano automaticamente.');
    expect(page).toContain('AUDIT_WORKSPACE_COLLECTIONS_V1.map');
    expect(page).toContain('Aplicar filtros');
    expect(page).toContain('Limpar filtros');
    expect(page).toContain('audit-filter-batch-status');
    expect(page).toContain('audit-filter-occurrence-state');
    expect(page).toContain('audit-filter-reconciliation-status');
    expect(page).toContain('Carregar mais');
    expect(page).toContain('O detalhe é carregado somente quando solicitado.');
    expect(page).toContain('requestAuditWorkspaceDetailV1');
  });

  it('reutiliza o catálogo de anos existente sem criar transporte paralelo', () => {
    expect(page).toContain('requestOperationalWorkspaceV1');
    expect(page).toContain("operation: 'bootstrap'");
    expect(client).toContain("const AUDIT_WORKSPACE_ENDPOINT = '/api/gradebook/audit-workspace'");
    expect(client).not.toContain('/server/');
  });

  it('não transporta ator, instante, autorização ou operação de promoção no navegador', () => {
    expect(page).not.toContain('actorId');
    expect(page).not.toContain('occurredAt');
    expect(page).not.toContain('planImportReconciliation');
    expect(page).not.toContain('executeImportChangePlan');
    expect(page).not.toContain('promoteImport');
    expect(page).toContain('Identidade e instante efetivos são definidos pelo servidor.');
    expect(page).toContain('Elegibilidade de promoção — somente informativa');
    expect(page).toContain('Este workspace não executa promoção.');
  });

  it('mantém teclado, foco e anúncios de estado nas ações principais', () => {
    expect(page).toContain('onSubmit={(event) =>');
    expect(page).toContain('detailHeadingRef.current?.focus()');
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('role="status"');
    expect(page).toContain('focus-visible:ring-2');
  });

  it('liga apenas o bridge de Auditoria autorizado e preserva autorização server-side', () => {
    expect(handler).toContain("GRADEBOOK_AUDIT_WORKSPACE_ROUTE_V1 = '/api/gradebook/audit-workspace'");
    expect(handler).toContain('session = await requireAuth(request, env)');
    expect(handler).toContain('authorization = authorizeGradebookD1RuntimeV1(session)');
    expect(handler).toContain('const runtime = createGradebookD1RuntimeV1(env, authorization)');
    expect(handler).toContain('const workspace = runtime.auditWorkspace');
    expect(handler).toContain('actorId: session.oid');
    expect(handler).toContain("'Cache-Control': 'no-store, no-cache, must-revalidate, private'");
    expect(handler).not.toContain('planImportReconciliation');
    expect(handler).not.toContain('executeImportChangePlan');
    expect(functions).toContain('handleAuditWorkspaceRequestV1');
  });
});
