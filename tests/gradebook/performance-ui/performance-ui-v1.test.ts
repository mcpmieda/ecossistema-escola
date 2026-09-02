import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Performance HeroUI local/preview V1', () => {
  const page = source('src/features/gradebook/performance/performance-page.tsx');
  const client = source('src/features/gradebook/performance/performance-client.ts');
  const gate = source('src/features/gradebook/performance/performance-request-gate.ts');

  it('entrega a matriz HeroUI e os cinco estados operacionais explícitos', () => {
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('Matriz da turma');
    expect(page).toContain('<table');
    expect(page).toContain('md:hidden');
    expect(page).toContain('hidden md:block');
    for (const state of ['loading', 'ready', 'empty', 'unavailable', 'not-authorized']) {
      expect(page).toContain(`'${state}'`);
    }
  });

  it('expõe quatro lentes, período explícito e modos regular/recuperação sem cálculo acadêmico local', () => {
    for (const label of ['Resultado', 'Quantitativo', 'Qualitativo', 'Avaliações']) {
      expect(page).toContain(label);
    }
    expect(page).toContain('value="regular"');
    expect(page).toContain('value="recovery"');
    expect(page).toContain('1º trimestre');
    expect(page).toContain('2º trimestre');
    expect(page).toContain('3º trimestre');
    expect(page).toContain('Anual');
    expect(page).toContain('A tela apenas apresenta');
    expect(page).toContain('resultados oficiais; não recalcula notas.');
    expect(page).not.toContain('Math.round');
    expect(page).not.toContain('toFixed(');
    expect(page).not.toContain('0.45');
    expect(page).not.toContain('0.55');
    expect(page).not.toContain('0.6');
  });

  it('apresenta comparação proporcional resolvida no servidor, com referência explícita e sem depender de cor', () => {
    expect(page).toContain('A referência é sempre escolhida explicitamente');
    expect(page).toContain("projection.comparison.state === 'not-comparable'");
    expect(page).toContain('Base: percentual oficial.');
    expect(page).toContain('Período em foco:');
    expect(page).toContain('Referência escolhida:');
    expect(page).toContain('Comparação: {comparisonSummary(cell)}');
    expect(page).toContain('Comparação desativada institucionalmente');
    expect(page).not.toContain('backgroundColor');
    expect(page).not.toContain('tolerance');
  });

  it('pagina linhas e colunas de forma independente e preserva seus cursores separadamente', () => {
    expect(page).toContain('rowHistory');
    expect(page).toContain('columnHistory');
    expect(page).toContain("moveRows('previous')");
    expect(page).toContain("moveRows('next')");
    expect(page).toContain("moveColumns('previous')");
    expect(page).toContain("moveColumns('next')");
    expect(page).toContain('Linhas e colunas são paginadas independentemente.');
  });

  it('carrega detalhe de aluno e célula sob demanda com foco restaurado e sem raw evidence', () => {
    expect(page).toContain('openStudentDetail');
    expect(page).toContain('openCellDetail');
    expect(page).toContain('Detalhe sob demanda');
    expect(page).toContain('detailHeadingRef.current?.focus()');
    expect(page).toContain('lastDetailTriggerRef.current?.focus()');
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('role="dialog"');
    expect(page).not.toContain('officialRecords');
    expect(page).not.toContain('sourceEvidence');
    expect(page).not.toContain('sourceText');
    expect(page).not.toContain('sourceReference');
    expect(client).not.toContain('officialRecords');
  });

  it('usa cancelamento, dedupe e stale-response discard em matriz, contexto e detalhe', () => {
    expect(page).toContain('createPerformanceRequestGateV1');
    expect(page).toContain('ticket.isCurrent()');
    expect(page).toContain('ticket.signal');
    expect(gate).toContain('active?.controller.abort()');
    expect(gate).toContain('active?.key === key');
    expect(gate).toContain('generation === requestGeneration');
    expect(client).toContain('signal,');
    expect(client).toContain("cache: 'no-store'");
  });

  it('mantém teclado, foco, anúncios acessíveis e layout móvel não comprimido', () => {
    expect(page).toContain('onSubmit={(event) =>');
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('role="status"');
    expect(page).toContain('focus-visible:ring-2');
    expect(page).toContain('aria-label="Lente de Desempenho"');
    expect(page).toContain('aria-label="Paginação independente da matriz"');
    expect(page).toContain('md:hidden');
    expect(page).toContain('hidden md:block');
  });

  it('reutiliza o bridge operacional somente para localizar contexto e usa um bridge dedicado para Desempenho', () => {
    expect(page).toContain('requestOperationalWorkspaceV1');
    expect(page).toContain("operation: 'bootstrap'");
    expect(page).toContain("operation: 'search'");
    expect(client).toContain("PERFORMANCE_ENDPOINT_V1 = '/api/gradebook/performance'");
    expect(client).not.toContain('/server/');
  });
});
