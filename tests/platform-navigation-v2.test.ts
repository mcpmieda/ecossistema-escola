// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serviceSectionFromHashV2, serviceSectionsV2 } from '../src/platform/navigation';

describe('shell navigation of 07/10/2026', () => {
  it('lists the sections of the open service in the side column and none for a plain area', () => {
    expect(serviceSectionsV2('painel-do-aluno').map((section) => section.label)).toEqual([
      'Visão geral',
      'Alunos',
      'Políticas',
      'Sessões',
      'Auditoria',
      'Configurações',
    ]);
    expect(serviceSectionsV2('banco-de-notas')[0]).toMatchObject({
      id: 'importacao',
      href: '#/banco-de-notas',
    });
    expect(serviceSectionsV2('configuracoes')).toEqual([]);
    // Auditoria lives inside Saúde do Sistema (owner request of 08/10/2026).
    expect(serviceSectionsV2('operacao').map((section) => [section.label, section.href])).toEqual([
      ['Saúde do Sistema', '#/operacao'],
      ['Auditoria', '#/operacao?area=audit'],
    ]);
    expect(serviceSectionFromHashV2('operacao', '#/operacao')).toBe('health');
    expect(serviceSectionFromHashV2('operacao', '#/operacao?area=audit')).toBe('audit');
  });

  it('reads the section from the address and falls back to the first one of each service', () => {
    expect(serviceSectionFromHashV2('painel-do-aluno', '#/painel-do-aluno?area=sessions')).toBe(
      'sessions',
    );
    // The retired QR area opens inside Alunos.
    expect(serviceSectionFromHashV2('painel-do-aluno', '#/painel-do-aluno?area=credentials')).toBe(
      'accounts',
    );
    expect(serviceSectionFromHashV2('painel-do-aluno', '#/painel-do-aluno')).toBe('overview');
    expect(serviceSectionFromHashV2('banco-de-notas', '#/banco-de-notas?area=council')).toBe(
      'council',
    );
    expect(serviceSectionFromHashV2('banco-de-notas', '#/banco-de-notas?area=unknown')).toBe(
      'importacao',
    );
  });
});
