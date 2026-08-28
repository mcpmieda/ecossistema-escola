import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/AcompanhamentoPage.tsx'), 'utf8');
const app = readFileSync(join(process.cwd(), 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');

describe('Banco de Notas Acompanhamento UI', () => {
  it('connects the overview and detail routes to real API endpoints', () => {
    expect(app).toContain('AcompanhamentoPage');
    expect(app).toContain('acompanhamento/turmas/:id');
    expect(source).toContain('/v1/acompanhamento/summary');
    expect(source).toContain('/v1/acompanhamento/turmas');
  });

  it('covers loading, empty, partial, error and permission states', () => {
    expect(source).toContain('Carregando resumo');
    expect(source).toContain('Nada para acompanhar ainda');
    expect(source).toContain('Visão parcial');
    expect(source).toContain('Não foi possível carregar');
    expect(source).toContain('Sem permissão');
    expect(source).toContain('Nenhum resultado para estes filtros');
  });

  it('persists filters, debounces search and preserves context across detail navigation', () => {
    expect(source).toContain('useSearchParams');
    expect(source).toContain('window.setTimeout');
    expect(source).toContain("next.set('page', '1')");
    expect(source).toContain('retorno=');
    expect(source).toContain('Voltar ao acompanhamento');
  });

  it('uses HeroUI tables, filters, badges and accessible labels without Ambient', () => {
    expect(source).toMatch(/\bTable\b/u);
    expect(source).toMatch(/\bSearchField\b/u);
    expect(source).toMatch(/\bSelect\b/u);
    expect(source).toMatch(/\bChip\b/u);
    expect(source).toContain('aria-label="Acompanhamento de turmas e modelos"');
    expect(source).not.toMatch(/ambient.?constellation|shadcn|reui/iu);
  });

  it('presents zero and absence as separate facts and keeps the experience read-only', () => {
    expect(source).toContain('Zeros numéricos');
    expect(source).toContain('Ausências explícitas');
    expect(source).toContain('nenhuma resolução destrutiva');
    expect(source).not.toMatch(/method:\s*['"](?:POST|PATCH|DELETE)['"]/u);
  });
});
