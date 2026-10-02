import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SourceFileManifestV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import { isGradebookImportPersistenceRequestV9 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import { createGradebookCanonicalImportRequestV9 } from '../../../src/features/gradebook/import/canonical-import-v9';
import { createSourceFileManifest } from '../../../src/features/gradebook/import/file-manifest';
import { collectGradebookImportDiagnosticsV1 } from '../../../src/features/gradebook/import/import-diagnostics-v1';
import type { readWorkbookData as OriginalReadWorkbookData } from '../../../src/features/gradebook/import/workbook-reader';
import { loadCandidateReaderV1 } from '../fixtures/reader-candidate-v1';
import {
  WORKBOOK_READER_EQUIVALENCE_CASES_V1,
  createFixtureSheetJsV1,
  densifyFixtureV1,
  syntheticResultV1,
  type WorkbookFixtureV1,
} from '../fixtures/workbook-reader-equivalence-v1';

let readWorkbookData: typeof OriginalReadWorkbookData;
beforeAll(async () => {
  ({ readWorkbookData } = await loadCandidateReaderV1());
});

const bytes = Uint8Array.of(1, 2, 3, 4).buffer;
const file = new File([bytes], 'Notas - Docente Fictício - 2026.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  lastModified: Date.UTC(2026, 0, 5),
});
const manifest: SourceFileManifestV1 = {
  id: 'source-file-manifest:reader-equivalence' as SourceFileManifestV1['id'],
  fileName: file.name,
  extension: 'xlsx',
  reportedMimeType: file.type,
  sizeBytes: bytes.byteLength,
  lastModifiedAt: new Date(file.lastModified).toISOString(),
  sha256: 'a'.repeat(64),
  sourceContractVersion: 2,
  parserVersion: 'functional-fixture-adapter',
  readAt: '2026-10-02T12:00:00.000Z',
};

