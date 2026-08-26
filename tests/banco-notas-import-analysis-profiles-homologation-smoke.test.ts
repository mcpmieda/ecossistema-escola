import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const smokePath = join(
  root,
  'infra/banco-notas/cloudflare/smoke-import-analysis-profiles-homologation.ps1',
);
const smoke = readFileSync(smokePath, 'utf8');

describe('Banco de Notas remote analysis-profile smoke safeguards', () => {
  it('is locked to homologation and explicit synthetic writes', () => {
    expect(smoke).toContain("$expectedDatabaseName = 'banco-notas-homologation'");
    expect(smoke).toContain("$databaseBinding = 'BANCO_NOTAS_DB'");
    expect(smoke).toContain('[switch]$ConfirmSyntheticWrites');
    expect(smoke).toContain('if (-not $ConfirmSyntheticWrites)');
    expect(smoke).toContain('database_name deve ser exatamente $expectedDatabaseName');
    expect(smoke).toContain('--remote --config $generatedConfig');
  });

  it('verifies migration 0006 and its tables before any synthetic insert', () => {
    const migrationCheck = smoke.indexOf("name LIKE '0006_banco_notas_import_analysis_profiles%'");
    const tablesCheck = smoke.indexOf("'import_analysis_profiles', 'import_job_analysis_profiles'");
    const firstInsert = smoke.indexOf('INSERT INTO school_years');

    expect(migrationCheck).toBeGreaterThan(-1);
    expect(tablesCheck).toBeGreaterThan(-1);
    expect(firstInsert).toBeGreaterThan(-1);
    expect(migrationCheck).toBeLessThan(firstInsert);
    expect(tablesCheck).toBeLessThan(firstInsert);
  });

  it('covers immutable profile and job-link invariants remotely', () => {
    expect(smoke).toContain('import analysis profile source mismatch');
    expect(smoke).toContain('import analysis profile job mismatch');
    expect(smoke).toContain('import_analysis_profiles are append-only');
    expect(smoke).toContain('import_job_analysis_profiles are append-only');
    expect(smoke).toContain("source_format -eq 'xlsx'");
    expect(smoke).toContain("'linked_teacher_model'");
    expect(smoke).toContain('XLSB deve permanecer fail closed');
    expect(smoke).toContain('smoke-remote');
  });

  it('never provisions, migrates, deploys, or enables sync', () => {
    expect(smoke).not.toMatch(/wrangler\s+d1\s+create/iu);
    expect(smoke).not.toMatch(/wrangler\s+d1\s+migrations\s+apply/iu);
    expect(smoke).not.toMatch(/wrangler\s+(?:pages\s+)?deploy/iu);
    expect(smoke).not.toMatch(/sync_enabled\s*=\s*1/iu);
    expect(smoke).toContain(
      'Este script não provisiona D1, não aplica migrations, não faz deploy e não habilita sync.',
    );
  });
});
