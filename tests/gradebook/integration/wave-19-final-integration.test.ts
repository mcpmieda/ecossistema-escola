import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

// These assertions preserve the old planning checkpoint, not current production flags.
const historicalState = 'docs/gradebook/history/pre-final-1/PROJECT_STATE.yaml';
const historicalContext = 'docs/gradebook/history/pre-final-1/ACADEMIC_CONTEXT.md';

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

  it('preserva a manutenção F5 mas não a executa contra o schema novo na central somente leitura #639', () => {
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
    expect(surface).toContain('relational-workspace-page-v2');
    expect(surface).not.toContain('<TeacherAssignmentMaintenanceWorkspace');
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
    expect(physicalSource).toContain('resolvePerformanceComparisonProjectionV2');
    expect(physicalSource).not.toContain('tolerance');
  });

  it('preserva bridges e browser storage e registra o catálogo do checkpoint histórico', () => {
    const functions = source('functions/[[path]].ts');
    const shell = source('src/platform/gradebook-workspace-shell.tsx');
    const f5Frontend = [
      'src/platform/gradebook-operational-surface.tsx',
      'src/features/gradebook/operational-workspace/relational-workspace-page-v2.tsx',
      'src/features/gradebook/operational-workspace/operational-workspace-client-v2.ts',
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-workspace.tsx',
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-panel.tsx',
      'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-client.ts',
      'src/features/gradebook/performance/performance-official-charts.tsx',
    ].map(source).join('\n');

    expect(functions.match(/\/api\/gradebook\/operational-workspace/g) ?? []).toHaveLength(0);
    expect(shell).toContain("id: 'operational'");
    expect(f5Frontend).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|serviceWorker/u);
    expect(source(historicalState)).toContain('0004_bulletin_council_durability_v1.sql');
    expect(source(historicalState)).toContain('0005_council_session_durability_v2.sql');
  });

  it('preserva as flags históricas sem usá-las como prova da produção atual', () => {
    const projectState = source(historicalState);
    const academicContext = source(historicalContext);
    const route = source('server/gradebook/http/operational-workspace-routes-v1.ts');

    expect(projectState).toContain('academic_authority_mode: imported-source');
    expect(projectState).toContain('production_academic_runtime_enabled: false');
    expect(projectState).toContain('production_d1_binding_present: true');
    expect(projectState).toContain('production_gate_final: off');
    expect(academicContext).toContain('authorityMode: imported-source');
    expect(route).toContain('createGradebookD1RuntimeV1(env, authorization)');
  });

  it('não reinterpreta o checkpoint de autoridade F9/#347', () => {
    const projectState = source(historicalState);
    const context = source(historicalContext);

    expect(projectState).toContain('authority_transition_issue: 347');
    expect(projectState).toContain('authority_switch_completed: false');
    expect(context).not.toContain('authorityMode: native-engine');
  });
});
