import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

const page = source('src/features/gradebook/operational-workspace/operational-workspace-page.tsx');
const client = source('src/features/gradebook/operational-workspace/operational-workspace-client.ts');
const gate = source('src/features/gradebook/operational-workspace/operational-workspace-request-gate.ts');

describe('operational workspace hardening', () => {
  it('keeps the single existing bridge and shared search semantics untouched', () => {
    expect(client).toContain("'/api/gradebook/operational-workspace'");
    expect(client).toContain("method: 'POST'");
    expect(page).toContain('GLOBAL_SEARCH_ORDER_V1');
    expect(page).toContain('navigationIntentFromGlobalSearchResultV1');
    expect(page).not.toMatch(/\.normalize\(|toLocaleLowerCase|localeCompare|fuzzy|levenshtein/u);
    expect(page).not.toMatch(/new Date|Date\.now|getFullYear|currentYear/u);
    expect(`${page}\n${client}`).not.toMatch(/from ['"][^'"]*server\//u);
  });

  it('invalidates stale work on query, year and center-context changes', () => {
    expect(page).toContain('setQuery(value);\n    invalidateSearch();');
    expect(page).toContain('clearSelection();\n    setSelectedAcademicYearId(nextYearId);');
    expect(page).toContain('detailGate.current.invalidate();\n    setActiveCenter(kind);');
    expect(page).toContain('requestOperationalWorkspaceV1(request, ticket.signal)');
    expect(page).toContain('ticket.isCurrent()');
    expect(gate).toContain('active?.controller.abort()');
    expect(gate).toContain('generation === requestGeneration');
  });

  it('correlates ready responses to the explicit year and opaque kind plus id', () => {
    expect(page).toContain('response.context.selectedAcademicYearId === academicYearId');
    expect(page).toContain('response.view.kind === intent.kind');
    expect(page).toContain('response.view.id === intent.id');
    expect(page).toContain('response.search.academicYearId === academicYearId');
    expect(page).not.toMatch(/href:|route:|url:/u);
  });

  it('hardens pagination without hiding the current page while continuation loads', () => {
    expect(page).toContain('const append = cursor !== null;');
    expect(page).toContain('setIsLoadingMore(true);');
    expect(page).toContain('append ? [...current, ...response.search.items] : response.search.items');
    expect(page).toContain('isDisabled={isLoadingMore}');
    expect(page).toContain('searchSummaryRef.current?.focus()');
    expect(page).toContain('lastCompletedSearchKey.current === searchKey');
  });

  it('keeps loading, empty, unavailable and not-authorized distinguishable and retryable where safe', () => {
    expect(page).toContain('Acesso não autorizado');
    expect(page).toContain('Centrais indisponíveis');
    expect(page).toContain('Nenhum ano acadêmico disponível');
    expect(page).toContain('Nenhum resultado encontrado para esta pesquisa.');
    expect(page).toContain('Tentar abrir novamente');
    expect(page).toContain('Tentar pesquisar novamente');
    expect(page).toContain('Tentar carregar esta Central novamente');
  });

  it('preserves keyboard, focus, accessible state and responsive controls', () => {
    expect(page).toContain('onSubmit={(event) =>');
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('aria-busy={searchBusy}');
    expect(page).toContain('aria-busy={detailState === \'loading\'}');
    expect(page).toContain('aria-pressed={activeCenter === kind}');
    expect(page).toContain('tabIndex={-1}');
    expect(page).toContain('detailHeadingRef.current?.focus()');
    expect(page).toContain('searchInputRef.current?.focus()');
    expect(page).toContain('sm:flex-row');
    expect(page).toContain('md:grid-cols-2');
  });
});
