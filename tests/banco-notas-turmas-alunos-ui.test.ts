import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/TurmasAlunosPage.tsx'), 'utf8');
const app = readFileSync(join(process.cwd(), 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
describe('Banco de Notas Turmas e Alunos UI', () => {
  it('replaces placeholders with all four real routes', () => {
    for (const route of [
      'path="turmas"',
      'path="turmas/:id"',
      'path="alunos"',
      'path="alunos/:id"',
    ])
      expect(app).toContain(route);
    expect(source).toContain('/v1/turmas');
    expect(source).toContain('/v1/alunos');
  });
  it('covers loading, empty, unrelated, error and permission states', () => {
    expect(source).toContain('Skeleton');
    expect(source).toContain('Nenhuma turma encontrada');
    expect(source).toContain('Nenhum aluno encontrado');
    expect(source).toContain('ainda não aparece nos mappings canônicos');
    expect(source).toContain('Não foi possível carregar');
    expect(source).toContain('Sem permissão');
    expect(source).toContain('Visão parcial');
    expect(source).toContain('Registro não encontrado');
  });
  it('persists filters, debounces search, paginates and preserves return context', () => {
    expect(source).toContain('useSearchParams');
    expect(source).toContain('window.setTimeout');
    expect(source).toContain("next.set('page', '1')");
    expect(source).toContain('retorno=');
    expect(source).toContain('Professor');
    expect(source).toContain('Componente');
    expect(source).toContain('Atenção');
  });
  it('uses HeroUI and provides every cross-navigation action', () => {
    for (const component of ['Table', 'SearchField', 'Select', 'Chip'])
      expect(source).toContain(component);
    expect(source).toContain('Abrir no Acompanhamento');
    expect(source).toContain('Ver aluno');
    expect(source).toContain('Ver turma');
    expect(source).not.toMatch(/ambient.?constellation|shadcn|reui/iu);
  });
  it('shows operational snapshots without collapsing zero and absence', () => {
    expect(source).toContain('Ausência explícita');
    expect(source).toContain('snapshot.valueNumeric !== null');
    expect(source).toContain('Nenhum snapshot conhecido');
    expect(source).not.toMatch(/method:\s*['"](?:POST|PATCH|DELETE)['"]/u);
  });
});
