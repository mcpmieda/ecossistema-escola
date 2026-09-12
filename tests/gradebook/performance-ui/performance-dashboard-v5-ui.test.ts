import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Performance dashboard V5 HeroUI', () => {
  const page = source('src/features/gradebook/performance/relational-performance-page-v2.tsx');
  const widgets = source('src/features/gradebook/performance/performance-dashboard-widgets-v5.tsx');
  const analysis = source('src/features/gradebook/performance/performance-analysis-panel-v3.tsx');
  const grid = source('src/features/gradebook/performance/performance-grid-v2.tsx');
  const shell = source('src/platform/gradebook-workspace-shell.tsx');
  const service = source('server/gradebook/application/read-models/performance/performance-dashboard-v5.ts');

  it('uses HeroUI selects and keeps the lens geometry stable while loading', () => {
    expect(page).toContain("Label, ListBox, Select");
    expect(page).toContain('<Select ref={root} data-performance-select={id} selectedKey=');
    expect(page).toContain('isOpen={isOpen}');
    expect(page).toContain('onOpenChange={(open) => onOpenChange(id, open)}');
    expect(page).toContain('document.addEventListener(\'pointerdown\', closeOutside, true)');
    expect(page).toContain("target.closest<HTMLElement>('[data-performance-select]')");
    expect(page).toContain('<Select.Popover isNonModal data-performance-select-popover={id}>');
    expect(page).not.toContain('<select');
    expect(page).toContain('min-h-11');
    expect(page).toContain('min-h-8');
    expect(page.indexOf('<Tabs.ListContainer')).toBeLessThan(page.indexOf('<div className="min-h-8'));
  });

  it('removes the redundant workspace hero while preserving accessible stable navigation', () => {
    expect(shell).toMatch(/className="sr-only">\s*Banco de notas\s*<\/h2>/u);
    expect(shell).not.toContain('Áreas do Banco de notas</h2>');
    expect(shell).toContain('gradebook-area-tabs max-w-full overflow-x-auto');
    expect(shell).toContain('role="tablist"');
  });

  it('renders the requested blue/red bars and class donut from server aggregates', () => {
    for (const label of ['Situação por componente', 'Panorama da turma', 'No mínimo ou acima', 'Abaixo do mínimo', 'Ainda sem classificação']) {
      expect(widgets).toContain(label);
    }
    expect(widgets).toContain('value.overview.columns.map');
    expect(widgets).toContain('dashboardAnalysisV5');
    expect(widgets).not.toContain('minimumApprovalMilli');
    expect(widgets).not.toContain('valueMilli >=');
    expect(service).toContain('buildPerformanceDashboardOverviewV5');
    expect(service).toContain("bucket === 'below'");
    expect(service).toContain("buckets.every((bucket) => bucket === 'above')");
  });

  it('keeps color-independent labels and shows only below-minimum names without filtering the matrix', () => {
    expect(widgets).toContain('aria-label={`${title}: ${count} estudante(s)');
    expect(widgets).toContain('aria-pressed={active}');
    expect(widgets).toContain('selectedColumn?.summary.groups.below');
    expect(widgets).not.toContain('Notas azuis');
    expect(widgets).toContain('Notas vermelhas');
    expect(widgets).toContain('<details className="performance-ranking"');
    expect(analysis).toContain('quem ficou abaixo do mínimo');
    expect(analysis).not.toContain('dois grupos');
    expect(analysis).toContain("const ids = selection?.kind === 'group'");
    expect(page).toContain('renderResult={(ids)');
  });

  it('keeps columns in server order and removes every manual drag/resize affordance', () => {
    expect(grid).toContain('<Table.ScrollContainer');
    expect(grid).not.toContain('ResizableContainer');
    expect(grid).not.toContain('ColumnResizer');
    expect(grid).not.toMatch(/drag|sortable|dnd/iu);
  });
});
