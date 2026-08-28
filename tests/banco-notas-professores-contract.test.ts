import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  professorDetailQuerySchema,
  professoresListQuerySchema,
} from '../shared/banco-notas-professores';

const openapi = readFileSync(
  join(process.cwd(), 'api/banco-notas-professores-v1.openapi.yaml'),
  'utf8',
);
const semantic = readFileSync(
  join(process.cwd(), 'specs/banco-notas/semantic-contract.json'),
  'utf8',
);

describe('Banco de Notas Professores contracts', () => {
  it('parses all supported list filters and defaults pagination', () => {
    expect(
      professoresListQuerySchema.parse({
        status: 'active',
        identity: 'linked',
        modelState: 'connected',
        assignment: 'with',
        attention: 'needs_attention',
      }),
    ).toMatchObject({ page: 1, pageSize: 20 });
    expect(professorDetailQuerySchema.parse({})).toEqual({});
  });

  it('documents all read-only endpoints, capability and safe identity boundary', () => {
    for (const path of [
      '/v1/professores/filters:',
      '/v1/professores:',
      '/v1/professores/{teacherId}:',
    ])
      expect(openapi).toContain(path);
    expect(openapi).toContain('x-required-capability: grades.analytics.read');
    expect(openapi).toContain('identityState');
    expect(openapi).toContain('fileAvailable');
    expect(openapi).not.toMatch(/entra_object_id|drive_item_id|recipient_upn|claims:/u);
  });

  it('keeps Professores V1 in the module semantic contract', () => {
    expect(semantic).toContain('BN-INV-019');
    expect(semantic).toContain('BN-AC-015');
    expect(semantic).toContain('não cria identidade paralela');
  });
});
