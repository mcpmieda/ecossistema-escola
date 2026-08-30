import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'src/platform/pages.tsx'), 'utf8');

describe('Centro de Administração registered-module entrypoint', () => {
  it('shows available registered systems on the overview with a same-origin action', () => {
    expect(page).toContain('module.available && module.baseRoute.startsWith');
    expect(page).toContain('Sistemas disponíveis');
    expect(page).toContain('Abrir {module.name}');
    expect(page).toContain('window.location.assign(module.baseRoute)');
  });

  it('adds an access action to the systems registry table', () => {
    expect(page).toContain('<Table.Column id="access">Acesso</Table.Column>');
    expect(page).toContain('<span className="text-xs text-muted">Indisponível</span>');
  });
});
