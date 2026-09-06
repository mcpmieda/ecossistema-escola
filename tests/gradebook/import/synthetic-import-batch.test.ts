import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countWorkbookOperationalClassesV1,
  importWorkbookBatch,
  MAX_NOTES_IMPORT_FILES,
  validateBatchSize,
  workbookClassComponentsV1,
  type ImportWorkbookFileTimingV1,
} from '../../../src/features/gradebook/import/import-batch';
import type {
  ClassRecognition,
  GradeSheetRecognition,
  WorkbookSummary,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import {
  SYNTHETIC_FILES,
  createSyntheticFile,
  createSyntheticSheetJs,
} from '../fixtures/synthetic-teacher-workbooks';

const root = process.cwd();

function importerSource(path: string): string {
  return readFileSync(join(root, 'src/features/gradebook/import', path), 'utf8');
}

function operationalSheet(
  discipline: string,
  disciplineIndex: string,
  term: 1 | 2 | 3,
): GradeSheetRecognition {
  return {
    name: `6A${term}º${disciplineIndex}`,
    range: 'A1:AN50',
    rows: 50,
    columns: 40,
    className: '6A',
    discipline,
    disciplineIndex,
    stage: `trimester-${term}`,
    declaredStage: `${term}º trimestre`,
    declaredStudents: 2,
    assessmentDefinitions: [],
    students: [],
    formulas: 0,
    officialZeros: 0,
  };
}

describe('massa sintética — lote integrado', () => {
  it.each([1, 20, 50])(
    'IMP-001: processa %i arquivo(s) estritamente em sequência',
    async (count) => {
      const events: string[] = [];
      const files = Array.from({ length: count }, () =>
        createSyntheticFile(SYNTHETIC_FILES.xlsx, events),
      );

      const result = await importWorkbookBatch(files, createSyntheticSheetJs(events), () => {});

      expect(result.successes).toHaveLength(count);
      expect(result.failures).toHaveLength(0);
      expect(events).toHaveLength(count * 3);
      for (let index = 0; index < count; index += 1) {
        expect(events.slice(index * 3, index * 3 + 3)).toEqual([
          `start:${SYNTHETIC_FILES.xlsx.name}`,
          `end:${SYNTHETIC_FILES.xlsx.name}`,
          `read:${SYNTHETIC_FILES.xlsx.marker}`,
        ]);
      }
    },
  );

  it('IMP-002: recusa 51 arquivos antes de qualquer leitura', () => {
    const events: string[] = [];
    const files = Array.from({ length: MAX_NOTES_IMPORT_FILES + 1 }, () =>
      createSyntheticFile(SYNTHETIC_FILES.xlsx, events),
    );

    expect(validateBatchSize(files)).toBe('Selecione no máximo 50 planilhas por lote.');
    expect(events).toEqual([]);
  });

  it('IMP-003/IMP-009: falha intermediária não cancela os demais e o progresso permanece coerente', async () => {
    const events: string[] = [];
    const progress: string[] = [];
    const files = [
      createSyntheticFile(SYNTHETIC_FILES.xlsx, events),
      createSyntheticFile(SYNTHETIC_FILES.empty, events),
      createSyntheticFile(SYNTHETIC_FILES.xlsb, events),
    ];

    const result = await importWorkbookBatch(files, createSyntheticSheetJs(events), (current) => {
      progress.push(`${current.current}/${current.total}:${current.fileName}`);
    });

    expect(result.successes.map((success) => success.summary.format)).toEqual(['XLSX', 'XLSB']);
    expect(result.failures).toEqual([
      {
        fileName: SYNTHETIC_FILES.empty.name,
        message: 'A planilha não contém abas reconhecíveis.',
      },
    ]);
    expect(progress).toEqual([
      `1/3:${SYNTHETIC_FILES.xlsx.name}`,
      `2/3:${SYNTHETIC_FILES.empty.name}`,
      `3/3:${SYNTHETIC_FILES.xlsb.name}`,
    ]);
    expect(events.at(-1)).toBe(`read:${SYNTHETIC_FILES.xlsb.marker}`);
  });

  it('IMP-004: aceita XLSB, XLSX e XLS com a mesma massa controlada', async () => {
    const descriptors = [SYNTHETIC_FILES.xlsb, SYNTHETIC_FILES.xlsx, SYNTHETIC_FILES.xls];
    const files = descriptors.map((descriptor) => createSyntheticFile(descriptor));

    const result = await importWorkbookBatch(files, createSyntheticSheetJs(), () => {});

    expect(result.failures).toEqual([]);
    expect(result.successes.map((success) => success.summary.format)).toEqual([
      'XLSB',
      'XLSX',
      'XLS',
    ]);
  });

  it('UI: conta qualquer D<n> como componente distinto sem duplicar a turma física', () => {
    const sheets = [
      ...([1, 2, 3] as const).map((term) => operationalSheet('Matemática', 'D1', term)),
      ...([1, 2, 3] as const).map((term) => operationalSheet('Ciências', 'D2', term)),
      ...([1, 2, 3] as const).map((term) => operationalSheet('Arte', 'D4', term)),
    ];
    const classroom: ClassRecognition = {
      name: '6A',
      students: 2,
      declaredStudents: 2,
      disciplines: ['Arte', 'Ciências', 'Matemática'],
      trimesters: ['1º', '2º', '3º'],
      recovery: false,
      sheets,
    };
    const summary: WorkbookSummary = {
      fileName: 'fonte-sintetica.xlsb',
      format: 'XLSB',
      size: 1,
      parserVersion: 'synthetic',
      sheets: [],
      gradeSheets: sheets,
      classes: [classroom],
      auxiliarySheets: [],
      unrecognizedSheets: [],
    };

    expect(countWorkbookOperationalClassesV1(summary)).toBe(3);
    expect(workbookClassComponentsV1(classroom).map((component) => component.disciplineIndex)).toEqual([
      'D1',
      'D2',
      'D4',
    ]);
    expect(summary.classes).toHaveLength(1);
  });

  it('IMP-005: arquivo sem guia de nota produz falha individual explicável', async () => {
    const file = createSyntheticFile(SYNTHETIC_FILES.noGradeSheet);

    const result = await importWorkbookBatch([file], createSyntheticSheetJs(), () => {});

    expect(result.successes).toEqual([]);
    expect(result.failures).toEqual([
      {
        fileName: SYNTHETIC_FILES.noGradeSheet.name,
        message: 'Nenhuma guia corresponde ao padrão de notas configurado.',
      },
    ]);
  });

  it('IMP-011: emite breakdown sanitizado sem alterar o resultado reconhecido', async () => {
    const timings: ImportWorkbookFileTimingV1[] = [];
    const file = createSyntheticFile(SYNTHETIC_FILES.xlsx);

    const result = await importWorkbookBatch([file], createSyntheticSheetJs(), () => {}, {
      yieldBeforeRecognition: async () => undefined,
      onFileTiming: (timing) => timings.push(timing),
    });

    expect(result.successes).toHaveLength(1);
    expect(result.failures).toEqual([]);
    expect(timings).toHaveLength(1);
    expect(timings[0]).toMatchObject({ fileIndex: 0, current: 1, total: 1 });
    for (const key of [
      'fileReadMs',
      'manifestMs',
      'yieldMs',
      'recognitionMs',
      'workbookReadMs',
      'xlsxReadMs',
      'recognizeWorkbookMs',
      'canonicalRostersMs',
    ] as const) {
      expect(typeof timings[0]?.[key]).toBe('number');
      expect(timings[0]?.[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it('IMP-010: o caminho integrado continua local, somente leitura e sem persistência', () => {
    const source = [
      importerSource('import-batch.ts'),
      importerSource('workbook-reader.ts'),
      importerSource('use-import-batch.ts'),
    ].join('\n');

    expect(source).toContain('file.arrayBuffer()');
    expect(source).not.toMatch(
      /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|CacheStorage|\.write\s*\(/u,
    );
  });
});
