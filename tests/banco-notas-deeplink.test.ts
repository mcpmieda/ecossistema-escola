import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const banco = readFileSync(join(root, 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
const routes = JSON.parse(readFileSync(join(root, 'public/_routes.json'), 'utf8')) as {
  include: string[];
  exclude: string[];
};

describe('Banco de Notas path-based deep links', () => {
  it('dispatches the module from the real pathname instead of a hash route', () => {
    expect(app).toContain("window.location.pathname.startsWith('/banco-de-notas')");
    expect(banco).toContain('<BrowserRouter basename="/banco-de-notas">');
    expect(banco).toContain('<Route path="configuracoes"');
    expect(banco).toContain("['/configuracoes', 'Configurações', Settings]");
    expect(banco).not.toMatch(/#bancodenotas|#\/banco-de-notas/iu);
  });

  it('leaves module paths to the Pages SPA fallback instead of invoking Functions', () => {
    expect(routes.include).toEqual(['/auth/*', '/api/*']);
    expect(routes.exclude).not.toContain('/banco-de-notas/*');
    expect(existsSync(join(root, 'public/404.html'))).toBe(false);
  });
});
