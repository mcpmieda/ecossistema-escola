import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const router = readFileSync(join(root, 'functions/[[path]].ts'), 'utf8');
const env = readFileSync(join(root, 'server/env.ts'), 'utf8');
const bearer = readFileSync(join(root, 'server/auth/entra-access-token.ts'), 'utf8');
const addinApi = readFileSync(join(root, 'server/banco-notas/addin-api.ts'), 'utf8');

describe('Banco de Notas add-in exposure gate', () => {
  it('exposes context and governed sync routes behind an explicit fail-closed flag', () => {
    expect(router).not.toContain('routeGradeEventsApi');
    expect(router).not.toContain('verifyBancoNotasAddinToken');
    expect(router).toContain('routeBancoNotasAddinApi');
    expect(router).toContain("url.pathname === '/api/banco-notas/v1/addin/context'");
    expect(router).toContain("url.pathname.startsWith('/api/banco-notas/v1/addin/sync/')");
    expect(router).toContain("method(request, [isSyncRoute ? 'POST' : 'GET'])");
    expect(router).toContain('if (isSyncRoute) enforceWriteOrigin(request, env)');
    expect(router).toContain("env.BANCO_NOTAS_ADDIN_CONTEXT_ENABLED !== '1'");
    expect(addinApi).toContain('verifyBancoNotasAddinToken');
    expect(addinApi).toContain('assertTeacherModelOwner');
    expect(addinApi).toContain("input.source.kind !== 'excel-addin'");
  });

  it('prepares fail-closed audience and delegated scope configuration without inventing values', () => {
    expect(env).toContain('BANCO_NOTAS_ADDIN_AUDIENCE?: string');
    expect(env).toContain('BANCO_NOTAS_ADDIN_SCOPE?: string');
    expect(env).toContain('BANCO_NOTAS_ADDIN_CONTEXT_ENABLED?: string');
    expect(bearer).toContain(
      "throw new BearerConfigurationError('Banco de Notas add-in identity is not configured')",
    );
    expect(env).not.toMatch(/BANCO_NOTAS_ADDIN_(?:AUDIENCE|SCOPE)\s*[:=]\s*['"][^'"]+/u);
  });
});
