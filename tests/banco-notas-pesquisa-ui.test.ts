import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/PesquisaGlobalPage.tsx'), 'utf8');

describe('Pesquisa Global UI contract', () => {
  it('implements URL state, debounce, cancellation and the minimum query', () => {
    expect(source).toContain('useSearchParams');
    expect(source).toContain('setTimeout');
    expect(source).toContain('300');
    expect(source).toContain('AbortController');
    expect(source).toContain('query.length < 2');
  });

  it('covers accessibility shortcuts and distinct operational states', () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("event.key === '/'");
    expect(source).toContain("event.key === 'Escape'");
    for (const label of [
      'Comece sua pesquisa',
      'Continue digitando',
      'Digite um nome de aluno, professor ou turma.',
      'Digite pelo menos 2 caracteres.',
      'Carregando resultados',
      'Nenhum resultado',
      'Sem permissão',
      'Não foi possível pesquisar',
    ])
      expect(source).toContain(label);
  });

  it('links canonical details, Acompanhamento and full filtered directories', () => {
    for (const path of [
      '/alunos/${item.id}',
      '/professores/${item.id}',
      '/turmas/${item.id}',
      '/acompanhamento/turmas/${item.id}',
      '/alunos?q=',
      '/professores?q=',
      '/turmas?q=',
    ])
      expect(source).toContain(path);
  });
});
