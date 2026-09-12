import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pages = readFileSync(join(process.cwd(), 'src/platform/pages.tsx'), 'utf8');

describe('administrative session settings UI', () => {
  it('renders the session policy before the institutional configuration registry', () => {
    const setting = pages.indexOf('<SessionDurationSetting />');
    const registry = pages.indexOf('<Card.Title>Registro de configurações</Card.Title>');

    expect(setting).toBeGreaterThan(-1);
    expect(registry).toBeGreaterThan(setting);
  });

  it('loads and updates the policy through the authenticated server route', () => {
    expect(pages).toContain("fetch('/api/platform/settings/session'");
    expect(pages).toContain("method: 'POST'");
    expect(pages).toContain('A atividade não renova o prazo indefinidamente.');
  });
});
