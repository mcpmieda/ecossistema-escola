// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8').replace(/\r\n/g, '\n');
const rule = (selector: string) =>
  styles.slice(styles.indexOf(`\n${selector} {\n`)).split('}\n')[0] ?? '';

describe('Banco de Notas desktop workspace spacing', () => {
  it('uses the available workspace width without changing the other platform pages', () => {
    // Since the shell of 07/10/2026 a service (an area with sections) takes the whole width
    // beside its side column; every other area keeps the centred 1480px page.
    expect(app).toContain("sections.length ? 'shell-main shell-main--service' : 'shell-main'");
    expect(rule('.shell-main')).toContain('max-width: 1480px;');
    expect(rule('.shell-main')).toContain('margin-inline: auto;');
    expect(rule('.shell-main--service')).toContain('max-width: none;');
  });
});