function output(workbook: WorkbookFixtureV1, provenance = manifest) {
  let summary: ReturnType<typeof readWorkbookData>;
  try {
    summary = readWorkbookData(
      file,
      bytes,
      createFixtureSheetJsV1(workbook),
      provenance,
      undefined,
      true,
    );
  } catch (error) {
    return {
      kind: 'reader-error' as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const result = syntheticResultV1(provenance, summary);
  const diagnostics = collectGradebookImportDiagnosticsV1(result);
  try {
    const request = createGradebookCanonicalImportRequestV9(result);
    expect(isGradebookImportPersistenceRequestV9(request)).toBe(true);
    return { kind: 'request' as const, summary, diagnostics, request };
  } catch (error) {
    return {
      kind: 'canonical-error' as const,
      summary,
      diagnostics,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function fixture(id: string): WorkbookFixtureV1 {
  const selected = WORKBOOK_READER_EQUIVALENCE_CASES_V1.find((value) => value.id === id);
  if (!selected) throw new Error(`Fixture inexistente: ${id}`);
  return structuredClone(selected.workbook);
}

describe('equivalência funcional do leitor — objetos, sem benchmark de parsing', () => {
  it.each(WORKBOOK_READER_EQUIVALENCE_CASES_V1)(
    'H-R04–16: $id conserva resumo, diagnóstico, canônico e recusa',
    (testCase) => {
      const sparse = structuredClone(testCase.workbook);
      const dense = densifyFixtureV1(testCase.workbook);
      const beforeSparse = structuredClone(sparse);
      const beforeDense = structuredClone(dense);
      const originalBytes = new Uint8Array(bytes).slice();
      const sparseOutput = output(sparse);
      const denseOutput = output(dense);
      expect(sparseOutput.kind, 'error' in sparseOutput ? sparseOutput.error : undefined).toBe(
        testCase.expectation,
      );
      expect(denseOutput).toStrictEqual(sparseOutput);
      if (testCase.error !== undefined) {
        expect(sparseOutput).toHaveProperty('error', testCase.error);
      }
      if (sparseOutput.kind === 'request') {
        if (sparseOutput.request.operation === 'persist-notas') {
          expect(sparseOutput.summary.gradeSheets.length).toBeGreaterThan(0);
          expect(sparseOutput.request.ofertas.length).toBeGreaterThan(0);
        } else {
          expect(sparseOutput.request.turmas.length).toBeGreaterThan(0);
        }
      }
      expect(sparse).toStrictEqual(beforeSparse);
      expect(dense).toStrictEqual(beforeDense);
      expect(new Uint8Array(bytes)).toStrictEqual(originalBytes);
    },
  );

  it('H-I02: repetição usa o mesmo manifesto, não altera os bytes e mantém todas as saídas', () => {
    const workbook = fixture('teacher');
    const original = new Uint8Array(bytes).slice();
    const first = output(workbook);
    const second = output(workbook);
    expect(first.kind).toBe('request');
    expect(second).toStrictEqual(first);
    expect(new Uint8Array(bytes)).toStrictEqual(original);
  });

  it('H-I03: somente readAt muda na proveniência temporal; canônico e diagnóstico são estáveis', async () => {
    const runtime = { digestSha256: async () => new Uint8Array(32).fill(10).buffer };
    const first = await createSourceFileManifest(file, bytes, manifest.parserVersion, {
      ...runtime,
      now: () => new Date('2026-10-02T12:00:00.000Z'),
    });
    const second = await createSourceFileManifest(file, bytes, manifest.parserVersion, {
      ...runtime,
      now: () => new Date('2026-10-02T12:01:00.000Z'),
    });
    expect(first.readAt).not.toBe(second.readAt);
    expect({ ...first, readAt: second.readAt }).toStrictEqual(second);
    expect(output(fixture('teacher'), first)).toStrictEqual(output(fixture('teacher'), second));
  });

  it('H-R04/06/07: zero, decimal, fórmula zero e cache ausente mantêm seus estados', () => {
    const manual = output(densifyFixtureV1(fixture('teacher')));
    const formulas = output(densifyFixtureV1(fixture('formula-caches')));
    if (manual.kind !== 'request' || formulas.kind !== 'request') {
      throw new Error('Fixtures devem produzir pedidos docentes.');
    }
    const manualSheet = manual.summary.gradeSheets.find((value) => value.name === '6A1º');
    expect(manualSheet?.students[0]?.quantitativeAssessments[0]).toStrictEqual({
      source: 0.1,
      value: 0.1,
      kind: 'manual',
    });
    expect(manualSheet?.snapshotCellsV8?.R5).toBe(0.1);
    expect(manualSheet?.snapshotCellsV8?.S5).toBe(0);
    const formulaSheet = formulas.summary.gradeSheets.find((value) => value.name === '6A1º');
    expect(formulaSheet?.students[0]?.quantitativeAssessments[0]).toBeNull();
    expect(formulaSheet?.students[0]?.quantitativeAssessments[1]).toStrictEqual({
      source: 7.5,
      value: 7.5,
      kind: 'formula',
      formula: 'SUM(S6:S7)',
    });
    expect(formulaSheet?.snapshotCellsV8).toMatchObject({
      R5: 0,
      S5: 7.5,
      AA5: null,
      AB5: ['u'],
      AC5: ['u'],
      AM5: ['u'],
    });
    expect(formulaSheet?.students[0]?.termResultObservations?.quantitativeTotal).toStrictEqual({
      classification: 'formula-zero',
      rawValue: 0,
      formula: 'SUM(R5:S5)',
      cachedValue: 0,
    });
  });

  it('H-R07/08: fórmula sem cache conserva o erro formatado e indisponibilidade', () => {
    const result = output(densifyFixtureV1(fixture('formatted-text-fallback')));
    expect(result.kind).toBe('request');
    if (result.kind !== 'request') throw new Error('Fixture docente deve produzir pedido.');
    expect(result.summary.teacherName).toBe('Docente Fictício Formatado');
    const sheet = result.summary.gradeSheets.find((value) => value.name === '6A1º');
    expect(sheet?.students[0]?.termResultObservations?.officialTermGrade).toStrictEqual({
      classification: 'formula-error-or-missing-cache',
      rawValue: null,
      formula: 'SUM(T5:AK5)',
      cachedValue: null,
      sourceError: '#VALUE!',
    });
    expect(sheet?.snapshotCellsV8?.AM5).toStrictEqual(['u']);
    expect(result.diagnostics.some((value) => value.code === 'source-unavailable')).toBe(true);
  });

  it('H-R09: fullref é dimensão original e não amplia o domínio de captura', () => {
    const result = output(densifyFixtureV1(fixture('dimensions-fullref')));
    expect(result.kind).toBe('request');
    if (result.kind !== 'request') throw new Error('Fixture docente deve produzir pedido.');
    const sheet = result.summary.gradeSheets.find((value) => value.name === '6A1º');
    expect(sheet).toMatchObject({ range: 'A1:AZ100000', rows: 100000, columns: 52 });
    expect(sheet?.students.every((student) => student.row <= 50)).toBe(true);
    expect(
      Object.keys(sheet?.snapshotCellsV8 ?? {}).some((address) => address.endsWith('100000')),
    ).toBe(false);
  });

  it('H-R12: lê transferência e a posição AZ48 da Relação', () => {
    const result = output(densifyFixtureV1(fixture('relation')));
    expect(result.kind).toBe('request');
    if (result.kind !== 'request' || result.request.operation !== 'persist-relacao') {
      throw new Error('Fixture deve produzir Relação.');
    }
    expect(result.request.turmas.find((value) => value.codigo === '6A')?.alunos[1]).toStrictEqual([
      2,
      'Estudante Fictício Transferido',
      6,
      '6B',
    ]);
    expect(result.request.turmas.find((value) => value.codigo === '6B')?.alunos[0]).toStrictEqual([
      2,
      'Estudante Fictício Transferido',
      7,
      '6A',
    ]);
    expect(result.request.turmas.find((value) => value.codigo === '9V')?.alunos).toStrictEqual([
      [46, 'Estudante Fictício Último', 0],
    ]);
  });

  it('H-R18: callback que lança não substitui resultado nem erro original do parser', () => {
    const callback = vi.fn(() => {
      throw new Error('Falha diagnóstica sintética');
    });
    const workbook = fixture('teacher');
    const expected = readWorkbookData(
      file,
      bytes,
      createFixtureSheetJsV1(workbook),
      manifest,
      undefined,
      true,
    );
    expect(
      readWorkbookData(file, bytes, createFixtureSheetJsV1(workbook), manifest, callback, true),
    ).toStrictEqual(expected);
    const parser = createFixtureSheetJsV1(workbook);
    const original = new Error('Falha original de bytes sintéticos');
    parser.read = () => {
      throw original;
    };
    expect(() => readWorkbookData(file, bytes, parser, manifest, callback, true)).toThrow(original);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
