import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
describe('Banco de Notas shell', () => {
  it('uses a mature router and exposes the functional source settings route', () => {
    expect(source).toContain("from 'react-router-dom'");
    expect(source).toContain('/configuracoes/fonte');
    expect(source).toContain('/v1/source-assignments');
  });
  it('does not activate synchronization implicitly', () =>
    expect(source).toContain("data.get('syncEnabled') === 'on'"));
  it('keeps prohibited UI stacks and Ambient out of the module', () => {
    expect(source).not.toMatch(/shadcn|reui|ambient.?constellation/iu);
  });
});
