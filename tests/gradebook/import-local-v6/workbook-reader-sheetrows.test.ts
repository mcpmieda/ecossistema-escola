import { describe, expect, it } from 'vitest';
import type { SourceFileManifestV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  SheetJs,
  Workbook,
  Worksheet,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import {
  readWorkbookData,
  WORKBOOK_READ_OPTIONS,
  WORKBOOK_SHEET_SCAN_OPTIONS,
  type WorkbookReadTimingV1,
} from '../../../src/features/gradebook/import/workbook-reader';

function columnIndex(label: string): number {
  return [...label].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function decodeCell(value: string): { r: number; c: number } {
  const match = value.match(/^([A-Z]+)(\d+)$/u);
  if (!match?.[1] || !match[2]) throw new Error('invalid-cell');
  return { r: Number(match[2]) - 1, c: columnIndex(match[1]) };
}

function decodeRange(range: string) {
  const [start, end = start] = range.split(':');
  if (!start || !end) throw new Error('invalid-range');
  return { s: decodeCell(start), e: decodeCell(end) };
}

function manifest(): SourceFileManifestV1 {
  return {
    id: 'source-file-manifest:sheetrows' as SourceFileManifestV1['id'],
    fileName: 'notas-sheetrows.xlsb',
    extension: 'xlsb',
    reportedMimeType: null,
    sizeBytes: 128,
    lastModifiedAt: null,
    sha256: 'a'.repeat(64),
    sourceContractVersion: 2,
    parserVersion: 'synthetic-sheetrows',
    readAt: '2026-09-06T00:00:00.000Z',
  };
}

function workbook(): Workbook {
  const gradeSheet = {
    '!ref': 'A1:AN50',
    '!fullref': 'A1:AN120',
    J1: { v: 2 },
    K2: { v: 'Componente Sintético' },
    K3: { v: '6A' },
    K4: { v: '1º trimestre' },
    J5: { v: 1 },
    K5: { v: 'Estudante inicial', f: 'RELACAOTURMA1' },
    AM5: { v: 6 },
    J50: { v: 2 },
    K50: { v: 'Estudante dentro do contrato' },
    AM50: { v: 7 },
    J51: { v: 3 },
    K51: { v: 'Estudante fora do contrato' },
    AM51: { v: 8 },
  } as Worksheet;
  const relationSheet = {
    '!ref': 'A1:B3',
    A1: { v: 'SITUACAOTURMA1' },
    B1: { v: 'RELACAOTURMA1' },
    A2: { v: '' },
    B2: { v: 'Estudante inicial' },
    A3: { v: '' },
    B3: { v: 'Estudante dentro do contrato' },
  } as Worksheet;
  const unexpectedSheet = {
    '!ref': 'A1:C120',
    A1: { v: 'conteúdo sintético sem papel acadêmico' },
  } as Worksheet;
  return {
    SheetNames: ['6A1º', 'RELAÇÃO', 'AUXILIAR DESCARTADA'],
    Sheets: {
      '6A1º': gradeSheet,
      RELAÇÃO: relationSheet,
      'AUXILIAR DESCARTADA': unexpectedSheet,
    },
  };
}

type DenseCell = { v?: unknown; w?: string; f?: string };

function denseWorkbook(): Workbook {
  const sparse = workbook();
  const sheets = Object.fromEntries(
    sparse.SheetNames.map((name) => {
      const source = sparse.Sheets[name]!;
      const data: Array<Array<DenseCell | undefined> | undefined> = [];
      for (const [address, value] of Object.entries(source)) {
        if (address.startsWith('!') || !value || typeof value !== 'object') continue;
        const { r, c } = decodeCell(address);
        const row = data[r] ?? [];
        row[c] = value as DenseCell;
        data[r] = row;
      }
      const dense = {
        '!ref': source['!ref'],
        '!fullref': (source as unknown as { '!fullref'?: string })['!fullref'],
        '!data': data,
      } as unknown as Worksheet;
      return [name, dense] as const;
    }),
  );
  return { SheetNames: [...sparse.SheetNames], Sheets: sheets };
}

interface SheetJsFixtureOptions {
  readonly failSelective?: boolean;
}

function sheetJs(
  source: Workbook,
  captured: Record<string, unknown>[],
  fixture: SheetJsFixtureOptions = {},
): SheetJs {
  return {
    version: 'synthetic-sheetrows',
    read: (_data, options = {}) => {
      captured.push(options);
      if (options.bookSheets === true) {
        return { SheetNames: [...source.SheetNames], Sheets: {} };
      }
      const selected = Array.isArray(options.sheets)
        ? options.sheets.filter((name): name is string => typeof name === 'string')
        : [...source.SheetNames];
      if (fixture.failSelective && Array.isArray(options.sheets)) {
        throw new Error('synthetic-selective-failure');
      }
      return {
        SheetNames: [...source.SheetNames],
        Sheets: Object.fromEntries(
          selected.flatMap((name) => {
            const sheet = source.Sheets[name];
            return sheet ? [[name, sheet] as const] : [];
          }),
        ),
      };
    },
    utils: { decode_range: decodeRange },
  };
}

function read(
  source: Workbook,
  captured: Record<string, unknown>[] = [],
  fixture: SheetJsFixtureOptions = {},
): { readonly summary: ReturnType<typeof readWorkbookData>; readonly timing: WorkbookReadTimingV1 } {
  let timing: WorkbookReadTimingV1 | null = null;
  const summary = readWorkbookData(
    { name: 'notas-sheetrows.xlsb', size: 128 } as File,
    new ArrayBuffer(0),
    sheetJs(source, captured, fixture),
    manifest(),
    (value) => {
      timing = value;
    },
  );
  if (!timing) throw new Error('timing-not-emitted');
  return { summary, timing };
}

describe('workbook reader bounded rows, dense worksheets and selective sheets', () => {
  it('keeps bounded/dense parse options and a names-only scan', () => {
    expect(WORKBOOK_READ_OPTIONS).toEqual({
      type: 'array',
      cellFormula: true,
      cellText: true,
      cellDates: false,
      cellNF: false,
      cellStyles: false,
      cellHTML: false,
      sheetRows: 50,
      dense: true,
    });
    expect(WORKBOOK_SHEET_SCAN_OPTIONS).toEqual({ type: 'array', bookSheets: true });
  });

  it('parses only academic/auxiliary sheets while preserving every sheet name', () => {
    const captured: Record<string, unknown>[] = [];
    const { summary, timing } = read(workbook(), captured);

    expect(captured).toEqual([
      WORKBOOK_SHEET_SCAN_OPTIONS,
      { ...WORKBOOK_READ_OPTIONS, sheets: ['6A1º', 'RELAÇÃO'] },
    ]);
    expect(summary.sheets).toHaveLength(3);
    expect(summary.unrecognizedSheets).toEqual(['AUXILIAR DESCARTADA']);
    expect(summary.sheets.find((sheet) => sheet.name === '6A1º')).toMatchObject({
      range: 'A1:AN120',
      rows: 120,
    });
    expect(summary.gradeSheets[0]).toMatchObject({ range: 'A1:AN120', rows: 120 });
    expect(summary.gradeSheets[0]?.students.map((student) => student.row)).toEqual([5, 50]);
    expect(summary.canonicalRostersV6).toHaveLength(1);
    expect(timing).toMatchObject({
      totalSheetCount: 3,
      selectedSheetCount: 2,
      selectiveSheetParse: true,
    });
    expect(timing.sheetScanMs).toBeGreaterThanOrEqual(0);
    expect(timing.sheetParseMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps sparse and dense worksheets academically equivalent', () => {
    expect(read(denseWorkbook()).summary).toEqual(read(workbook()).summary);
  });

  it('falls back to a complete parse when selective parsing fails', () => {
    const captured: Record<string, unknown>[] = [];
    const { summary, timing } = read(workbook(), captured, { failSelective: true });

    expect(captured).toEqual([
      WORKBOOK_SHEET_SCAN_OPTIONS,
      { ...WORKBOOK_READ_OPTIONS, sheets: ['6A1º', 'RELAÇÃO'] },
      WORKBOOK_READ_OPTIONS,
    ]);
    expect(summary.gradeSheets[0]?.students.map((student) => student.row)).toEqual([5, 50]);
    expect(summary.canonicalRostersV6).toHaveLength(1);
    expect(summary.unrecognizedSheets).toEqual(['AUXILIAR DESCARTADA']);
    expect(timing).toMatchObject({
      totalSheetCount: 3,
      selectedSheetCount: 2,
      selectiveSheetParse: false,
    });
  });
});
