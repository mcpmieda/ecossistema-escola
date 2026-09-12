import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('relational institutional reports HeroUI V2', () => {
  const page = source('src/features/gradebook/reports/relational-institutional-reports-page-v2.tsx');
  const shell = source('src/platform/gradebook-workspace-shell.tsx');

  it('mounts V2 and leaves the legacy report page outside the live shell', () => {
    expect(shell).toContain("import('../features/gradebook/reports/relational-institutional-reports-page-v2')");
    expect(shell).not.toContain("import('../features/gradebook/reports/institutional-reports-page')");
    expect(page).toContain('requestRelationalInstitutionalReportV2');
    expect(page).not.toContain('resolveLegacyAcademicYear');
    expect(page).not.toContain('requestOperationalWorkspaceV1');
    expect(page).not.toContain('requestBulletinWorkspaceV1');
  });

  it('uses HeroUI selects and stable filter space without browser-native selects', () => {
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('<Select');
    expect(page).toContain('<Select.Trigger');
    expect(page).toContain('<Select.Popover>');
    expect(page).not.toMatch(/<select\b/u);
    expect(page).not.toContain('localStorage');
    expect(page).not.toContain('sessionStorage');
  });

  it('keeps current authority, audit and snapshot language explicit', () => {
    expect(page).toContain('Ano letivo {year}');
    expect(page).toContain('Comparação descritiva entre trimestres do mesmo ano');
    expect(page).toContain('useGradebookYear');
    expect(page).toContain('Eventual desempate do diretor ocorre fora do sistema');
    expect(page).toContain('Achados atuais, sem correção automática');
    expect(page).toContain('Somente snapshots imutáveis V2');
    expect(page).toContain("reading.state === 'repeat-failure'");
    expect(page).toContain("? 'R/R'");
    expect(page).toContain('Reprovação automática');
    expect(page).toContain("runRelationalBulletinPdfActionV2('download'");
  });
});
