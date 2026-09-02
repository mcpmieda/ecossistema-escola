import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração final da onda 16 — F6/F7/F8', () => {
  it('mantém exatamente um bridge por superfície acadêmica autorizada', () => {
    const functions = source('functions/[[path]].ts');
    const routes = [
      ['server/gradebook/http/operational-workspace-routes-v1.ts', '/api/gradebook/operational-workspace'],
      ['server/gradebook/http/audit-workspace-routes-v1.ts', '/api/gradebook/audit-workspace'],
      ['server/gradebook/http/performance-routes-v1.ts', '/api/gradebook/performance'],
      ['server/gradebook/http/bulletin-routes-v1.ts', '/api/gradebook/bulletins'],
      ['server/gradebook/http/council-routes-v1.ts', '/api/gradebook/council-workspace'],
    ] as const;

    for (const [path, endpoint] of routes) {
      expect(source(path).split(endpoint)).toHaveLength(2);
    }
    expect(functions.match(/handleOperationalWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handleAuditWorkspaceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handlePerformanceRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/handleBulletinRequestV1/gu)).toHaveLength(2);
    expect(functions.match(/createCouncilWorkspaceRequestHandlerV1/gu)).toHaveLength(2);
  });

  it('usa a projeção oficial #332 upstream do Council Workspace sem cálculo no workspace/wiring', () => {
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const projection = source(
      'server/gradebook/application/council/council-official-projection-source-v1.ts',
    );
    const workspace = source('server/gradebook/application/council/council-workspace-v1.ts');
    const functions = source('functions/[[path]].ts');

    expect(runtime).toContain('createGradebookD1CouncilOfficialProjectionSourceV1(database)');
    expect(runtime).toContain('councilWorkspace(');
    expect(runtime).toContain('createLocalCouncilDecisionStoreV1');
    expect(projection).toContain('resolveNativeAnnualOutcome');
    expect(projection).toContain('NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1');
    expect(projection).toContain('record.officialGrade.imported.value');
    expect(projection).toContain('recoveryGrade.imported.value');
    expect(projection).toContain("'final-recovery-ambiguous'");
    expect(workspace).not.toContain('resolveNativeAnnualOutcome');
    expect(functions).not.toContain('resolveNativeAnnualOutcome');
  });

  it('preserva decisão humana, justificativa, histórico/CAS e decisão formal preexistente fail-closed', () => {
    const workspace = source('server/gradebook/application/council/council-workspace-v1.ts');
    const store = source('server/gradebook/application/council/council-decision-store-v1.ts');
    const projection = source(
      'server/gradebook/application/council/council-official-projection-source-v1.ts',
    );

    expect(workspace).toContain("student.calculated.queueState !== 'eligible-for-council'");
    expect(workspace).toContain('request.expectedVersion');
    expect(workspace).toContain('request.justification.trim()');
    expect(store).toContain("basis: 'class-council'");
    expect(store).toContain("status: 'version-conflict'");
    expect(store).toContain('Object.freeze([...history, record])');
    expect(projection).toContain('formalDecision');
    expect(projection).toContain('follows-official-annual-result');
  });

  it('preserva F6: quatro lentes, recovery oficial, comparison fail-closed, paginação/drill-down e raw evidence fora do HTTP', () => {
    const page = source('src/features/gradebook/performance/performance-page.tsx');
    const route = source('server/gradebook/http/performance-routes-v1.ts');
    const physicalSource = source(
      'server/gradebook/persistence/d1/performance/d1-class-performance-source-v1.ts',
    );

    for (const label of ['Resultado', 'Quantitativo', 'Qualitativo', 'Avaliações']) {
      expect(page).toContain(label);
    }
    expect(page).toContain('rowHistory');
    expect(page).toContain('columnHistory');
    expect(page).toContain('openStudentDetail');
    expect(page).toContain('openCellDetail');
    expect(page).toContain('ticket.isCurrent()');
    expect(physicalSource).toContain("source: 'final-recovery'");
    expect(physicalSource).toContain('comparison-semantics-not-integrated');
    expect(physicalSource).toContain('official-projection-unavailable');
    expect(route).not.toContain('officialRecords: detail.officialRecords');
    expect(route).not.toContain('rawSourceEvidence');
  });

  it('preserva F8: mesma base canônica, lote isolado, snapshot histórico e bloqueio explícito de PDF', () => {
    const service = source('server/gradebook/application/bulletins/bulletin-workspace-service-v1.ts');
    const emission = source('server/gradebook/application/bulletins/bulletin-emission-service-v1.ts');
    const snapshots = source('server/gradebook/application/bulletins/bulletin-snapshot-repository-v1.ts');
    const page = source('src/features/gradebook/bulletins/bulletin-page.tsx');

    expect(service).toContain('emission.materialize(request.request, context)');
    expect(service).toContain('emission.emit(request.request, context)');
    expect(service).toContain('emission.emitBatch(request.request, context)');
    expect(service).toContain('emission.reprint(request.request, context)');
    expect(emission).toContain('materializeBatch');
    expect(snapshots).toContain('freezeBulletinSnapshotV1');
    expect(page).toContain('Cada aluno conserva seu próprio resultado.');
    expect(page).toContain('PDF/renderização pendente por decisão arquitetural');
    expect(page).not.toContain('@react-pdf');
    expect(page).not.toContain('pdfkit');
    expect(page).not.toContain('jspdf');
  });

  it('monta as três páginas no shell com contexto explícito e estados acessíveis', () => {
    const app = source('src/App.tsx');
    const councilPage = source('src/features/gradebook/council/council-workspace-page.tsx');

    expect(app).toContain('<PerformancePage />');
    expect(app).toContain('<BulletinPage />');
    expect(app).toContain('<CouncilWorkspaceMount />');
    expect(app).toContain('requestOperationalWorkspaceV1');
    expect(app).toContain("scope: { kinds: ['class-group'] }");
    expect(app).toContain('searchSequenceRef.current');
    expect(app).toContain('classSearchControllerRef.current?.abort()');
    expect(app).toContain('aria-live="polite"');
    expect(councilPage).toContain('headingRef.current?.focus()');
    expect(councilPage).toContain('conflictRef.current?.focus()');
  });

  it('mantém auth opaca, capability existente, no-store e produção fail-closed antes do binding', () => {
    const functions = source('functions/[[path]].ts');
    const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');
    const handlers = [
      source('server/gradebook/http/performance-routes-v1.ts'),
      source('server/gradebook/http/bulletin-routes-v1.ts'),
      source('server/gradebook/http/council-routes-v1.ts'),
    ];

    for (const handler of handlers) {
      expect(handler).toContain('requireAuth');
      expect(handler).toContain('authorizeGradebookD1RuntimeV1');
      expect(handler).toContain('no-store');
    }
    expect(functions).toContain('authorizeGradebookD1RuntimeV1(session)');
    const environmentGate = runtime.indexOf('const environment = runtimeEnvironment(env);');
    const bindingAccess = runtime.indexOf('const database = requireDatabase(env.GRADEBOOK_D1);');
    expect(environmentGate).toBeGreaterThanOrEqual(0);
    expect(bindingAccess).toBeGreaterThan(environmentGate);
  });

  it('sincroniza F1 como 7/7 e remove os marcadores históricos já satisfeitos da memória central', () => {
    const docs = [
      'docs/gradebook/README.md',
      'docs/gradebook/COMECE_AQUI.md',
      'docs/gradebook/ISSUE_MAP.md',
      'docs/gradebook/PROJECT_STATE.yaml',
      'docs/gradebook/ARCHITECTURE.md',
      'docs/gradebook/CONTRACTS.md',
      'docs/gradebook/D1_RUNTIME.md',
    ].map(source);
    const combined = docs.join('\n');

    expect(combined).not.toContain('synthetic-complete-private-real-validation-pending');
    expect(combined).not.toContain('controlled-real-corpus-validation-not-yet-recorded');
    expect(combined).not.toContain('complete-manifest-failure-smoke-not-yet-recorded');
    expect(combined).toContain('F1');
    expect(combined).toMatch(/7\s*(?:de\s*)?7|7\/7/u);
  });
});
