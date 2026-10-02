import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import type { readWorkbookData as OriginalReadWorkbookData } from '../../../src/features/gradebook/import/workbook-reader';

export interface CandidateReaderV1 {
  readonly readWorkbookData: typeof OriginalReadWorkbookData;
}

function removeFunction(source: string, name: string, path: string): string {
  const expression = new RegExp(`^function ${name}\\([\\s\\S]*?^}\\r?\\n?`, 'gm');
  const matches = source.match(expression) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Expected one original ${name} in ${path}; found ${matches.length}.`);
  }
  return source.replace(expression, '');
}

/** Transform only sparse consumers; missing/duplicated functions fail closed. */
export function adaptWorksheetConsumersV1(source: string, path: string): string {
  if (source.includes('worksheet-cell-access-v1')) {
    throw new Error(`Consumer already adapted: ${path}.`);
  }
  if (/(?:^|[\\/])spreadsheet-recognizer\.ts$/u.test(path)) {
    const withoutCell = removeFunction(source, 'cellAt', path);
    const adapted = removeFunction(withoutCell, 'a1Coordinates', path);
    return `import { a1CoordinatesV1 as a1Coordinates, worksheetCellAtV1 as cellAt } from './worksheet-cell-access-v1';\n${adapted}`;
  }
  if (/(?:^|[\\/])master-relation-v9\.ts$/u.test(path)) {
    const adapted = removeFunction(source, 'cell', path);
    return `import { worksheetCellAtV1 as cell } from './worksheet-cell-access-v1';\n${adapted}`;
  }
  throw new Error(`Unsupported worksheet consumer: ${path}.`);
}

/** Build in a native Node process, keeping jsdom globals and configuration intact. */
export async function bundleCandidateReaderV1(): Promise<string> {
  const { build } = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
  const readerPath = fileURLToPath(
    new URL('../../../src/features/gradebook/import/workbook-reader.ts', import.meta.url),
  );
  const accessorPath = fileURLToPath(new URL('./worksheet-cell-access-v1.ts', import.meta.url));
  const bundled = await build({
    stdin: {
      contents: `export { readWorkbookData } from ${JSON.stringify(readerPath)};`,
      resolveDir: dirname(readerPath),
      sourcefile: 'reader-candidate-entry-v1.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    plugins: [
      {
        name: 'worksheet-access-candidate-only',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/worksheet-cell-access-v1$/ }, () => ({
            path: accessorPath,
          }));
          builder.onLoad(
            { filter: /(?:spreadsheet-recognizer|master-relation-v9)\.ts$/ },
            async ({ path }) => ({
              contents: adaptWorksheetConsumersV1(await readFile(path, 'utf8'), path),
              loader: 'ts',
              resolveDir: dirname(path),
            }),
          );
        },
      },
    ],
  });
  const contents = bundled.outputFiles[0]?.text;
  if (!contents) throw new Error('Candidate reader bundle is empty.');
  return contents;
}

/** Laboratory-only bundle of the current reader and its narrowly adapted consumers. */
export async function loadCandidateReaderV1(): Promise<CandidateReaderV1> {
  const script = `const { bundleCandidateReaderV1 } = await import(${JSON.stringify(import.meta.url)});\nprocess.stdout.write(await bundleCandidateReaderV1());`;
  const { stdout: contents } = await promisify(execFile)(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8', windowsHide: true },
  );
  const module = { exports: {} };
  runInNewContext(
    contents,
    {
      module,
      exports: module.exports,
      File,
      ArrayBuffer,
      Uint8Array,
      Date,
      Error,
      performance,
      structuredClone,
      crypto: globalThis.crypto,
    },
    { filename: 'reader-candidate-bundle-v1.cjs' },
  );
  const candidate = module.exports as CandidateReaderV1;
  if (typeof candidate.readWorkbookData !== 'function') {
    throw new Error('Candidate reader export is missing.');
  }
  return {
    // Bring VM prototypes into the test realm without dropping undefined or holes.
    // This helper is not used to measure parsing or production performance.
    readWorkbookData: (...arguments_) => structuredClone(candidate.readWorkbookData(...arguments_)),
  };
}
