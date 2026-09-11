import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('relational current Audit UI V2', () => {
  const surface = source('src/features/gradebook/audit-workspace/gradebook-audit-surface.tsx');
  const page = source('src/features/gradebook/audit-workspace/relational-current-audit-page-v2.tsx');

  it('mounts only the current relational diagnostic experience', () => {
    expect(surface).toContain('<RelationalCurrentAuditPageV2 />');
    expect(surface).not.toContain('AuditWorkspacePage');
    expect(surface).not.toContain('ImportDiagnosticsAuditPanelV1');
    expect(page).toContain('listGradebookImportDiagnosticsAuditV1');
    expect(page).toContain('academicYear: ACTIVE_YEAR');
    expect(page).toContain('Ano letivo 2026');
  });

  it('distinguishes current findings from durable human treatment', () => {
    expect(page).toContain('Achado atual não é histórico de tratamento');
    expect(page).toContain('nenhuma correção é executada automaticamente');
    expect(page).toContain('ainda não possui contrato durável');
    expect(page).not.toContain('requestAuditWorkspaceResolutionV1');
    expect(page).not.toContain('requestDeterministicCorrectionExecutionV2');
    expect(page).not.toContain('Executar correção determinística');
  });

  it('uses HeroUI and stable filters without a native select or academic browser storage', () => {
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('<Card');
    expect(page).toContain('<Alert');
    expect(page).toContain('<Button');
    expect(page).toContain('Carregar mais 50');
    expect(page).not.toMatch(/<select\b/u);
    expect(page).not.toContain('localStorage');
    expect(page).not.toContain('sessionStorage');
  });
});
