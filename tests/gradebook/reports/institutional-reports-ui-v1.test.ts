import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Institutional reports HeroUI V1', () => {
  it('mantém uma experiência HeroUI única com contexto e filtros explícitos', () => {
    const page = source('src/features/gradebook/reports/institutional-reports-page.tsx');
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('Ano acadêmico');
    expect(page).toContain('Família do relatório');
    expect(page).toContain('Pesquisar turma');
    expect(page).toContain('Período');
    expect(page).toContain('Comparação oficial');
    expect(page).toContain('Lente');
    expect(page).toContain('Coleção');
    expect(page).toContain('Filtro de estado oficial');
    for (const family of ['Resultados oficiais por turma', 'Composição', 'Recuperação', 'Conselho', 'Auditoria']) {
      expect(page).toContain(family);
    }
  });

  it('preserva estados acadêmicos e mantém indicadores derivados fail-closed', () => {
    const page = source('src/features/gradebook/reports/institutional-reports-page.tsx');
    expect(page).toContain("case 'official-zero'");
    expect(page).toContain('0 (zero oficial)');
    expect(page).toContain("case 'absent'");
    expect(page).toContain('Ausente');
    expect(page).toContain('Comparação não disponível:');
    expect(page).toContain('Média, taxa e ranking não possuem semântica oficial integrada');
    expect(page).toContain('nenhum valor substituto é calculado');
    expect(page).not.toMatch(/failedComponentCount\s*[+*/-]/u);
  });

  it('não abre detalhes de Performance, Conselho ou Auditoria para montar relatórios', () => {
    const page = source('src/features/gradebook/reports/institutional-reports-page.tsx');
    expect(page).not.toContain('requestPerformanceStudentDetailV1');
    expect(page).not.toContain('requestPerformanceCellDetailV1');
    expect(page).not.toContain('requestCouncilStudentV1');
    expect(page).not.toContain('requestCouncilDecisionV1');
    expect(page).not.toContain('requestAuditWorkspaceDetailV1');
    expect(page).not.toContain('requestAuditWorkspaceResolutionV1');
    expect(page).toContain('requestInstitutionalReportV1');
  });

  it('oferece teclado/foco, regiões vivas e apresentação mobile sem persistência no navegador', () => {
    const page = source('src/features/gradebook/reports/institutional-reports-page.tsx');
    const client = source('src/features/gradebook/reports/institutional-reports-client.ts');
    const combined = `${page}\n${client}`;
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('focus-visible:ring-2');
    expect(page).toContain('focus-within:ring-2');
    expect(page).toContain('hidden md:block');
    expect(page).toContain('md:hidden');
    expect(page).toContain('type="checkbox"');
    expect(client).toContain("cache: 'no-store'");
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'caches.open']) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it('mantém batch histórico bounded e fallback legível quando renderer falha', () => {
    const page = source('src/features/gradebook/reports/institutional-reports-page.tsx');
    const batch = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-batch-actions-v1.ts');
    expect(page).toContain('Reimpressão PDF em lote — somente snapshots históricos');
    expect(page).toContain('Carregar snapshots históricos');
    expect(page).toContain('downloadHistoricalBulletinPdfBatchV1');
    expect(page).toContain('Os snapshots históricos continuam listados e legíveis');
    expect(batch).toContain('maxDocuments: 3');
    expect(batch).toContain('maxTotalPages: 72');
    expect(batch).toContain('maxTotalOutputBytes: 36 * 1024 * 1024');
    expect(batch).toContain('concurrentDocuments: 1');
    expect(batch).not.toContain("from './bulletin-pdf-renderer-v1'");
  });
});
