import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const contract = readFileSync(
  join(process.cwd(), 'api/banco-notas-acompanhamento-v1.openapi.yaml'),
  'utf8',
);

describe('Banco de Notas Acompanhamento contract', () => {
  it('documents the three connected same-origin endpoints', () => {
    expect(contract).toContain('https://admin.escolaieda.com/api/banco-notas');
    expect(contract).toContain('/v1/acompanhamento/summary:');
    expect(contract).toContain('/v1/acompanhamento/turmas:');
    expect(contract).toContain('/v1/acompanhamento/turmas/{classGroupId}:');
  });

  it('requires administrative analytics authorization and bounded pagination', () => {
    expect(contract).toContain('x-required-capability: grades.analytics.read');
    expect(contract).toContain('maximum: 100');
    expect(contract).toContain('Capability administrativa insuficiente');
  });

  it('preserves zero and absence as different facts', () => {
    expect(contract).toContain('numericZeroValues');
    expect(contract).toContain('absentValues');
    expect(contract).toContain('Zero continua sendo valor numérico válido');
  });
});
