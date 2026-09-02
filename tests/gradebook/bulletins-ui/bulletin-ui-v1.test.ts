import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Boletins HeroUI local/preview V1', () => {
  const page = source('src/features/gradebook/bulletins/bulletin-page.tsx');
  const presentation = source('src/features/gradebook/bulletins/bulletin-presentation-v1.ts');
  const pdfActions = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-actions-v1.ts');
  const client = source('src/features/gradebook/bulletins/bulletin-client.ts');
  const service = source('server/gradebook/application/bulletins/bulletin-workspace-service-v1.ts');
  const app = source('src/App.tsx');
  const shell = source('src/platform/gradebook-workspace-shell.tsx');
  const functions = source('functions/[[path]].ts');

  it('mantém seleção explícita de ano, turma, aluno(s), período e os três modelos', () => {
    expect(page).toContain('Selecione o ano');
    expect(page).toContain('O sistema não escolhe o ano automaticamente.');
    expect(page).toContain('Selecione a turma');
    expect(page).toContain('Aluno(s)');
    expect(page).toContain('1º trimestre');
    expect(page).toContain('Anual');
    expect(page).toContain('BULLETIN_MODEL_KINDS_V1.map');
    expect(presentation).toContain("model === 'synthetic'");
    expect(presentation).toContain("model === 'composition'");
    expect(page).toContain("model.modelKind !== 'synthetic'");
    expect(page).toContain("'assessments' in term");
  });

  it('renderiza a prévia somente do BulletinModelV1 canônico e preserva imported/calculated e estados sem recalcular', () => {
    expect(service).toContain('emission.materialize(request.request, context)');
    expect(service).toContain('Preview consumes the exact canonical BulletinModelV1');
    expect(page).toContain('BulletinModelPreview');
    expect(page).toContain('Importado');
    expect(page).toContain('Calculado');
    expect(presentation).toContain('Ausente');
    expect(presentation).toContain('zero oficial');
    expect(presentation).toContain('zero legado');
    expect(presentation).toContain('Não aplicável');
    expect(presentation).toContain('Dados insuficientes');
    expect(page).toContain('term.quantitative.original');
    expect(page).toContain('term.quantitative.parallelRecoveryApplicability');
    expect(page).toContain('annualResult.academicState');
    expect(page).not.toContain('maximum *');
    expect(page).not.toContain('cutoff');
    expect(page).not.toContain('formula');
  });

  it('expõe emissão individual, lote com resultados isolados, histórico, versão e reimpressão', () => {
    expect(page).toContain('Emitir individual');
    expect(page).toContain('Emitir lote');
    expect(page).toContain('Cada aluno conserva seu próprio resultado.');
    expect(page).toContain('snapshotVersion');
    expect(page).toContain('modelVersion');
    expect(page).toContain('Reimprimir esta versão');
    expect(page).toContain("operation: 'history'");
    expect(page).toContain("operation: 'reprint'");
  });

  it('cobre loading/ready/empty/unavailable/not-authorized, teclado, foco, anúncios e layout responsivo/P&B', () => {
    expect(page).toContain("type ViewState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized'");
    expect(page).toContain("type PdfState = 'idle' | 'loading' | 'success' | 'error'");
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('role="status"');
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('artifactHeadingRef.current?.focus()');
    expect(page).toContain('pdfFeedbackRef.current?.focus()');
    expect(page).toContain('focus-visible:ring-2');
    expect(page).toContain('sm:grid-cols');
    expect(page).toContain('lg:grid-cols');
    expect(page).toContain('border border-border');
    expect(page).toContain('Pronto · item');
    expect(page).toContain('bloqueada(s)/insuficiente(s)');
  });

  it('usa HeroUI e está ligado ao shell lazy F9 sem criar novo bridge', () => {
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('<Surface');
    expect(page).toContain('<Card');
    expect(page).toContain('<Button');
    expect(page).toContain('<Alert');
    expect(client).toContain("const BULLETIN_ENDPOINT = '/api/gradebook/bulletins'");
    expect(app).not.toContain('BulletinPage');
    expect(shell).toContain("import('../features/gradebook/bulletins/bulletin-page')");
    expect(functions.match(/handleBulletinRequestV1/gu)).toHaveLength(2);
  });

  it('oferece PDF oficial somente para snapshot, com lazy loading e fallback sem segundo bridge', () => {
    expect(page).toContain('Baixar PDF oficial');
    expect(page).toContain('Imprimir PDF oficial');
    expect(page).toContain('PDF canônico sob demanda');
    expect(page).toContain('Falha de PDF não remove a visualização do boletim');
    expect(page).toContain('snapshot && (');
    expect(pdfActions).toContain("await import('./bulletin-pdf-renderer-v1')");
    expect(pdfActions).not.toContain('/api/gradebook/');
    expect(page).not.toContain('PDF/renderização pendente por decisão arquitetural');
  });
});
