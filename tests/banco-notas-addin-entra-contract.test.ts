// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bancoNotasAddinEntraContractSchema,
  resolveBancoNotasAddinEntraContract,
} from '../shared/banco-notas-addin-entra';

const root = process.cwd();
const contract = JSON.parse(
  readFileSync(join(root, 'specs/banco-notas/addin-entra-registration.json'), 'utf8'),
) as unknown;
const provisioningScript = readFileSync(
  join(root, 'infra/entra/prepare-banco-notas-addin-homologation.ps1'),
  'utf8',
);
const router = readFileSync(join(root, 'functions/[[path]].ts'), 'utf8');
const envExample = readFileSync(join(root, '.env.example'), 'utf8');

const applicationClientId = '11111111-1111-4111-8111-111111111111';

describe('Banco de Notas Entra add-in homologation contract', () => {
  it('separates the v2 token audience from the resource scope URI', () => {
    const parsed = bancoNotasAddinEntraContractSchema.parse(contract);
    const resolved = resolveBancoNotasAddinEntraContract(parsed, applicationClientId);

    expect(resolved.signInAudience).toBe('AzureADMyOrg');
    expect(resolved.resourceApplicationIdUri).toBe(`api://${applicationClientId}`);
    expect(resolved.tokenAudience).toBe(applicationClientId);
    expect(resolved.authorizedParty).toBe(applicationClientId);
    expect(resolved.delegatedScope).toMatchObject({
      value: 'BancoNotas.Sync',
      type: 'Admin',
      isEnabled: true,
    });
    expect(resolved.requestedScope).toBe(`api://${applicationClientId}/BancoNotas.Sync`);
    expect(resolved.spaRedirectUris).toEqual([
      'brk-multihub://admin.escolaieda.com',
      'https://admin.escolaieda.com/banco-de-notas/addin/taskpane.html',
    ]);
    expect(resolved.requiredResourceAccess).toEqual([]);
    expect(resolved.credentials).toBe('none');
    expect(resolved.publicRouteEnabled).toBe(false);
    expect(resolved.syncEnabled).toBe(false);
  });

  it('fails closed on multitenant, user-consent or Graph-permission drift', () => {
    const parsed = bancoNotasAddinEntraContractSchema.parse(contract);

    expect(() =>
      bancoNotasAddinEntraContractSchema.parse({
        ...parsed,
        signInAudience: 'AzureADMultipleOrgs',
      }),
    ).toThrow();
    expect(() =>
      bancoNotasAddinEntraContractSchema.parse({
        ...parsed,
        delegatedScope: { ...parsed.delegatedScope, type: 'User' },
      }),
    ).toThrow();
    expect(() =>
      bancoNotasAddinEntraContractSchema.parse({
        ...parsed,
        requiredResourceAccess: [{ resourceAppId: 'graph' }],
      }),
    ).toThrow();
  });

  it('keeps provisioning plan-only, least-privileged and credential-free', () => {
    expect(provisioningScript).toContain('[switch] $Apply');
    expect(provisioningScript).toContain("'Application.Read.All'");
    expect(provisioningScript).toContain("'Application.ReadWrite.All'");
    expect(provisioningScript).not.toContain("'Directory.Read.All'");
    expect(provisioningScript).toContain('-ContextScope Process');
    expect(provisioningScript).toContain('credentialsCreated           = $false');
    expect(provisioningScript).toContain('graphPermissionsRequested    = @()');
    expect(provisioningScript).toContain('requiredResourceAccess = @()');
    expect(provisioningScript).toContain('tokenAudience');
    expect(provisioningScript).toContain('authorizedParty');
    expect(provisioningScript).not.toContain('/addPassword');
    expect(provisioningScript).not.toContain('client_secret');
    expect(provisioningScript).not.toContain('passwordCredential =');
  });

  it('does not activate runtime variables, public routing or sync', () => {
    expect(envExample).toContain('BANCO_NOTAS_ADDIN_AUDIENCE=');
    expect(envExample).toContain('BANCO_NOTAS_ADDIN_SCOPE=');
    expect(envExample).not.toMatch(/BANCO_NOTAS_ADDIN_(?:AUDIENCE|SCOPE)=\S+/u);
    expect(router).not.toContain('routeBancoNotasAddinApi');
  });
});
