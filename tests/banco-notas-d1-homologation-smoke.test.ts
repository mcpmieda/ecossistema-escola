import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const smokePath = join(root, 'infra/banco-notas/cloudflare/smoke-homologation.ps1');
const smoke = readFileSync(smokePath, 'utf8');

describe('Banco de Notas remote D1 homologation smoke safeguards', () => {
  it('is locked to the homologation database and requires explicit synthetic-write acknowledgement', () => {
    expect(smoke).toContain("$expectedDatabaseName = 'banco-notas-homologation'");
    expect(smoke).toContain('[switch]$ConfirmSyntheticWrites');
    expect(smoke).toContain('if (-not $ConfirmSyntheticWrites)');
    expect(smoke).toContain('database_name deve ser exatamente $expectedDatabaseName');
  });

  it('never provisions a database, applies migrations, deploys, or enables sync', () => {
    expect(smoke).not.toMatch(/wrangler\s+d1\s+create/iu);
    expect(smoke).not.toMatch(/wrangler\s+d1\s+migrations\s+apply/iu);
    expect(smoke).not.toMatch(/wrangler\s+(?:pages\s+)?deploy/iu);
    expect(smoke).not.toMatch(/sync_enabled\s*=\s*1/iu);
    expect(smoke).not.toMatch(/UPDATE\s+source_assignments[\s\S]*sync_enabled/iu);
  });

  it('targets the configured remote D1 through the Cloudflare API and verifies migration 0005 before synthetic writes', () => {
    expect(smoke).toContain("$databaseBinding = 'BANCO_NOTAS_DB'");
    expect(smoke).toContain('/d1/database/$($database.database_id)/query');
    expect(smoke).toContain('Invoke-RestMethod -Method Post -Uri $script:d1Endpoint');
    expect(smoke).toContain("name LIKE '0005_banco_notas_import_analysis%'");
    expect(smoke.indexOf("name LIKE '0005_banco_notas_import_analysis%'")).toBeLessThan(
      smoke.indexOf('INSERT INTO school_years'),
    );
  });

  it('covers the critical remote migration invariants using synthetic identifiers', () => {
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
