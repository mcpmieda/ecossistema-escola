import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Boletins HeroUI local/preview V1', () => {
  const page = source('src/features/gradebook/bulletins/bulletin-page.tsx');
  const client = source('src/features/gradebook/bulletins/bulletin-client.ts');
  const service = source('server/gradebook/application/bulletins/bulletin-workspace-service-v1.ts');
  const app = source('src/App.tsx');
  const functions = source('functions/[[path]].ts');

  it('mantém seleção explícita de ano, turma, aluno(s), período e os três modelos', () => {
    expect(page).toContain('Selecione o ano');
    expect(page).toContain('O sistema não escolhe o ano automaticamente.');
    expect(page).toContain('Selecione a turma');
    expect(page).toContain('Aluno(s)');
    expect(page).toContain('1º trimestre');
    expect(page).toContain('Anual');
    expect(page).toContain('BULLETIN_MODEL_KINDS_V1.map');
    for (const kind of ['synthetic', 'composition', 'detailed']) expect(page).toContain(`'${kind}'`);
  });

  it('renderiza a prévia somente do BulletinModelV1 canônico e preserva imported/calculated e estados sem recalcular', () => {
    expect(service).toContain('emission.materialize(request.request, context)');
    expect(service).toContain('Preview consumes the exact canonical BulletinModelV1');
    expect(page).toContain('BulletinModelPreview');
    expect(page).toContain('Importado');
    expect(page).toContain('Calculado');
    expect(page).toContain('Ausente');
    expect(page).toContain('zero oficial');
    expect(page).toContain('zero legado');
    expect(page).toContain('Não aplicável');
    expect(page).toContain('Dados insuficientes');
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
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('role="status"');
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('artifactHeadingRef.current?.focus()');
    expect(page).toContain('focus-visible:ring-2');
    expect(page).toContain('sm:grid-cols');
    expect(page).toContain('lg:grid-cols');
    expect(page).toContain('border border-border');
    expect(page).toContain('Pronto · item');
    expect(page).toContain('bloqueada(s)/insuficiente(s)');
  });

  it('usa HeroUI e mantém o wiring central reservado à #328', () => {
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('<Surface');
    expect(page).toContain('<Card');
    expect(page).toContain('<Button');
    expect(page).toContain('<Alert');
    expect(client).toContain("const BULLETIN_ENDPOINT = '/api/gradebook/bulletins'");
    expect(app).not.toContain('BulletinPage');
    expect(functions).not.toContain('handleBulletinRequestV1');
  });

  it('registra somente o bloqueio arquitetural de PDF sem criar segundo template', () => {
    expect(page).toContain('PDF/renderização pendente por decisão arquitetural');
    expect(page).toContain('nenhum segundo motor de template foi criado');
    expect(page).not.toContain('@react-pdf');
    expect(page).not.toContain('pdfkit');
    expect(page).not.toContain('jspdf');
  });
});
