// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Banco de Notas production build configuration', () => {
  it('injects the public NAA identifiers into every CI and production build', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toContain(
      'VITE_BANCO_NOTAS_ADDIN_CLIENT_ID: 73ab83d3-00ba-494a-a1f8-586d250d420a',
    );
    expect(workflow).toContain('VITE_TENANT_ID: f04e0fa3-b8dc-4f77-be3c-7dfda0635188');
    expect(workflow).toContain("VITE_BANCO_NOTAS_RUNTIME_HOMOLOGATION: '0'");
    expect(workflow.indexOf('env:')).toBeLessThan(workflow.indexOf('jobs:'));
    expect(workflow.match(/assert-banco-notas-addin-build\.mjs/gu)).toHaveLength(3);
  });
});
