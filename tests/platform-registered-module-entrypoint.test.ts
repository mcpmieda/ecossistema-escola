import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'src/platform/pages.tsx'), 'utf8');
const navigation = readFileSync(join(process.cwd(), 'src/platform/navigation.tsx'), 'utf8');
const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

describe('Centro de Administração registered-module entrypoint', () => {
  it('shows available registered systems on the overview with a same-origin action', () => {
    expect(page).toContain("module.baseRoute.startsWith('/')");
    expect(page).toContain("!module.baseRoute.startsWith('//')");
    expect(page).toContain('Sistemas disponíveis');
    expect(page).toContain('Abrir {module.name}');
    expect(page).toContain('window.location.assign(module.baseRoute)');
  });

  it('adds an access action to the systems registry table', () => {
    expect(page).toContain('<Table.Column id="access">Acesso</Table.Column>');
    expect(page).toContain('<span className="text-xs text-muted">Indisponível</span>');
  });

  it('places available systems directly in the desktop and mobile sidebar', () => {
    expect(navigation).toContain('aria-label="Sistemas disponíveis"');
    expect(navigation).toContain('href={module.baseRoute}');
    expect(navigation).toContain('{module.name}');
    expect(navigation).toContain("module.baseRoute.startsWith('/')");
    expect(navigation).toContain("!module.baseRoute.startsWith('//')");
    expect(app.split('registeredModules={registeredModules}')).toHaveLength(3);
  });
});
