import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const provisionPath = join(root, 'infra/banco-notas/cloudflare/provision-homologation.ps1');
const smokePath = join(root, 'infra/banco-notas/cloudflare/smoke-homologation.ps1');
const provision = readFileSync(provisionPath, 'utf8');
const smoke = readFileSync(smokePath, 'utf8');

describe('Banco de Notas remote D1 homologation safeguards', () => {
  it('provisions only the homologation database through the current Wrangler contract', () => {
    expect(provision).toContain("$databaseName = 'banco-notas-homologation'");
    expect(provision).toContain('wrangler d1 list --json');
    expect(provision).toContain('wrangler d1 create $databaseName');
    expect(provision).not.toMatch(/wrangler\s+d1\s+create[^\r\n]*--json/iu);
    expect(provision).not.toContain('api.cloudflare.com/client/v4/accounts');
    expect(provision).toContain("$accountId -notmatch '^[0-9a-fA-F]{32}$'");
    expect(provision).toContain('Mais de um D1 chamado $databaseName foi encontrado');
  });

  it('locks the remote migration set to 0001 through 0007 before applying it', () => {
    const expectedMigrations = [
      '0001_banco_notas_foundation.sql',
      '0002_banco_notas_cross_year_integrity.sql',
      '0003_banco_notas_import_job_state_machine.sql',
      '0004_banco_notas_import_finding_resolution.sql',
      '0005_banco_notas_import_analysis.sql',
      '0006_banco_notas_import_analysis_profiles.sql',
      '0007_banco_notas_teacher_entra_identity.sql',
    ];
    for (const migration of expectedMigrations) expect(provision).toContain(migration);
    expect(provision).toContain('wrangler d1 migrations apply BANCO_NOTAS_DB --remote');
  });

  it('is locked to homologation and requires explicit synthetic-write acknowledgement', () => {
    expect(smoke).toContain("$expectedDatabaseName = 'banco-notas-homologation'");
    expect(smoke).toContain('[switch]$ConfirmSyntheticWrites');
    expect(smoke).toContain('if (-not $ConfirmSyntheticWrites)');
    expect(smoke).toContain('database_name deve ser exatamente $expectedDatabaseName');
  });

  it('never provisions, migrates, deploys, or successfully enables sync', () => {
    const directModelSync = 'Invoke-D1 -Sql "UPDATE teacher_models SET sync_enabled = 1';
    const failedSyncGuard = "Assert-D1Failure -Label 'teacher model sync without Entra identity'";

    expect(smoke).not.toMatch(/wrangler\s+d1\s+create/iu);
    expect(smoke).not.toMatch(/wrangler\s+d1\s+migrations\s+apply/iu);
    expect(smoke).not.toMatch(/wrangler\s+(?:pages\s+)?deploy/iu);
    expect(smoke).not.toContain(directModelSync);
    expect(smoke).not.toMatch(/UPDATE\s+source_assignments[\s\S]*sync_enabled/iu);
    expect(smoke).toContain(failedSyncGuard);
  });

  it('verifies migrations 0005 and 0007 before synthetic writes', () => {
    const migration5 = "name LIKE '0005_banco_notas_import_analysis%'";
    const migration7 = "name LIKE '0007_banco_notas_teacher_entra_identity%'";
    const firstSyntheticWrite = 'INSERT INTO school_years';

    expect(smoke).toContain("$databaseBinding = 'BANCO_NOTAS_DB'");
    expect(smoke).toContain('/d1/database/$($database.database_id)/query');
    expect(smoke).toContain('Invoke-RestMethod -Method Post -Uri $script:d1Endpoint');
    expect(smoke).toContain(migration5);
    expect(smoke).toContain(migration7);
    expect(smoke.indexOf(migration7)).toBeLessThan(smoke.indexOf(firstSyntheticWrite));
  });

  it('covers the critical remote migration invariants using synthetic identifiers', () => {
    expect(smoke).toContain('teacher model entra identity required for sync');
    expect(smoke).toContain('duplicate teacher Entra identity');
    expect(smoke).toContain('authoritative source assignment overlap');
    expect(smoke).toContain('source assignment year mismatch');
    expect(smoke).toContain('invalid import job state transition');
    expect(smoke).toContain('import job analysis artifact required');
    expect(smoke).toContain('import analysis provenance mismatch');
    expect(smoke).toContain('import_analyses are append-only');
    expect(smoke).toContain('import job state re-entry is not allowed');
    expect(smoke).toContain('import_finding_resolutions are append-only');
    expect(smoke).toContain('Pessoa sintética smoke');
    expect(smoke).toContain('smoke-remote');
  });
});
