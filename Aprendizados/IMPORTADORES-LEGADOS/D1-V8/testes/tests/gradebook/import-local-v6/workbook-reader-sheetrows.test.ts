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
  const sheet = {
    '!ref': 'A1:AN50',
    '!fullref': 'A1:AN120',
    J1: { v: 1 },
    K2: { v: 'Componente Sintético' },
    K3: { v: '6A' },
    K4: { v: '1º trimestre' },
    J50: { v: 1 },
    K50: { v: 'Estudante dentro do contrato' },
    AM50: { v: 7 },
    J51: { v: 2 },
    K51: { v: 'Estudante fora do contrato' },
    AM51: { v: 8 },
  } as Worksheet;
  return { SheetNames: ['6A1º'], Sheets: { '6A1º': sheet } };
}

function sheetJs(source: Workbook, captured: Record<string, unknown>[]): SheetJs {
  return {
    version: 'synthetic-sheetrows',
    read: (_data, options) => {
      captured.push(options ?? {});
      return source;
    },
    utils: { decode_range: decodeRange },
  };
}

describe('workbook reader bounded rows', () => {
  it('limits SheetJS materialization to the academic template rows', () => {
    expect(WORKBOOK_READ_OPTIONS).toEqual({
      type: 'array',
      cellFormula: true,
      cellText: true,
      cellDates: false,
      cellNF: false,
      cellStyles: false,
      cellHTML: false,
      sheetRows: 50,
    });
  });

  it('preserves full dimensions while recognition stays bounded by !ref', () => {
    const captured: Record<string, unknown>[] = [];
    const source = workbook();
    const summary = readWorkbookData(
      { name: 'notas-sheetrows.xlsb', size: 128 } as File,
      new ArrayBuffer(0),
      sheetJs(source, captured),
      manifest(),
    );

    expect(captured).toEqual([WORKBOOK_READ_OPTIONS]);
    expect(summary.sheets[0]).toMatchObject({ range: 'A1:AN120', rows: 120 });
    expect(summary.gradeSheets[0]).toMatchObject({ range: 'A1:AN120', rows: 120 });
    expect(summary.gradeSheets[0]?.students.map((student) => student.row)).toEqual([50]);
  });
});
