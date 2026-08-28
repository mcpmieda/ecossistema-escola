import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesquisaGlobalQuerySchema } from '../shared/banco-notas-pesquisa';

const openapi = readFileSync(
  join(process.cwd(), 'api/banco-notas-pesquisa-global-v1.openapi.yaml'),
  'utf8',
);
const semantic = readFileSync(
  join(process.cwd(), 'specs/banco-notas/semantic-contract.json'),
  'utf8',
);

describe('Banco de Notas Pesquisa Global contracts', () => {
  it('defaults bounds and normalizes the entity selector', () => {
    expect(pesquisaGlobalQuerySchema.parse({ q: 'Ana' })).toEqual({ q: 'Ana', limitPerType: 6 });
    expect(
      pesquisaGlobalQuerySchema.parse({ q: 'Ana', types: 'teachers,students,teachers' }),
    ).toMatchObject({ types: ['teachers', 'students'] });
    expect(() => pesquisaGlobalQuerySchema.parse({ q: 'A' })).toThrow();
  });

  it('documents the capability, bounds, buckets and privacy boundary', () => {
    expect(openapi).toContain('/v1/pesquisa:');
    expect(openapi).toContain('x-required-capability: grades.analytics.read');
    expect(openapi).toContain('limitPerType');
    expect(openapi).toContain('classGroups');
    expect(openapi).toContain('hasMore');
    expect(openapi).not.toMatch(/entra_object_id|drive_item_id|recipient_upn|externalId|claims:/u);
  });

  it('keeps Pesquisa Global in the semantic contract', () => {
    expect(semantic).toContain('BN-INV-020');
    expect(semantic).toContain('BN-AC-016');
    expect(semantic).toContain('não executa ranking no navegador');
  });
});
