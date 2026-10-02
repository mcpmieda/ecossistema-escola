import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  Workbook,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import * as workbookRecognition from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import * as relationRecognition from '../../../src/features/gradebook/import/master-relation-v9';
import { createSourceFileManifest } from '../../../src/features/gradebook/import/file-manifest';
import {
  readWorkbookData,
  WORKBOOK_READ_OPTIONS,
  type WorkbookReadTimingV1,
} from '../../../src/features/gradebook/import/workbook-reader';
import {
  SYNTHETIC_FILES,
  createSyntheticFile,
  createSyntheticSheetJs,
} from '../fixtures/synthetic-teacher-workbooks';

const root = process.cwd();

afterEach(() => vi.restoreAllMocks());

const fixedNow = () => new Date('2026-10-02T12:00:00.000Z');
const syntheticDigest = async () => new Uint8Array(32).buffer;

function syntheticRelation(): Workbook {
  return {
    SheetNames: ['INICIO', 'VÍNCULO AGENDA'],
    Sheets: {
      INICIO: {
        '!ref': 'A1:Q28',
        Q2: { v: 2026 },
        D7: { v: 6 },
        E7: { v: '6A' },
        F7: { v: 'Turma Sintética' },
        I7: { v: 'MATUTINO' },
      },
      'VÍNCULO AGENDA': {
        '!ref': 'A1:AZ48',
        I3: { v: 'NOVATO' },
        J3: { v: 'Estudante Sintético' },
      },
    },
  };
}

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
    expect(
      workbookClassComponentsV1(classroom).map((component) => component.disciplineIndex),
    ).toEqual(['D1', 'D2', 'D4']);
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
    expect(timings[0]).toMatchObject({
      fileIndex: 0,
      current: 1,
      total: 1,
      outcome: 'recognized',
      failureStage: null,
    });
    for (const key of [
      'fileReadMs',
      'manifestMs',
      'yieldMs',
      'recognitionMs',
      'workbookReadMs',
      'xlsxReadMs',
      'masterRelationRecognitionMs',
      'recognizeWorkbookMs',
      'canonicalRostersMs',
    ] as const) {
      expect(typeof timings[0]?.[key]).toBe('number');
      expect(timings[0]?.[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([
    ['unsupported-format', 'Formato não suportado.'],
    ['file-read', 'sentinela-leitura-privada'],
    ['manifest', 'sentinela-hash-privada'],
    ['workbook-read', 'sentinela-parser-privada'],
    ['empty-workbook', 'A planilha não contém abas reconhecíveis.'],
    ['relation-recognition', 'Ano letivo inválido ou ausente em INICIO!Q2.'],
    ['workbook-recognition', 'Nenhuma guia corresponde ao padrão de notas configurado.'],
  ] as const)(
    'G-T14/G-T16: falha %s preserva a categoria, as fronteiras alcançadas e o erro original',
    async (stage, message) => {
      let clock = 0;
      vi.spyOn(globalThis.performance, 'now').mockImplementation(() => clock);
      const file = {
        ...createSyntheticFile(SYNTHETIC_FILES.xlsx),
        name:
          stage === 'unsupported-format'
            ? 'sentinela-arquivo-privado.txt'
            : 'sentinela-arquivo-privado.xlsx',
        arrayBuffer: async () => {
          clock += 7;
          if (stage === 'file-read') throw new Error(message);
          return Uint8Array.of(1).buffer;
        },
      } as File;
      const xlsx = createSyntheticSheetJs();
      const originalRead = xlsx.read;
      xlsx.read = (data) => {
        clock += 17;
        if (stage === 'workbook-read') throw new Error(message);
        if (stage === 'empty-workbook') return SYNTHETIC_FILES.empty.workbook;
        if (stage === 'workbook-recognition') return SYNTHETIC_FILES.noGradeSheet.workbook;
        if (stage === 'relation-recognition') {
          const relation = syntheticRelation();
          delete relation.Sheets.INICIO!.Q2;
          return relation;
        }
        return originalRead(data);
      };
      const originalRelation = relationRecognition.recognizeMasterRelationV9;
      vi.spyOn(relationRecognition, 'recognizeMasterRelationV9').mockImplementation((workbook) => {
        clock += 19;
        return originalRelation(workbook);
      });
      const originalRecognition = workbookRecognition.recognizeWorkbook;
      vi.spyOn(workbookRecognition, 'recognizeWorkbook').mockImplementation((...args) => {
        clock += 23;
        return originalRecognition(...args);
      });
      const timings: ImportWorkbookFileTimingV1[] = [];

      const result = await importWorkbookBatch([file], xlsx, () => {}, {
        now: fixedNow,
        digestSha256: async () => {
          clock += 11;
          if (stage === 'manifest') throw new Error(message);
          return syntheticDigest();
        },
        yieldBeforeRecognition: async () => {
          clock += 13;
        },
        onFileTiming: (timing) => timings.push(timing),
      });

      expect(result.successes).toEqual([]);
      expect(result.failures).toEqual([{ fileName: file.name, message }]);
      expect(result.batch.status).toBe('failed');
      const unsupported = stage === 'unsupported-format';
      const beforeWorkbook = unsupported || stage === 'file-read' || stage === 'manifest';
      const beforeRelation =
        beforeWorkbook || stage === 'workbook-read' || stage === 'empty-workbook';
      const beforeRecognition = beforeRelation || stage === 'relation-recognition';
      expect(timings).toEqual([
        {
          fileIndex: 0,
          current: 1,
          total: 1,
          outcome: 'failed',
          failureStage: stage === 'empty-workbook' ? 'workbook-read' : stage,
          fileReadMs: unsupported ? null : 7,
          manifestMs: unsupported || stage === 'file-read' ? null : 11,
          yieldMs: beforeWorkbook ? null : 13,
          recognitionMs: beforeWorkbook ? null : beforeRelation ? 17 : beforeRecognition ? 36 : 59,
          workbookReadMs: beforeWorkbook ? null : beforeRelation ? 17 : beforeRecognition ? 36 : 59,
          xlsxReadMs: beforeWorkbook ? null : 17,
          masterRelationRecognitionMs: beforeRelation ? null : 19,
          recognizeWorkbookMs: beforeRecognition ? null : 23,
          canonicalRostersMs: null,
        },
      ]);
      expect(JSON.stringify(timings)).not.toMatch(
        /sentinela-|Turma Sintética|Estudante Sintético/u,
      );
    },
  );

  it('G-T16: mede uma única passagem da Relação e mantém opções, captura e dimensões no cronômetro legado', async () => {
    let clock = 0;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => clock);
    const baseFile = createSyntheticFile(SYNTHETIC_FILES.xlsx);
    const file = {
      ...baseFile,
      arrayBuffer: async () => {
        clock += 7;
        return baseFile.arrayBuffer();
      },
    } as File;
    const workbook: Workbook = {
      ...SYNTHETIC_FILES.xlsx.workbook,
      Sheets: {
        ...SYNTHETIC_FILES.xlsx.workbook.Sheets,
        '6A1º': { ...SYNTHETIC_FILES.xlsx.workbook.Sheets['6A1º'], '!fullref': 'A1:AN100' },
      },
    };
    const xlsx = createSyntheticSheetJs();
    xlsx.read = vi.fn((_, options) => {
      expect(options).toEqual(WORKBOOK_READ_OPTIONS);
      clock += 17;
      return workbook;
    });
    const decode = xlsx.utils.decode_range;
    xlsx.utils.decode_range = (range) => {
      if (range === 'A1:AN100') clock += 29;
      return decode(range);
    };
    const originalRelation = relationRecognition.recognizeMasterRelationV9;
    const relationSpy = vi
      .spyOn(relationRecognition, 'recognizeMasterRelationV9')
      .mockImplementation((parsed) => {
        clock += 19;
        return originalRelation(parsed);
      });
    const originalRecognition = workbookRecognition.recognizeWorkbook;
    vi.spyOn(workbookRecognition, 'recognizeWorkbook').mockImplementation((...args) => {
      clock += 23;
      return originalRecognition(...args);
    });
    const timings: ImportWorkbookFileTimingV1[] = [];

    const result = await importWorkbookBatch([file], xlsx, () => {}, {
      now: fixedNow,
      captureValues: true,
      digestSha256: async () => {
        clock += 11;
        return syntheticDigest();
      },
      yieldBeforeRecognition: async () => {
        clock += 13;
      },
      onFileTiming: (timing) => timings.push(timing),
    });

    expect(result.failures).toEqual([]);
    expect(xlsx.read).toHaveBeenCalledTimes(1);
    expect(relationSpy).toHaveBeenCalledTimes(1);
    expect(timings).toEqual([
      {
        fileIndex: 0,
        current: 1,
        total: 1,
        outcome: 'recognized',
        failureStage: null,
        fileReadMs: 7,
        manifestMs: 11,
        yieldMs: 13,
        recognitionMs: 88,
        workbookReadMs: 88,
        xlsxReadMs: 17,
        masterRelationRecognitionMs: 19,
        recognizeWorkbookMs: 52,
        canonicalRostersMs: 0,
      },
    ]);
    const sheet = result.successes[0]?.summary.gradeSheets.find((entry) => entry.name === '6A1º');
    expect(sheet).toMatchObject({ rows: 100, columns: 40, range: 'A1:AN100' });
    expect(sheet?.snapshotCellsV8).toBeDefined();
  });

  it('G-T15/G-T19: observadores opcionais que lançam não alteram resultado, falhas nem ordem', async () => {
    async function run(observe: boolean) {
      const events: string[] = [];
      const files = [SYNTHETIC_FILES.xlsx, SYNTHETIC_FILES.empty, SYNTHETIC_FILES.xlsb].map(
        (descriptor) => createSyntheticFile(descriptor, events),
      );
      const throwingObserver = vi.fn(() => {
        throw new Error('sentinela-observador-privado');
      });
      const progress: string[] = [];
      const result = await importWorkbookBatch(
        files,
        createSyntheticSheetJs(events),
        (value) => {
          progress.push(`${value.current}:${value.stage}`);
        },
        {
          now: fixedNow,
          captureValues: true,
          digestSha256: syntheticDigest,
          yieldBeforeRecognition: async () => undefined,
          ...(observe ? { onStageProgress: throwingObserver, onFileTiming: throwingObserver } : {}),
        },
      );
      return { result, events, progress, throwingObserver };
    }

    const plain = await run(false);
    const observed = await run(true);

    expect(observed.result).toEqual(plain.result);
    expect(observed.events).toEqual(plain.events);
    expect(observed.progress).toEqual(plain.progress);
    expect(observed.throwingObserver).toHaveBeenCalledTimes(9);
    expect(observed.result.failures[0]?.message).toBe('A planilha não contém abas reconhecíveis.');
    expect(observed.result.successes.map(({ id }) => id)).toEqual([
      observed.result.batch.files[0]?.id,
      observed.result.batch.files[2]?.id,
    ]);
  });

  it('G-T15: callback do leitor não transforma sucesso nem substitui a exceção real do parser', async () => {
    const file = createSyntheticFile(SYNTHETIC_FILES.xlsx);
    const data = await file.arrayBuffer();
    const xlsx = createSyntheticSheetJs();
    const manifest = await createSourceFileManifest(file, data, xlsx.version, {
      now: fixedNow,
      digestSha256: syntheticDigest,
    });
    const plain = readWorkbookData(file, data, xlsx, manifest, undefined, true);
    const observer = vi.fn(() => {
      throw new Error('sentinela-observador-privado');
    });

    expect(readWorkbookData(file, data, xlsx, manifest, observer, true)).toEqual(plain);
    const parserError = new Error('sentinela-parser-original');
    xlsx.read = () => {
      throw parserError;
    };
    expect(() => readWorkbookData(file, data, xlsx, manifest, observer)).toThrow(parserError);
    expect(observer).toHaveBeenCalledTimes(2);
  });

  it('G-T14/G-T19: Relação válida conserva resultado mestre e não é reconhecida duas vezes', async () => {
    const file = createSyntheticFile(SYNTHETIC_FILES.xlsx);
    const xlsx = createSyntheticSheetJs();
    xlsx.read = () => syntheticRelation();
    const relationSpy = vi.spyOn(relationRecognition, 'recognizeMasterRelationV9');
    const data = await file.arrayBuffer();
    const manifest = await createSourceFileManifest(file, data, xlsx.version, {
      now: fixedNow,
      digestSha256: syntheticDigest,
    });
    const timings: WorkbookReadTimingV1[] = [];

    const result = readWorkbookData(file, data, xlsx, manifest, (timing) => timings.push(timing));

    expect(relationSpy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      academicYear: 2026,
      teacherName: null,
      masterRelationV9: {
        ano: 2026,
        turmas: [{ codigo: '6A', alunos: [[1, 'Estudante Sintético', 0]] }],
      },
    });
    expect(result.gradeSheets).toEqual([]);
    expect(timings[0]).toMatchObject({
      outcome: 'recognized',
      failureStage: null,
      canonicalRostersMs: 0,
    });
    expect(timings[0]?.masterRelationRecognitionMs).toBeGreaterThanOrEqual(0);
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
