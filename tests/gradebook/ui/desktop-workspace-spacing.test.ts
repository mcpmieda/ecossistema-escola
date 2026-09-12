import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

describe('Banco de Notas desktop workspace spacing', () => {
  it('uses the available workspace width without changing the other platform pages', () => {
    expect(app).toContain("route === 'banco-de-notas'");
    expect(app).toContain("'w-full px-4 py-4 sm:px-5 lg:px-5'");
    expect(app).toContain(
      "'mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8'",
    );
  });
});
