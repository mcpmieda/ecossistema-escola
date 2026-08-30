// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBancoNotasNaaConfig } from '../addin/banco-notas/config';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Banco de Notas NAA client', () => {
  it('derives authority, dedicated redirect and self API scope from runtime configuration', () => {
    const clientId = '11111111-1111-4111-8111-111111111111';
    const tenantId = '22222222-2222-4222-8222-222222222222';
    expect(
      createBancoNotasNaaConfig({
        clientId,
        tenantId,
        origin: 'https://admin.escolaieda.com',
      }),
    ).toMatchObject({
      clientId,
      tenantId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: 'https://admin.escolaieda.com/banco-de-notas/addin/auth',
      requestedScope: `api://${clientId}/BancoNotas.Sync`,
      delegatedScope: 'BancoNotas.Sync',
    });
  });

  it('fails closed when build-time IDs are absent or malformed', () => {
    expect(() => createBancoNotasNaaConfig({ origin: 'https://admin.escolaieda.com' })).toThrow(
      'NAA_CONFIG_INVALID',
    );
    expect(() =>
      createBancoNotasNaaConfig({
        clientId: 'api://wrong',
        tenantId: 'wrong',
        origin: 'https://admin.escolaieda.com',
      }),
    ).toThrow('NAA_CONFIG_INVALID');
  });

  it('keeps the MSAL v5 redirect bridge isolated and no-store at the hosting layer', () => {
    const auth = read('addin/banco-notas/auth.html');
    const headers = read('public/_headers');
    expect(auth).toContain('@azure/msal-browser/redirect-bridge');
    expect(auth).toContain('broadcastResponseToMainFrame');
    expect(auth).not.toContain('office.js');
    expect(headers).toContain('/banco-de-notas/addin/*');
    expect(headers).toContain('! X-Frame-Options');
    expect(headers).toContain('Cache-Control: no-store');
    expect(
      createBancoNotasNaaConfig({
        clientId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
        origin: 'https://admin.escolaieda.com',
      }).redirectUri,
    ).not.toMatch(/\.html$/u);
  });

  it('keeps anti-framing globally and allows only Microsoft Office ancestors on add-in assets', () => {
    const headers = read('public/_headers');
    const addinHeaders = headers.slice(headers.indexOf('/banco-de-notas/addin/*'));
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(addinHeaders).toContain('! Content-Security-Policy');
    expect(addinHeaders.indexOf('! Content-Security-Policy')).toBeLessThan(
      addinHeaders.indexOf('Content-Security-Policy:'),
    );
    expect(addinHeaders).toContain(
      'frame-ancestors https://*.officeapps.live.com https://*.office.com https://*.microsoft365.com https://*.sharepoint.com',
    );
  });

  it('ships an Excel command manifest and never hardcodes tenant or client IDs in client code', () => {
    const manifest = read('addin/banco-notas/manifest.xml');
    const taskpane = read('addin/banco-notas/taskpane.tsx');
    expect(manifest).toContain('VersionOverridesV1_0');
    expect(manifest).toContain('xsi:type="Workbook"');
    expect(manifest).toContain('/banco-de-notas/addin/taskpane.html');
    expect(taskpane).toContain("isSetSupported?.('NestedAppAuth', '1.1')");
    expect(taskpane).toContain('rawAccessTokenIncluded: false');
    expect(taskpane).toContain('claimsIncluded: false');
    expect(taskpane).toContain('tenantIdIncluded: false');
    expect(taskpane).toContain('BrowserCacheLocation.MemoryStorage');
    expect(taskpane).toContain('pca.current.acquireTokenPopup(request)');
    expect(taskpane).not.toContain('pca.current.ssoSilent(request)');
    expect(taskpane).not.toContain("cacheLocation: 'localStorage'");
    expect(taskpane).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
    );
    expect(taskpane).not.toContain('console.');
  });
});
