import { describe, expect, it } from 'vitest';
import { xlsxLegacyAnalysisProfileSchema } from '../shared/banco-notas-xlsx-analysis-profile';
import { createGenericXlsxLegacyAnalyzer } from '../server/banco-notas/xlsx-legacy-analyzer';
import { analyzeLegacyWorkbook } from '../server/banco-notas/workbook-pipeline';
import { createManualXlsxFixture, manualXlsxProfile } from './fixtures/banco-notas-manual-xlsx';

async function source(
  options: Parameters<typeof createManualXlsxFixture>[0] = {},
): Promise<{
  metadata: {
    sourceFormat: 'xlsx';
    sourceHash: string;
    byteLength: number;
    schoolYear: number;
  };
  bytes: Uint8Array;
}> {
  const bytes = createManualXlsxFixture(options);
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stable);
  const sourceHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    metadata: {
      sourceFormat: 'xlsx',
      sourceHash,
      byteLength: bytes.byteLength,
      schoolYear: 2026,
    },
    bytes,
  };
}

describe('Banco de Notas XLSX analyzer', () => {
  it('reads the synthetic workbook used by the active manual-import flow', async () => {
    const verified = await analyzeLegacyWorkbook({
      source: await source(),
      analyzer: createGenericXlsxLegacyAnalyzer(manualXlsxProfile),
    });

    expect(verified.analyzerId).toContain('banco-notas-xlsx-ooxml-v1');
    expect(verified.model.classes.map((item) => item.displayName)).toEqual(['Turma A']);
    expect(verified.model.components.map((item) => item.displayName)).toEqual(['Matemática']);
    expect(verified.model.students.map((item) => item.displayName)).toEqual([
      'Estudante Sintético',
    ]);
    expect(verified.model.students.map((item) => item.studentPosition)).toEqual([1]);
    expect(verified.model.gradeSlots.map((item) => item.field).sort()).toEqual([
      'NotaFinal',
      'NotaT1',
    ]);
    expect(verified.model.gradeSlots.map((item) => item.sourceValue)).toEqual([null, null]);
  });

  it('preserves numeric zero as a grade instead of treating it as absence', async () => {
    const verified = await analyzeLegacyWorkbook({
      source: await source({ notaT1: 8.5, notaFinal: 0 }),
      analyzer: createGenericXlsxLegacyAnalyzer(manualXlsxProfile),
    });

    const values = new Map(verified.model.gradeSlots.map((item) => [item.field, item.sourceValue]));
    expect(values.get('NotaT1')).toBe(8.5);
    expect(values.get('NotaFinal')).toBe(0);
  });

  it('reads DEFLATE-compressed XLSX packages', async () => {
    const verified = await analyzeLegacyWorkbook({
      source: await source({ compressed: true }),
      analyzer: createGenericXlsxLegacyAnalyzer(manualXlsxProfile),
    });

    expect(verified.model.students).toHaveLength(1);
    expect(verified.model.gradeSlots).toHaveLength(2);
  });

  it('does not let a self-closing empty cell swallow the next cell', async () => {
    const profile = xlsxLegacyAnalysisProfileSchema.parse({
      ...manualXlsxProfile,
      profileId: 'self-closing-regression-v1',
      worksheetRules: [
        {
          ...manualXlsxProfile.worksheetRules[0]!,
          sheetNamePattern: '^(?<class>.+?) - .+$',
          componentNameCell: 'K1',
        },
      ],
    });
    const verified = await analyzeLegacyWorkbook({
      source: await source({
        firstRowXml:
          '<row r="1"><c r="J1"/><c r="K1" t="inlineStr"><is><t>Matemática</t></is></c></row>',
      }),
      analyzer: createGenericXlsxLegacyAnalyzer(profile),
    });

    expect(verified.model.components.map((item) => item.displayName)).toEqual(['Matemática']);
  });

  it('fails closed for XLSB because the active parser supports XLSX only', async () => {
    await expect(
      analyzeLegacyWorkbook({
        source: {
          metadata: {
            sourceFormat: 'xlsb',
            sourceHash: 'a'.repeat(64),
            byteLength: 1,
            schoolYear: 2026,
          },
          bytes: new Uint8Array([1]),
        },
        analyzer: createGenericXlsxLegacyAnalyzer(manualXlsxProfile),
      }),
    ).rejects.toThrow('workbook_format_not_supported:xlsb');
  });
});
