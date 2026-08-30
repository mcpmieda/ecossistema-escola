import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
describe('Banco de Notas shell', () => {
  it('uses a mature router and exposes the empty settings route', () => {
    expect(source).toContain("from 'react-router-dom'");
    expect(source).toContain('path="configuracoes"');
    expect(source).toContain('<EmptyPage title="Configurações"');
    expect(source).not.toContain('/configuracoes/fonte');
  });

  it('keeps Visão geral and Configurações free of inherited controls', () => {
    expect(source).toContain('<Route index element={<EmptyPage title="Visão geral" />} />');
    expect(source).not.toMatch(/\bTextField\b|\bInput\b|\bSelect\b|\bSwitch\b|\bListBox\b/u);
    expect(source).not.toContain('/v1/source-assignments');
    expect(source).not.toContain('/v1/data-sources');
  });

  it('does not expose synchronization controls in the cleaned shell', () => {
    expect(source).not.toContain('setSyncEnabled');
    expect(source).not.toContain('isSelected={syncEnabled}');
  });

  it('keeps prohibited UI stacks and Ambient out of the module', () => {
    expect(source).not.toMatch(/shadcn|reui|ambient.?constellation/iu);
  });

  it('does not retain the removed configuration mutation hierarchy', () => {
    expect(source).not.toContain("method: 'PATCH'");
    expect(source).not.toContain('Motivo da alteração');
    expect(source).not.toContain('migrationState');
    expect(source).not.toContain('sourceEnvironment');
  });
});
