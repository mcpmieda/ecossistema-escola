import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import type {
  SheetJs,
  Workbook,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import type { WorkbookFixtureV1 } from './workbook-reader-equivalence-v1';

export type RealSheetJsV1 = SheetJs & {
  write: (workbook: Workbook, options: Record<string, unknown>) => ArrayBuffer;
};

/** Same official bytes and integrity as the browser loader; no npm substitute/mock. */
export async function loadRealSheetJsV1(): Promise<RealSheetJsV1> {
  const source = await readFile('src/features/gradebook/import/sheetjs-source-v1.ts', 'utf8');
  const url = source.match(/const SHEETJS_SOURCE_V1\s*=\s*'([^']+)'/u)?.[1];
  const integrity = source.match(/sha384-[A-Za-z0-9+/=]+/u)?.[0];
  if (!url || !integrity) throw new Error('missing-project-sheetjs-pin');
  const cache = 'node_modules/.cache/gradebook-reader-v1';
  await mkdir(cache, { recursive: true });
  const path = join(cache, 'sheetjs-0.20.3.js');
  let bytes: Buffer;
  try {
    bytes = await readFile('public/vendor/sheetjs/0.20.3/xlsx.full.min.js.txt');
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`sheetjs-download-http-${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (`sha384-${createHash('sha384').update(bytes).digest('base64')}` !== integrity)
      throw new Error('sheetjs-integrity-mismatch');
    await writeFile(path, bytes);
  }
  if (`sha384-${createHash('sha384').update(bytes).digest('base64')}` !== integrity)
    throw new Error('sheetjs-integrity-mismatch');
  const context = {
    ArrayBuffer,
    Uint8Array,
    Date,
    Buffer,
    TextEncoder,
    TextDecoder,
    XLSX: undefined as RealSheetJsV1 | undefined,
  };
  runInNewContext(bytes.toString(), context, { filename: 'sheetjs-pinned-0.20.3' });
  if (context.XLSX?.version !== '0.20.3') throw new Error('sheetjs-version-mismatch');
  return context.XLSX;
}

export function writeRealWorkbookV1(
  xlsx: RealSheetJsV1,
  workbook: WorkbookFixtureV1,
  format: 'xls' | 'xlsb' | 'xlsx',
): ArrayBuffer {
  const copy = structuredClone(workbook);
  for (const sheet of Object.values(copy.Sheets)) {
    for (const [address, value] of Object.entries(sheet)) {
      if (address.startsWith('!') || !value || typeof value !== 'object') continue;
      const cell = value as { t?: string; v?: unknown };
      if (!cell.t)
        cell.t =
          cell.v instanceof Date
            ? 'd'
            : typeof cell.v === 'boolean'
              ? 'b'
              : typeof cell.v === 'string'
                ? 's'
                : 'n';
    }
  }
  return new Uint8Array(
    xlsx.write(copy as unknown as Workbook, { type: 'array', bookType: format, compression: true }),
  ).slice().buffer;
}
