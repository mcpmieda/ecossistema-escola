import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Council Workspace HeroUI V1', () => {
  const page = source('src/features/gradebook/council/council-workspace-page.tsx');
  const client = source('src/features/gradebook/council/council-workspace-client.ts');
  const handler = source('server/gradebook/http/council-routes-v1.ts');
  const app = source('src/App.tsx');
  const functions = source('functions/[[path]].ts');

  it('usa HeroUI em componente isolado e mantém wiring central reservado à #328', () => {
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('<Surface');
    expect(page).toContain('<Card');
    expect(page).toContain('<Button');
    expect(page).toContain('<Alert');
    expect(page).toContain('<Spinner');
    expect(app).not.toContain('council-workspace-page');
    expect(functions).not.toContain('handleCouncilWorkspaceRequestV1');
  });

  it('mantém fila compacta, aluno em foco e resumo anual T1/T2/T3/REC antes das evidências', () => {
    expect(page.indexOf('Fila da turma')).toBeGreaterThan(-1);
    expect(page).toContain('Aluno ${response.detail.studentLabel} em foco.');
    expect(page).toContain('Visão anual — T1, T2, T3 e REC');
    expect(page).toContain('Esta tela não recalcula nota, recuperação ou elegibilidade.');
    expect(page.indexOf('<AnnualOverview detail={detail} />')).toBeLessThan(
      page.indexOf('<EvidenceDetails detail={detail} />'),
    );
    expect(page).toContain('requestCouncilStudentV1');
    expect(page).toContain('A fila mantém o aluno principal em foco sem abrir detalhes em lote.');
  });

  it('distingue estado calculado, decisão humana, justificativa, histórico e conflito de versão', () => {
    expect(page).toContain('Decisão humana separada do cálculo');
    expect(page).toContain('Justificativa obrigatória');
    expect(page).toContain('Histórico versionado');
    expect(page).toContain('Conflito de versão');
    expect(page).toContain('expectedVersion: {detail.version}');
    expect(page).toContain("detail.calculated.queueState !== 'eligible-for-council'");
    expect(page).toContain('Só existe depois de registro explícito.');
    expect(page).toContain('Uma edição cria nova versão e exige nova justificativa');
  });

  it('mantém teclado, foco, aria-live e sinal textual além de cor', () => {
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('role="status"');
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('headingRef.current?.focus()');
    expect(page).toContain('conflictRef.current?.focus()');
    expect(page).toContain('focus-visible:ring-2');
    expect(page).toContain('aria-pressed={decisionChoice');
    expect(page).toContain('Elegível para Conselho');
    expect(page).toContain('Não elegível para Conselho');
    expect(page).toContain('Dados insuficientes');
  });

  it('é responsivo para celular sem comprimir um layout fixo de desktop', () => {
    expect(page).toContain('sm:flex-row');
    expect(page).toContain('sm:grid-cols-2');
    expect(page).toContain('lg:grid-cols-[minmax(15rem,0.34fr)_minmax(0,1fr)]');
    expect(page).toContain('min-w-0');
    expect(page).not.toContain('min-w-[1024px]');
    expect(page).not.toContain('w-[1200px]');
  });

  it('não persiste dados acadêmicos no navegador e usa fetch no-store', () => {
    expect(client).toContain("const COUNCIL_WORKSPACE_ENDPOINT = '/api/gradebook/council-workspace'");
    expect(client).toContain("cache: 'no-store'");
    expect(client).not.toContain('localStorage');
    expect(client).not.toContain('sessionStorage');
    expect(client).not.toContain('indexedDB');
    expect(client).not.toContain('caches.open');
  });

  it('expõe explicitamente os limites sem oferecer votação, desempate, frequência ou participantes', () => {
    expect(page).toContain('Não possui votação,');
    expect(page).toContain('desempate, regra automática de frequência, participantes nominais');
    expect(page).not.toContain('name="vote');
    expect(page).not.toContain('name="attendance');
    expect(page).not.toContain('name="participant');
  });

  it('preserva auth/no-store e fail-closed no handler isolado', () => {
    expect(handler).toContain("GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1 = '/api/gradebook/council-workspace'");
    expect(handler).toContain('session = await requireAuth(request, env)');
    expect(handler).toContain('authorizeGradebookD1RuntimeV1(session)');
    expect(handler).toContain("env.RUNTIME_ENVIRONMENT === 'production'");
    expect(handler).toContain("'Cache-Control': 'no-store, no-cache, must-revalidate, private'");
    expect(handler).toContain('actorReference: session.oid');
    expect(handler).toContain('decidedAt: now().toISOString()');
    expect(handler).toContain('createWorkspace: () => null');
  });
});
