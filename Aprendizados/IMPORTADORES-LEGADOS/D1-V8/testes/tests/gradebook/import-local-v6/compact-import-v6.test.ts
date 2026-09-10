import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { SourceFileManifestV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import { isGradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type {
  SheetJs,
  Workbook,
  Worksheet,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import { readWorkbookData } from '../../../src/features/gradebook/import/workbook-reader';
import { createCompactGradebookImportPersistenceRequestV6 } from '../../../src/features/gradebook/import/compact-import-v6';
import { createGradebookImportPersistenceRequestV5 } from '../../../src/features/gradebook/import/import-persistence-client-v2';
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

function recognized(): BatchSuccess {
  const source = workbook();
  const file = { name: 'notas-sinteticas.xlsb', size: 512 } as File;
  const sourceManifest = manifest();
  return {
    id: 'import-file:synthetic-v6' as BatchSuccess['id'],
    summary: readWorkbookData(file, new ArrayBuffer(0), sheetJs(source), sourceManifest),
    manifest: sourceManifest,
  };
}

describe('local compact import V6', () => {
  it('uses RELAÇÃO as the one canonical roster and keeps status beyond J1', () => {
    const result = recognized();
    const summary = result.summary as typeof result.summary & {
      canonicalRostersV6: Array<{
        students: Array<{ position: number; name: string; status: string }>;
      }>;
    };

    expect(summary.gradeSheets[0]?.declaredStudents).toBe(1);
    expect(summary.canonicalRostersV6).toHaveLength(1);
    expect(summary.canonicalRostersV6[0]?.students).toEqual([
      { position: 1, name: 'Estudante Sintético 1', status: '' },
      { position: 2, name: 'Estudante Sintético 2', status: 'FOI PARA 6B' },
    ]);
  });

  it('deduplicates roster, omits placeholders and keeps REC as a dynamic subset', () => {
    const result = recognized();
    const request = createCompactGradebookImportPersistenceRequestV6(result, {
      academicYearId: 'academic-year:synthetic-2026' as AcademicYearId,
      teacherName: 'Docente Sintético',
    });

    expect(isGradebookImportPersistenceRequestV6(request)).toBe(true);
    expect(request.rosters[0]?.students).toEqual([
      [1, 'Estudante Sintético 1'],
      [2, 'Estudante Sintético 2', 'FOI PARA 6B'],
    ]);
    expect(request.courses[0]?.recovery?.rows.map((row) => row.slice(0, 2))).toEqual([[2, 5]]);
    expect(request.courses[0]?.terms[0].assessmentDefinitions.some((value) => value[0] === 'AA')).toBe(false);
    expect(request.courses[0]?.terms[0].assessmentDefinitions.some((value) => value[0] === 'AB')).toBe(true);
    expect(request.courses[0]?.terms[0].rows[0]?.[1].AN).toBeUndefined();
    expect(request.courses[0]?.terms[2].rows[0]?.[1].AN).toBe(30);
  });

  it('is materially smaller than the historical repeated-roster V5 request', () => {
    const result = recognized();
    const context = {
      academicYearId: 'academic-year:synthetic-2026' as AcademicYearId,
      teacherName: 'Docente Sintético',
    };
    const v6 = createCompactGradebookImportPersistenceRequestV6(result, context);
    const v5 = createGradebookImportPersistenceRequestV5(result, context);
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

    expect(bytes(v6)).toBeLessThan(bytes(v5) * 0.6);
  });
});
