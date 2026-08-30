import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workflow = readFileSync(join(root, '.github/workflows/banco-notas-production.yml'), 'utf8');
const script = readFileSync(
  join(root, 'infra/banco-notas/cloudflare/production-read-only.ps1'),
  'utf8',
);

describe('Banco de Notas production control plane', () => {
  it('allows only snapshot and read-only deployment from exact main/RC inputs', () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('- snapshot');
    expect(workflow).toContain('- deploy-read-only');
    expect(workflow).not.toMatch(/set-sync|enable-sync|pilot-write/iu);
    expect(script).toContain("[ValidateSet('snapshot', 'deploy-read-only')]");
    expect(script).toContain('DEPLOY_BANCO_NOTAS_READ_ONLY');
    expect(script).toContain('GITHUB_SHA');
    expect(script).toContain('ExpectedDeploymentId');
  });

  it('backs up before all eight migrations and proves every mutable sync gate is zero', () => {
    const exportIndex = script.indexOf("'d1', 'export'");
    const migrationIndex = script.indexOf("'d1', 'migrations', 'apply'");
    expect(exportIndex).toBeGreaterThan(0);
    expect(migrationIndex).toBeGreaterThan(exportIndex);
    expect(script).toContain("'0008_banco_notas_sync_v1.sql'");
    expect(script).toContain('[int]$row.sync_enabled -ne 0');
    expect(script).toContain('[int]$row.commit_route_enabled -ne 0');
    expect(script).toContain('[int]$row.pilot_count -ne 0');
    expect(script).toContain('[int]$row.migration_count -ne 8');
  });

  it('uses a dedicated database/binding and emits sanitized evidence', () => {
    expect(script).toContain("$databaseName = 'banco-notas-production'");
    expect(script).toContain("$bindingName = 'BANCO_NOTAS_DB'");
    expect(script).toContain('BANCO_NOTAS_ADDIN_CONTEXT_ENABLED');
    expect(script).toContain('secretsIncluded = $false');
    expect(script).toContain('rawEnvironmentValuesIncluded = $false');
    expect(script).toContain('Assert-NoUnexpectedResourceBindings');
  });
});
