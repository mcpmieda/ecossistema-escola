import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/features/gradebook/import/sheetjs-loader.ts'),
  'utf8',
);

describe('SheetJS CDN integrity pin', () => {
  it('locks the exact authoritative 0.20.3 browser artifact and SRI', () => {
    expect(source).toContain(
      "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
    );
    expect(source).toContain(
      "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT",
    );
    expect(source).toContain("script.integrity = SHEETJS_INTEGRITY");
    expect(source).toContain("script.crossOrigin = 'anonymous'");
  });

  it('does not allow an unversioned SheetJS URL', () => {
    expect(source).not.toMatch(/xlsx-(?:latest|next)/u);
    expect(source).not.toContain('cdn.sheetjs.com/package/');
  });
});
