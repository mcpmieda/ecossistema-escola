import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  importWorkbookBatch,
  MAX_NOTES_IMPORT_FILES,
  validateBatchSize,
} from '../../../src/features/gradebook/import/import-batch';
import type {
  SheetJs,
  Workbook,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import { WORKBOOK_READ_OPTIONS } from '../../../src/features/gradebook/import/workbook-reader';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function syntheticFile(name: string, marker: number, events: string[]): File {
  return {
    name,
    size: 1,
    lastModified: marker,
    arrayBuffer: async () => {
      events.push(`start:${name}`);
      await Promise.resolve();
      events.push(`end:${name}`);
      return Uint8Array.of(marker).buffer;
    },
  } as unknown as File;
}

function syntheticWorkbook(): Workbook {
  return {
    SheetNames: ['6A1º'],
    Sheets: {
      '6A1º': {
        '!ref': 'A1:K4',
        K2: { v: 'Matemática' },
        K3: { v: '6A' },
        K4: { v: '1º trimestre' },
      },
    },
  };
}

function sheetJs(events: string[]): SheetJs {
  return {
    version: 'test',
    read: (data) => {
      const marker = new Uint8Array(data)[0];
      events.push(`read:${marker}`);
      return marker === 9 ? { SheetNames: [], Sheets: {} } : syntheticWorkbook();
    },
    utils: {
      decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 3, c: 10 } }),
    },
  };
}

describe('gradebook importer structure', () => {
  it('keeps the platform page as shell and separates importer responsibilities', () => {
    const expectedModules = [
      'sheetjs-loader.ts',
      'workbook-reader.ts',
      'import-batch.ts',
      'use-import-batch.ts',
      'import-panel.tsx',
      'import-persistence-client-v2.ts',
      'import-persistence-confirmation-v2.tsx',
      'workbook-inspector.tsx',
      'spreadsheet-recognizer.ts',
    ];

    for (const module of expectedModules) {
      expect(existsSync(join(root, 'src/features/gradebook/import', module))).toBe(true);
    }

    const notesPage = source('src/platform/notes-page.tsx');
    const workspacePage = source('src/platform/gradebook-workspace-page.tsx');
    const shell = source('src/platform/gradebook-workspace-shell.tsx');

    expect(notesPage).toContain("import('./gradebook-workspace-page')");
    expect(notesPage).not.toContain('NotesImportPanel');
    expect(workspacePage).toContain('<GradebookWorkspaceShell />');
    expect(shell).toContain(
      "import { NotesImportPanel } from '../features/gradebook/import/import-panel';",
    );
    expect(shell).toContain('<NotesImportPanel />');
    expect(`${notesPage}\n${workspacePage}\n${shell}`).not.toMatch(
      /xlsx\.read|recognizeWorkbook|loadSheetJs/u,
    );

    const compatibilityExport = source('src/platform/notes-spreadsheet-recognizer.ts').trim();
    expect(compatibilityExport).toBe(
      "export * from '../features/gradebook/import/spreadsheet-recognizer';",
    );
  });

  it('keeps SheetJS loading, workbook options and HeroUI presentation explicit', () => {
    expect(source('src/features/gradebook/import/sheetjs-loader.ts')).toContain(
      'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    );
    expect(WORKBOOK_READ_OPTIONS).toEqual({
      type: 'array',
      cellDates: true,
      cellFormula: true,
      cellNF: true,
      cellStyles: true,
    });

    const presentation = [
      source('src/features/gradebook/import/import-panel.tsx'),
      source('src/features/gradebook/import/workbook-inspector.tsx'),
    ].join('\n');
    expect(presentation.match(/from '@heroui\/react'/gu)).toHaveLength(2);
    expect(presentation).toContain('Q/T:');
    expect(presentation).toContain('QL/AK:');
    expect(presentation).toContain('Recuperação final');
  });

  it('retains the limit of 50 files before batch processing', () => {
    const files = Array.from(
      { length: MAX_NOTES_IMPORT_FILES + 1 },
      (_, index) => ({ name: `${index}.xlsx` }) as File,
    );

    expect(MAX_NOTES_IMPORT_FILES).toBe(50);
    expect(validateBatchSize(files)).toBe('Selecione no máximo 50 planilhas por lote.');
    expect(validateBatchSize(files.slice(0, MAX_NOTES_IMPORT_FILES))).toBeNull();
  });

  it('processes XLSB, XLSX and XLS sequentially while isolating individual failures', async () => {
    const events: string[] = [];
    const progress: string[] = [];
    const files = [
      syntheticFile('primeiro.xlsx', 1, events),
      syntheticFile('segundo.xlsb', 2, events),
      syntheticFile('invalido.xlsx', 9, events),
      syntheticFile('terceiro.xls', 3, events),
      syntheticFile('ignorado.csv', 4, events),
    ];

    const result = await importWorkbookBatch(files, sheetJs(events), (current) => {
      progress.push(current.fileName);
    });

    expect(result.successes.map((success) => success.summary.format)).toEqual([
      'XLSX',
      'XLSB',
      'XLS',
    ]);
    expect(result.failures).toEqual([
      { fileName: 'invalido.xlsx', message: 'A planilha não contém abas reconhecíveis.' },
      { fileName: 'ignorado.csv', message: 'Formato não suportado.' },
    ]);
    expect(progress).toEqual(files.map((file) => file.name));
    expect(events).toEqual([
      'start:primeiro.xlsx',
      'end:primeiro.xlsx',
      'read:1',
      'start:segundo.xlsb',
      'end:segundo.xlsb',
      'read:2',
      'start:invalido.xlsx',
      'end:invalido.xlsx',
      'read:9',
      'start:terceiro.xls',
      'end:terceiro.xls',
      'read:3',
    ]);
  });

  it('keeps workbook bytes local and browser academic storage empty', () => {
    const workbookReader = [
      source('src/features/gradebook/import/import-batch.ts'),
      source('src/features/gradebook/import/workbook-reader.ts'),
    ].join('\n');
    const bridge = source('src/features/gradebook/import/import-persistence-client-v2.ts');
    const importer = `${workbookReader}\n${bridge}\n${source('src/features/gradebook/import/use-import-batch.ts')}`;
    expect(workbookReader).not.toMatch(/\bfetch\s*\(/u);
    expect(bridge).toContain('fetch(ENDPOINT');
    expect(bridge).not.toMatch(/arrayBuffer|workbook|worksheet|logicalSourceId|expectedVersion/iu);
    expect(importer).not.toMatch(/localStorage|sessionStorage|indexedDB|\.write\s*\(/u);
    expect(workbookReader).toContain('file.arrayBuffer()');
  });
});
