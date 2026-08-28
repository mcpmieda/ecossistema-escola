import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/ProfessoresPage.tsx'), 'utf8');
const app = readFileSync(join(process.cwd(), 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
const acompanhamento = readFileSync(
  join(process.cwd(), 'src/banco-notas/AcompanhamentoPage.tsx'),
  'utf8',
);
const turmas = readFileSync(join(process.cwd(), 'src/banco-notas/TurmasAlunosPage.tsx'), 'utf8');

describe('Banco de Notas Professores UI', () => {
  it('replaces the placeholder with list and detail routes', () => {
    expect(app).toContain('path="professores"');
    expect(app).toContain('path="professores/:id"');
    expect(source).toContain('/v1/professores');
    expect(source).not.toContain('<Planned title="Professores"');
  });

  it('covers loading, empty, no assignment, missing identity, partial, error, 403 and 404', () => {
    for (const text of [
      'Skeleton',
      'Nenhum professor cadastrado',
      'Sem atribuição no período selecionado',
      'Identidade não vinculada',
      'Visão parcial',
      'Não foi possível carregar',
      'Sem permissão',
      'Registro não encontrado',
    ])
      expect(source).toContain(text);
  });

  it('persists filters, debounces search, paginates and keeps return context', () => {
    expect(source).toContain('useSearchParams');
    expect(source).toContain('window.setTimeout');
    expect(source).toContain("next.set('page', '1')");
    expect(source).toContain('retorno=');
    for (const label of [
      'Ano letivo',
      'Status',
      'Turma',
      'Componente',
      'Identidade institucional',
      'Estado do modelo',
      'Atribuição',
      'Situação',
    ])
      expect(source).toContain(label);
  });

  it('uses HeroUI, shows operational sections and remains read-only', () => {
    for (const component of ['Table', 'SearchField', 'Select', 'Chip', 'Card'])
      expect(source).toContain(component);
    for (const text of [
      'Turmas e componentes',
      'Modelos e planilhas',
      'Pendências',
      'Atividade recente',
      'Abrir no Acompanhamento',
      'Ver turma',
    ])
      expect(source).toContain(text);
    expect(source).not.toMatch(/method:\s*['"](?:POST|PATCH|DELETE)['"]/u);
    expect(source).not.toMatch(/entra_object_id|drive_item_id|recipient_upn/iu);
    expect(source).not.toMatch(/ambient.?constellation|shadcn|reui/iu);
  });

  it('adds Turma and Acompanhamento links back to Professor', () => {
    expect(turmas).toContain('/professores/${assignment.teacherId}');
    expect(acompanhamento).toContain('/professores/${row.teacherId}');
    expect(acompanhamento).toContain('/professores/${assignment.teacherId}');
  });
});
