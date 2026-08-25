import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const openapi = readFileSync(join(root, 'api/banco-notas-grade-events-v1.openapi.yaml'), 'utf8');
const asyncapi = readFileSync(
  join(root, 'api/banco-notas-grade-events-v1.asyncapi.yaml'),
  'utf8',
);

describe('Banco de Notas grade-event contracts', () => {
  it('uses the definitive same-origin Banco API instead of the POC host', () => {
    expect(openapi).toContain('https://admin.escolaieda.com/api/banco-notas');
    expect(asyncapi).toContain('host: admin.escolaieda.com');
    expect(asyncapi).toContain('pathname: /api/banco-notas');
    expect(openapi).not.toContain('https://api.escolaieda.com');
    expect(asyncapi).not.toContain('host: api.escolaieda.com');
  });

  it('preserves idempotency, stale and absence semantics', () => {
    expect(openapi).toContain('Idempotency-Key');
    expect(openapi).toContain('enum: [applied, stale, duplicate, queued, rejected]');
    expect(openapi).toContain('isAbsent');
    expect(openapi).toContain('Zero continua sendo valor numérico válido');
    expect(asyncapi).toContain('enum: [applied, stale, duplicate, queued, rejected]');
    expect(asyncapi).toContain('Ausência explícita; zero permanece valor numérico válido.');
  });

  it('does not invent an Entra audience, scope or client secret before provisioning', () => {
    expect(openapi).toContain('Audience e delegated scope definitivos');
    expect(openapi).toContain('O add-in não');
    expect(openapi).not.toMatch(/client_secret|clientSecret/iu);
    expect(openapi).not.toMatch(/f04e0fa3-b8dc-4f77-be3c-7dfda0635188/iu);
  });

  it('binds events to explicit source and teacher model identifiers', () => {
    expect(openapi).toContain('- dataSourceId');
    expect(openapi).toContain('- teacherModelId');
    expect(openapi).toContain('- field');
    expect(asyncapi).toContain('teacherModelId:');
    expect(asyncapi).toContain('sourceId:');
  });
});
