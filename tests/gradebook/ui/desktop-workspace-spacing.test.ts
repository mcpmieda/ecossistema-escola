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
    // Since the side-only composition of 08/10/2026 every area sits beside the side column and
    // takes the whole width that is left.
    expect(app).toContain('className="shell-main shell-main--service"');
    expect(rule('.shell-main--service')).toContain('max-width: none;');
  });
});
