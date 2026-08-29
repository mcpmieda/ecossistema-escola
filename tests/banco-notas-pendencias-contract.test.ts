import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  pendenciasFilterQuerySchema,
  pendenciasListQuerySchema,
  pendingKindSchema,
} from '../shared/banco-notas-pendencias';

const openapi = readFileSync(
  join(process.cwd(), 'api/banco-notas-central-pendencias-v1.openapi.yaml'),
  'utf8',
);
const semantic = readFileSync(
  join(process.cwd(), 'specs/banco-notas/semantic-contract.json'),
  'utf8',
);

describe('Banco de Notas Central de Pendências contracts', () => {
  it('parses the limited factual taxonomy and all server-side filters', () => {
    expect(pendingKindSchema.options).toContain('source_missing');
    expect(pendingKindSchema.options).toContain('orphan_assignment');
    expect(
      pendenciasListQuerySchema.parse({
        severity: 'warning',
        kind: 'model_missing',
        status: 'open',
        q: 'Modelo',
      }),
    ).toMatchObject({ page: 1, pageSize: 20 });
    expect(pendenciasFilterQuerySchema.safeParse({ severity: 'critical' }).success).toBe(false);
  });

  it('documents summary, list and detail as read-only capability-governed endpoints', () => {
    for (const path of [
      '/v1/pendencias/summary:',
      '/v1/pendencias:',
      '/v1/pendencias/{pendingId}:',
    ]) {
      expect(openapi).toContain(path);
    }
    expect(openapi.match(/x-required-capability: grades\.analytics\.read/gu)).toHaveLength(3);
    expect(openapi).not.toMatch(/^\s{4}(post|patch|delete):/gmu);
  });

  it('keeps technical identity and storage data outside the DTO contract', () => {
    expect(openapi).not.toMatch(
      /entra_object_id|drive_item_id|recipient_upn|access_token|storage_path|sql/iu,
    );
    expect(openapi).toContain('contextLinks');
    expect(openapi).toContain('origin:');
    expect(openapi).toContain('evidence:');
  });

  it('keeps Central V1 in the semantic contract as diagnostic and read-only', () => {
    expect(semantic).toContain('BN-INV-021');
    expect(semantic).toContain('BN-AC-017');
    expect(semantic).toContain('não oferece resolução automática');
  });
});
