// @vitest-environment node
import { readFileSync } from 'node:fs';
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

describe('side-only shell of 08/10/2026', () => {
  const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const app = read('src/App.tsx');
  const styles = read('src/styles.css');

  it('opens the phone drawer as a dialog that takes focus, closes on Escape and gives focus back', () => {
    expect(app).toContain("role: 'dialog', 'aria-modal': true");
    expect(app).toContain("if (event.key === 'Escape') setMenuOpen(false);");
    expect(app).toContain("main?.setAttribute('inert', '');");
    expect(app).toContain('menuButtonRef.current?.focus();');
    // A window that grows past phone width closes it, so the page is never left inert.
    expect(app).toContain("window.matchMedia('(min-width: 901px)')");
  });

  it('lets the search results open over the page instead of being cut by the side column', () => {
    const rule = styles.slice(styles.lastIndexOf('.shell-side__search .platform-search-popover {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('min-width: 0;');
    expect(styles).toMatch(/\.platform-shell--v2 \.shell-aside \{\n\s+overflow: visible;/u);
    expect(styles).toMatch(/\.platform-shell--v2 \.shell-aside \{\n\s+z-index: 20;/u);
  });

  it('drops a matrix search when its field is hidden on phones', () => {
    const matrix = read('src/features/gradebook/performance/performance-result-matrix-v2.tsx');
    expect(styles).toContain('.performance-matrix-filters .search-field {\n    display: none;');
    expect(matrix).toContain("window.matchMedia('(max-width: 640px)')");
    expect(matrix).toContain("if (narrow.matches) setQuery('');");
  });
});
