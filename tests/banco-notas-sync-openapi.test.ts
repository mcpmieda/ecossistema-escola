import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncReasonCodeSchema } from '../shared/banco-notas-sync';

const spec = readFileSync(join(process.cwd(), 'api/banco-notas-sync-v1.openapi.yaml'), 'utf8');

describe('Banco de Notas Sync OpenAPI', () => {
  it('documents every write, outcome and administrative attempt route', () => {
    for (const path of [
      '/v1/addin/sync/preflight:',
      '/v1/addin/sync/commit:',
      '/v1/addin/sync/outcome:',
      '/v1/sync/attempts:',
      '/v1/sync/attempts/{requestId}:',
      '/v1/sync/readiness:',
    ])
      expect(spec).toContain(path);
    expect(spec.match(/x-required-capability: grades\.analytics\.read/gu)).toHaveLength(3);
  });
  it('keeps the reason-code enum and baseline contract complete', () => {
    for (const code of syncReasonCodeSchema.options) expect(spec).toContain(code);
    expect(spec).toContain('baselineEventId:');
    expect(spec).toContain('baselineSequence:');
  });
  it('does not document client-controlled canonical or identity fields', () => {
    const requestSchemas = spec.slice(
      spec.indexOf('    Workbook:'),
      spec.indexOf('    ReasonCode:'),
    );
    expect(requestSchemas).not.toMatch(/\b(gradeKey|sourceId|teacherModelId|actorId|oid)\b/gu);
    expect(spec).not.toMatch(/access_token|raw jwt|value_numeric|value_text/iu);
  });
});
