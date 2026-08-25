import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('HeroUI final hardening contract', () => {
  it('keeps search inline in the header on desktop and mobile', () => {
    const search = source('src/platform/search.tsx');

    expect(search).toContain('<SearchField.Input');
    expect(search).toContain('<Kbd.Content>Ctrl + K</Kbd.Content>');
    expect(search).toContain('platform-search-mobile-panel');
    expect(search).not.toMatch(/\bDrawer\b/u);
    expect(search).not.toMatch(/\bPopover\b/u);
    expect(search).not.toContain('hashchange');
  });

  it('uses a native HeroUI profile dropdown and friendly authentication recovery screen', () => {
    const app = source('src/App.tsx');

    expect(app).toMatch(/<Dropdown>\s*<Button[\s\S]*?aria-label="Abrir menu do perfil"/u);
    expect(app).not.toContain('<Dropdown.Trigger>');
    expect(app).toContain('<Avatar');
    expect(app).toContain('<Dropdown.Item id="logout"');
    expect(app).toContain('Não foi possível concluir sua entrada.');
    expect(app).toContain('Entrar novamente');
    expect(app).toContain('<Breadcrumbs');
  });

  it('mounts Ambient Constellation only as one fixed page background per shell state', () => {
    const app = source('src/App.tsx');
    const platformSources = readdirSync(join(root, 'src/platform'))
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => source(`src/platform/${name}`))
      .join('\n');
    const appConstellations = app.match(/<AmbientConstellation\b/gu) ?? [];
    const fixedConstellations = app.match(/<AmbientConstellation className="fixed"/gu) ?? [];

    expect(appConstellations).toHaveLength(4);
    expect(fixedConstellations).toHaveLength(4);
    expect(platformSources).not.toContain('AmbientConstellation');
  });

  it('uses HeroUI table scroll containers for every structured table', () => {
    const tableSources = [
      source('src/platform/pages.tsx'),
      source('src/platform/operations-page.tsx'),
    ].join('\n');
    const tables = tableSources.match(/<Table variant=/gu) ?? [];
    const scrollContainers = tableSources.match(/<Table\.ScrollContainer>/gu) ?? [];

    expect(tables.length).toBeGreaterThan(0);
    expect(scrollContainers).toHaveLength(tables.length);
    expect(source('src/styles.css')).toContain('.table__scroll-container');
  });

  it('does not reintroduce legacy visual compatibility patterns', () => {
    const presentation = [
      source('src/App.tsx'),
      source('src/platform/search.tsx'),
      source('src/platform/navigation.tsx'),
      source('src/platform/pages.tsx'),
      source('src/platform/operations-page.tsx'),
      source('src/platform/presentation.tsx'),
    ].join('\n');

    expect(presentation).not.toMatch(/components\/ui|@radix-ui|shadcn|reui/iu);
    expect(presentation).not.toMatch(/<kbd\b/u);
    expect(presentation).not.toContain('window.location.assign(item.href)');
  });
});
