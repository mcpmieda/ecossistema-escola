import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const contract = readFileSync(
  join(process.cwd(), 'api/banco-notas-turmas-alunos-v1.openapi.yaml'),
  'utf8',
);
describe('Banco de Notas Turmas e Alunos contract', () => {
  it('documents all connected endpoints and administrative authorization', () => {
    expect(contract).toContain('/v1/turmas:');
    expect(contract).toContain('/v1/turmas/{classGroupId}:');
    expect(contract).toContain('/v1/alunos:');
    expect(contract).toContain('/v1/alunos/{studentId}:');
    expect(contract).toContain('x-required-capability: grades.analytics.read');
  });
  it('bounds pagination and preserves snapshot semantics', () => {
    expect(contract).toContain('maximum: 100');
    expect(contract).toContain('Zero continua sendo valor numérico válido');
    expect(contract).toContain('snapshot inexistente não é fabricado');
  });
});
