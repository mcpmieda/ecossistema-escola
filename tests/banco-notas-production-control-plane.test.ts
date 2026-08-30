import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workflow = readFileSync(join(root, '.github/workflows/banco-notas-production.yml'), 'utf8');
const ciWorkflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
const productionWrangler = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
const script = readFileSync(
  join(root, 'infra/banco-notas/cloudflare/production-read-only.ps1'),
  'utf8',
);
const mtlsProjectFixture = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/cloudflare-pages-project-with-mtls.json'), 'utf8'),
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
    const bookmarkIndex = script.indexOf('Get-D1TimeTravelBookmark -Database $database');
    const exportIndex = script.indexOf("'d1', 'export'");
    const migrationIndex = script.indexOf("'d1', 'migrations', 'apply'");
    expect(bookmarkIndex).toBeGreaterThan(0);
    expect(exportIndex).toBeGreaterThan(bookmarkIndex);
    expect(exportIndex).toBeGreaterThan(0);
    expect(migrationIndex).toBeGreaterThan(exportIndex);
    expect(script).toContain("'--skip-confirmation'");
    expect(script).not.toContain("'--yes'");
    expect(script).toContain("'0008_banco_notas_sync_v1.sql'");
    expect(script).toContain('[int]$row.sync_enabled -ne 0');
    expect(script).toContain('[int]$row.commit_route_enabled -ne 0');
    expect(script).toContain('[int]$row.pilot_count -ne 0');
    expect(script).toContain('[int]$row.migration_count -ne 8');
    expect(script).toContain("mechanism = 'cloudflare-d1-time-travel'");
    expect(script).toContain('Remove-Item -LiteralPath $backupPath -Force');
    expect(script).toMatch(/'d1', 'export'[\s\S]*?\) -SuppressOutput/u);
    expect(workflow).not.toContain('banco-notas-production-pre-migration.sql');
  });

  it('fails closed when the existing production configuration contains mTLS bindings', () => {
    const mtlsBindings = mtlsProjectFixture.deployment_configs.production.mtls_certificates;
    expect(Object.keys(mtlsBindings)).toEqual(['ERP_CLIENT_CERT']);
    expect(script).toContain("$property.Name -eq 'mtls_certificates'");
    expect(script).toContain('Binding de produção inesperado');
  });

  it('uses a dedicated database/binding and emits sanitized evidence', () => {
    expect(script).toContain("$databaseName = 'banco-notas-production'");
    expect(script).toContain("$bindingName = 'BANCO_NOTAS_DB'");
    expect(script).toContain('BANCO_NOTAS_ADDIN_CONTEXT_ENABLED');
    expect(script).toContain('secretsIncluded = $false');
    expect(script).toContain('rawEnvironmentValuesIncluded = $false');
    expect(script).toContain('Assert-NoUnexpectedResourceBindings');
    expect(script).toContain('deployment_trigger.metadata.commit_hash -ne $ExpectedReleaseSha');
    expect(script).toContain("latest_stage.status -ne 'success'");
    expect(script).toContain("Get-NamedProperty -Value $Project -Name 'canonical_deployment'");
    expect(script).toContain("configPath = '../banco-notas-production/wrangler.jsonc'");
    expect(script).toContain("'pages', 'deploy', 'dist'");
    expect(script).not.toContain("'pages', 'deploy', '../../dist', '--cwd'");
    expect(script).not.toContain('keep_vars');
    expect(script).toContain("if ($variableType -eq 'plain_text')");
    expect(script).toContain("if ($variableType -ne 'secret_text')");
    expect(script).toContain('$productionVars[$variableName]');
  });

  it('keeps the production D1 binding and fail-closed add-in context on every main deploy', () => {
    expect(ciWorkflow).toContain('npx wrangler pages deploy dist');
    expect(productionWrangler).toContain('"binding": "BANCO_NOTAS_DB"');
    expect(productionWrangler).toContain('"database_name": "banco-notas-production"');
    expect(productionWrangler).toContain('"database_id": "e59579db-aa8b-4589-a02e-643cb4277b5f"');
    expect(productionWrangler).toContain('"RUNTIME_ENVIRONMENT": "production"');
    expect(productionWrangler).toContain('"BANCO_NOTAS_ADDIN_CONTEXT_ENABLED": "1"');
  });

  it('does not collide with the PowerShell automatic Matches variable while resolving D1', () => {
    const resolver = script.slice(
      script.indexOf('function Resolve-ProductionDatabase'),
      script.indexOf('function New-ProductionConfig'),
    );
    expect(resolver).toContain('$databaseMatches');
    expect(resolver).not.toMatch(/\$matches\b/iu);
    expect(resolver).toContain('return $databaseMatches[0]');
  });
});
