import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
describe('Banco de Notas shell', () => {
  it('uses a mature router and exposes the functional source settings route', () => {
    expect(source).toContain("from 'react-router-dom'");
    expect(source).toContain('/configuracoes/fonte');
    expect(source).toContain('/v1/source-assignments');
    expect(source).toContain('/v1/data-sources');
  });

  it('uses native HeroUI form primitives instead of hand-styled HTML controls', () => {
    expect(source).toMatch(/\bTextField\b/u);
    expect(source).toMatch(/\bInput\b/u);
    expect(source).toMatch(/\bSelect\b/u);
    expect(source).toMatch(/\bSwitch\b/u);
    expect(source).toMatch(/\bListBox\b/u);
    expect(source).not.toMatch(/<(?:input|select|option)\b/iu);
  });

  it('does not activate synchronization implicitly', () => {
    expect(source).toContain("useState(false)");
    expect(source).toContain('setSyncEnabled(false)');
    expect(source).toContain('isSelected={syncEnabled}');
  });

  it('keeps prohibited UI stacks and Ambient out of the module', () => {
    expect(source).not.toMatch(/shadcn|reui|ambient.?constellation/iu);
  });

  it('supports audited editing of source and assignment state', () => {
    expect(source).toContain("method: 'PATCH'");
    expect(source).toContain('Motivo da alteração');
    expect(source).toContain('migrationState');
    expect(source).toContain('sourceEnvironment');
  });
});
