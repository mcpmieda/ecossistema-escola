import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração final da onda 19 — fechamentos F4/F5/F6', () => {
  it('preserva a revisão autoritativa F4 sem criar nova taxonomia ou fluxo acadêmico', () => {
    const closure = source('tests/gradebook/f4-closure/f4-authoritative-closure-v1.test.ts');
    const auditContract = source('shared/gradebook-contracts/audit/audit-contract-v1.ts');

    expect(closure).toContain('F4 authoritative closure V1');
    expect(closure).toContain('ROADMAP_F4_BULLETS');
    expect(closure).toContain('FOI PARA');
    expect(closure).toContain('ESTAVA NO');
    expect(auditContract).toContain('readonly category: string;');
  });

  it('monta a manutenção docente F5 somente dentro da superfície Operational lazy existente', () => {
    const shell = source('src/platform/gradebook-workspace-shell.tsx');
    const surface = source('src/platform/gradebook-operational-surface.tsx');
    const maintenance = source(
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-workspace.tsx',
    );
    const client = source(
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-client.ts',
    );

    expect(shell).toContain("import('./gradebook-operational-surface')");
    expect(surface).toContain('<OperationalWorkspacePage />');
    expect(surface).toContain('<TeacherAssignmentMaintenanceWorkspace />');
    expect(maintenance).toContain('Gerenciar professores e atribuições');
    expect(maintenance).toContain('const [activated, setActivated] = useState(false)');
    expect(client).toContain("'/api/gradebook/operational-workspace'");
  });

  it('mantém F6 comparável somente quando houver semântica oficial e monta gráficos de valores oficiais', () => {
    const performancePage = source('src/features/gradebook/performance/performance-page.tsx');
    const charts = source('src/features/gradebook/performance/performance-official-charts.tsx');
    const physicalSource = source(
      'server/gradebook/persistence/d1/performance/d1-class-performance-source-v1.ts',
    );

    expect(performancePage).toContain('<PerformanceOfficialCharts matrix={matrix} />');
    expect(charts).toContain('cell.projection.percentage.imported');
    expect(charts).not.toContain('.calculated');
    expect(physicalSource.match(/comparison-semantics-not-integrated/g)).toHaveLength(1);
    expect(physicalSource).toContain("state: 'not-comparable'");
  });

  it('não adiciona bridge, migration ou persistência acadêmica no navegador', () => {
    const functions = source('functions/[[path]].ts');
    const shell = source('src/platform/gradebook-workspace-shell.tsx');
    const f5Frontend = [
      'src/platform/gradebook-operational-surface.tsx',
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-workspace.tsx',
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-panel.tsx',
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-client.ts',
      'src/features/gradebook/performance/performance-official-charts.tsx',
    ]
      .map(source)
      .join('\n');

    expect(functions.match(/\/api\/gradebook\/operational-workspace/g) ?? []).toHaveLength(0);
    expect(shell).toContain("id: 'operational'");
    expect(f5Frontend).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|serviceWorker/u);
    expect(source('docs/gradebook/PROJECT_STATE.yaml')).toContain('0004_bulletin_council_durability_v1.sql');
    expect(source('docs/gradebook/PROJECT_STATE.yaml')).not.toContain('0005_');
  });

  it('mantém autoridade imported-source e produção acadêmica fail-closed', () => {
    const projectState = source('docs/gradebook/PROJECT_STATE.yaml');
    const academicContext = source('docs/gradebook/ACADEMIC_CONTEXT.md');
    const route = source('server/gradebook/http/operational-workspace-routes-v1.ts');

    expect(projectState).toContain('academic_authority_mode: imported-source');
    expect(projectState).toContain('production_academic_runtime_enabled: false');
    expect(projectState).toContain('production_d1_binding_present: false');
    expect(academicContext).toContain('authorityMode: imported-source');
    expect(route).toContain('createGradebookD1RuntimeV1(env, authorization)');
  });

  it('não antecipa a transição de autoridade F9/#347', () => {
    const projectState = source('docs/gradebook/PROJECT_STATE.yaml');
    const context = source('docs/gradebook/ACADEMIC_CONTEXT.md');

    expect(projectState).toContain('authority_transition_issue: 347');
    expect(projectState).toContain('authority_switch_completed: false');
    expect(context).not.toContain('authorityMode: native-engine');
  });
});
