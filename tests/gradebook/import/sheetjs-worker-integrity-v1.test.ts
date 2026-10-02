import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  SHEETJS_INTEGRITY_V1,
  SHEETJS_VERSION_V1,
} from '../../../src/features/gradebook/import/sheetjs-source-v1';
import { loadRealSheetJsV1 } from '../fixtures/sheetjs-real-v1';

describe('same full official SheetJS artifact for the local executor and fallback', () => {
  it('keeps the unmodified bytes, fixed integrity and actual library version', async () => {
    const bytes = await readFile('public/vendor/sheetjs/0.20.3/xlsx.full.min.js.txt');
    expect('sha384-' + createHash('sha384').update(bytes).digest('base64')).toBe(
      SHEETJS_INTEGRITY_V1,
    );
    const xlsx = await loadRealSheetJsV1();
    expect(xlsx.version).toBe(SHEETJS_VERSION_V1);
    // Full standalone preserves legacy codecs; it is not the smaller ESM/npm substitute.
    expect(typeof xlsx.read).toBe('function');
    expect(typeof xlsx.write).toBe('function');
    expect(await readFile('public/vendor/sheetjs/0.20.3/LICENSE', 'utf8')).toContain(
      'Apache License',
    );
  });
});
