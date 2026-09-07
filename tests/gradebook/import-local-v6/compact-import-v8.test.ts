import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { SourceFileManifestV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import { isGradebookImportPersistenceRequestV8 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import {
  snapshotRawCellV8,
  type SheetJs,
  type Workbook,
  type Worksheet,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import { readWorkbookData } from '../../../src/features/gradebook/import/workbook-reader';
import {
  createGradebookValuesSnapshotV8,
  normalizeSnapshotCellV8,
} from '../../../src/features/gradebook/import/compact-import-v8';
import { createCompactGradebookImportPersistenceRequestV6 } from '../../../src/features/gradebook/import/compact-import-v6';
import type { BatchSuccess } from '../../../src/features/gradebook/import/import-batch';
function columnIndex(label: string): number {
  return [...label].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function decodeCell(value: string): { r: number; c: number } {
  const match = value.match(/^([A-Z]+)(\d+)$/u);
  if (!match?.[1] || !match[2]) throw new Error('invalid-cell');
  return { r: Number(match[2]) - 1, c: columnIndex(match[1]) };
}

function sheetJs(workbook: Workbook): SheetJs {
  return {
    version: 'synthetic-v6',
    read: () => workbook,
    utils: {
      decode_range: (range) => {
        const [start, end = start] = range.split(':');
        if (!start || !end) throw new Error('invalid-range');
        return { s: decodeCell(start), e: decodeCell(end) };
      },
    },
  };
}

function termSheet(stage: 1 | 2 | 3): Worksheet {
  const sheet: Worksheet = {
    '!ref': 'A1:AN50',
    J1: { v: 1 },
    K2: { v: 'Componente Sintético' },
    K3: { v: '6A' },
    K4: { v: `${stage}º trimestre` },
    R3: { v: 8 },
    S3: { v: 2 },
    AA3: { v: '*' },
    AA4: { v: 5 },
    AB3: { v: '' },
    AB4: { v: 'Atividade válida sem máximo' },
    G5: { v: '' },
    J5: { v: 1 },
    K5: { v: 'Estudante Sintético 1', f: 'RELACAOTURMA1' },
    R5: { v: 6 },
    S5: { v: 2 },
    T5: { v: 8, f: 'SUM(R5:S5)' },
    AB5: { v: 2 },
    AK5: { v: 2 },
    AM5: { v: 10 },
    G6: { v: 'FOI PARA 6B' },
    J6: { v: 2 },
    K6: { v: 'Estudante Sintético 2' },
    R6: { v: 5 },
    S6: { v: 1 },
    T6: { v: 6 },
    AM6: { v: 6 },
  };
  if (stage === 3) {
    sheet.AN5 = { v: 30 };
    sheet.AN6 = { v: 18 };
  }
  return sheet;
}

function recoverySheet(): Worksheet {
  return {
    '!ref': 'A1:AE50',
    K2: { v: 'Componente Sintético' },
    K3: { v: '6A' },
    K4: { v: 'Recuperação final' },
    G5: { v: 'FOI PARA 6B' },
    J5: { v: 1 },
    K5: { v: 'Estudante Sintético 2', f: 'FILTER(RELACAOTURMA1)' },
    X5: { v: 6 },
    Y5: { v: 6 },
    AA5: { v: 6 },
    AB5: { v: 18 },
    AC5: { v: 1 },
    AD5: { v: 0 },
    AE5: { v: 0 },
  };
}

function workbook(): Workbook {
  return {
    SheetNames: ['6A1º', '6A2º', '6A3º', '6AREC', 'RELAÇÃO', 'CONFIGURAÇÃO'],
    Sheets: {
      '6A1º': termSheet(1),
      '6A2º': termSheet(2),
      '6A3º': termSheet(3),
      '6AREC': recoverySheet(),
      RELAÇÃO: {
        '!ref': 'A1:B47',
        A1: { v: 'SITUACAOTURMA1' },
        B1: { v: 'RELACAOTURMA1' },
        A2: { v: '' },
        B2: { v: 'Estudante Sintético 1' },
        A3: { v: 'FOI PARA 6B' },
        B3: { v: 'Estudante Sintético 2' },
      },
      CONFIGURAÇÃO: {
        '!ref': 'A1:C2',
        A2: { v: 'Docente Sintético' },
        C2: { v: 2026 },
      },
    },
  };
}

function manifest(): SourceFileManifestV1 {
  return {
    id: 'source-file-manifest:synthetic' as SourceFileManifestV1['id'],
    fileName: 'notas-sinteticas.xlsb',
    extension: 'xlsb',
    reportedMimeType: null,
    sizeBytes: 512,
    lastModifiedAt: null,
    sha256: 'a'.repeat(64),
    sourceContractVersion: 2,
    parserVersion: 'synthetic-v6',
    readAt: '2026-09-05T00:00:00.000Z',
  };
}

function recognized(source = workbook()): BatchSuccess {
  const file = { name: 'notas-sinteticas.xlsb', size: 512 } as File;
  const sourceManifest = manifest();
  return {
    id: 'import-file:synthetic-v6' as BatchSuccess['id'],
    summary: readWorkbookData(
      file,
      new ArrayBuffer(0),
      sheetJs(source),
      sourceManifest,
      undefined,
      true,
    ),
    manifest: sourceManifest,
  };
}

const context = {
  academicYearId: 'academic-year:synthetic-2026' as AcademicYearId,
  teacherName: 'Docente Sintético',
};
describe('Local value snapshots V8', () => {
  it('uses actual saved values, never formula text, preserving roster and REC flags', () => {
    const source = workbook();
    const formula = 'SYNTHETIC_FORMULA_' + 'X'.repeat(10_000);
    source.Sheets['6A1º']!.R5 = { v: 0, f: formula };
    source.Sheets['6A1º']!.S5 = { v: 0.1, f: formula };
    source.Sheets['6A1º']!.T5 = { v: 8, f: formula };
    const result = recognized(source);
    const snapshot = createGradebookValuesSnapshotV8(result, context);
    expect(isGradebookImportPersistenceRequestV8(snapshot)).toBe(true);
    expect(snapshot.courses[0]!.terms[0].rows[0]![1]).toMatchObject({ S: 0.1, T: 8 });
    expect(snapshot.courses[0]!.terms[0].rows[0]![1].R).toBeUndefined();
    expect(snapshot.courses[0]!.recovery!.rows[0]![2]).toMatchObject({ AC: 1, AD: 0, AE: 0 });
    expect(snapshot.rosters[0]!.students).toHaveLength(2);
    expect(snapshot.courses[0]!.recovery!.rows[0]!.slice(0, 2)).toEqual([2, 5]);
    expect(JSON.stringify(snapshot)).not.toContain('SYNTHETIC_FORMULA');
    expect(JSON.stringify(snapshot).length).toBeLessThan(
      JSON.stringify(createCompactGradebookImportPersistenceRequestV6(result, context)).length / 2,
    );
  });
  it('distinguishes a valid empty formula result from a genuinely unavailable cache', () => {
    const source = workbook();
    source.Sheets['6A1º']!.R5 = { f: 'SYNTHETIC_UNKNOWN()' };
    source.Sheets['6A1º']!.S5 = { f: 'SYNTHETIC_BLANK()', v: '' };
    const snapshot = createGradebookValuesSnapshotV8(recognized(source), context);
    expect(snapshot.courses[0]!.terms[0].rows[0]![1].R).toEqual(['u']);
    expect(snapshot.courses[0]!.terms[0].rows[0]![1].S).toBeUndefined();
    expect(isGradebookImportPersistenceRequestV8(snapshot)).toBe(true);
  });
  it.each([
    [undefined, undefined],
    [{ v: 0 }, 0],
    [{ v: 0.1 }, 0.1],
    [{ v: '', f: 'SYNTHETIC()' }, undefined],
    [{ f: 'SYNTHETIC()' }, ['u']],
    [{ v: null, f: 'SYNTHETIC()' }, ['u']],
    [{ t: 'e', v: 7 }, ['u']],
    [{ v: NaN }, ['u']],
    [{ v: true }, true],
  ])('captures a raw cell without carrying formula text: %j', (cell, expected) => {
    expect(snapshotRawCellV8(cell)).toEqual(expected);
  });
  it.each([0, '0', '0,0', ' 0 ', -0])(
    'normalizes grade %j as absent, but keeps flag zero',
    (value) => {
      expect(normalizeSnapshotCellV8(value)).toBeUndefined();
      expect(normalizeSnapshotCellV8(value, true)).toBe(0);
    },
  );
  it.each([0.1, '0,1', '0.10'])('keeps %j as the explicit-zero source marker', (value) => {
    expect(normalizeSnapshotCellV8(value)).toBe(0.1);
  });
  it('never rounds or treats malformed text and error markers as zero', () => {
    expect(normalizeSnapshotCellV8(0.10001)).toBe(0.10001);
    expect(normalizeSnapshotCellV8('7,25')).toBe(7.25);
    expect(normalizeSnapshotCellV8('1,000.00')).toBe('1,000.00');
    expect(normalizeSnapshotCellV8('TRANSFERIDO')).toBe('TRANSFERIDO');
    expect(normalizeSnapshotCellV8(['u'])).toEqual(['u']);
    expect(normalizeSnapshotCellV8('')).toBeUndefined();
  });
});
