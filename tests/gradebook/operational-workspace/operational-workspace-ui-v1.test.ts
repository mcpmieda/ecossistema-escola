import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('operational workspace HeroUI experience v1', () => {
  it('mounts inside the existing Banco de notas shell without replacing the importer', () => {
    const app = source('src/App.tsx');
    expect(app).toContain('<PageContent route={route} snapshot={loadState.snapshot} />');
    expect(app).toContain("route === 'banco-de-notas' && <OperationalWorkspacePage />");
    expect(app).toContain("./features/gradebook/operational-workspace/operational-workspace-page");
  });

  it('uses HeroUI actions, explicit year selection, keyboard submit and visible focus transfer', () => {
    const page = source(
      'src/features/gradebook/operational-workspace/operational-workspace-page.tsx',
    );
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('<SearchField');
    expect(page).toContain('<Button');
    expect(page).toContain('<select');
    expect(page).toContain('Selecione o ano');
    expect(page).toContain('onSubmit={(event) =>');
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('detailHeadingRef.current?.focus()');
    expect(page).toContain('searchInputRef.current?.focus()');
    expect(page).toContain('aria-live="polite"');
    expect(page).not.toMatch(/new Date|Date\.now|currentYear|getFullYear/u);
  });

  it('reuses opaque navigation and the existing search contract without client matching or ranking', () => {
    const page = source(
      'src/features/gradebook/operational-workspace/operational-workspace-page.tsx',
    );
    expect(page).toContain('navigationIntentFromGlobalSearchResultV1');
    expect(page).toContain('GLOBAL_SEARCH_ORDER_V1');
    expect(page).toContain('query,');
    expect(page).not.toMatch(/\.normalize\(|toLocaleLowerCase|localeCompare|fuzzy|levenshtein/u);
    expect(page).not.toMatch(/href:|route:|url:/u);
  });

  it('keeps server code and academic rules out of the frontend', () => {
    const page = source(
      'src/features/gradebook/operational-workspace/operational-workspace-page.tsx',
    );
    const client = source(
      'src/features/gradebook/operational-workspace/operational-workspace-client.ts',
    );
    const frontend = `${page}\n${client}`;
    expect(frontend).not.toMatch(/from ['"][^'"]*server\//u);
    expect(frontend).not.toMatch(
      /roundAcademicGrade|composeNative|resolveNative|parallelRecovery|finalRecovery|authorityMode/u,
    );
    expect(frontend).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open/u);
  });
});
