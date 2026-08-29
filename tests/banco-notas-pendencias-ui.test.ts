import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/PendenciasPage.tsx'), 'utf8');
const app = readFileSync(join(process.cwd(), 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
const acompanhamento = readFileSync(
  join(process.cwd(), 'src/banco-notas/AcompanhamentoPage.tsx'),
  'utf8',
);
const professores = readFileSync(
  join(process.cwd(), 'src/banco-notas/ProfessoresPage.tsx'),
  'utf8',
);
const turmas = readFileSync(join(process.cwd(), 'src/banco-notas/TurmasAlunosPage.tsx'), 'utf8');

describe('Banco de Notas Central de Pendências UI', () => {
  it('adds canonical list/detail routes and API consumers', () => {
    expect(app).toContain('path="pendencias"');
    expect(app).toContain('path="pendencias/:id"');
    expect(source).toContain('/v1/pendencias/summary');
    expect(source).toContain('/v1/pendencias');
  });

  it('covers loading, empty, partial, error, 403 and 404 states', () => {
    for (const text of [
      'Skeleton',
      'Nenhuma pendência encontrada',
      'Visão parcial',
      'Não foi possível carregar',
      'Sem permissão',
      'Pendência não encontrada',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('persists and debounces every filter with server pagination', () => {
    expect(source).toContain('useSearchParams');
    expect(source).toContain('window.setTimeout');
    expect(source).toContain("next.set('page', '1')");
    for (const label of [
      'Ano letivo',
      'Severidade',
      'Tipo',
      'Professor',
      'Turma',
      'Componente',
      'Status',
    ]) {
      expect(source).toContain(label);
    }
  });

  it('uses HeroUI, exposes diagnostic detail and remains read-only', () => {
    for (const component of ['Table', 'SearchField', 'Select', 'Chip', 'Card', 'Surface']) {
      expect(source).toContain(component);
    }
    for (const text of [
      'Causa e evidência',
      'Origem factual',
      'Contexto afetado',
      'Investigar no contexto',
      'nenhuma pendência é resolvida',
    ]) {
      expect(source).toContain(text);
    }
    expect(source).not.toMatch(/method:\s*['"](?:POST|PATCH|DELETE)['"]/u);
    expect(source).not.toMatch(
      /entra_object_id|drive_item_id|recipient_upn|ambient.?constellation/iu,
    );
  });

  it('links Acompanhamento, Professor and Turma to filtered Central views', () => {
    expect(acompanhamento).toContain('Ver todas as pendências');
    expect(acompanhamento).toContain('/pendencias?classGroupId=');
    expect(professores).toContain('/pendencias?teacherId=');
    expect(turmas).toContain('/pendencias?classGroupId=');
  });
});
