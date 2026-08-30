// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { institutionalManualXlsxProfile } from '../shared/banco-notas-institutional-xlsx-profile';
import { createGenericXlsxLegacyAnalyzer } from '../server/banco-notas/xlsx-legacy-analyzer';
import { analyzeLegacyWorkbook } from '../server/banco-notas/workbook-pipeline';

const privateWorkbook = process.env.BANCO_NOTAS_PRIVATE_MANUAL_XLSX;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Banco de Notas private manual import regression', () => {
  it.skipIf(!privateWorkbook)(
    'reads the authorized private copy without exposing workbook content',
    async () => {
      const file = await readFile(privateWorkbook!);
      const bytes = new Uint8Array(file.byteLength);
      bytes.set(file);
      const verified = await analyzeLegacyWorkbook({
        source: {
          metadata: {
            sourceFormat: 'xlsx',
            sourceHash: await sha256(bytes),
            byteLength: bytes.byteLength,
            schoolYear: 2026,
          },
          bytes,
        },
        analyzer: createGenericXlsxLegacyAnalyzer(institutionalManualXlsxProfile),
      });

      expect(verified.model.classes.length).toBeGreaterThan(0);
      expect(verified.model.components.length).toBeGreaterThan(0);
      expect(verified.model.students.length).toBeGreaterThan(0);
      expect(verified.model.gradeSlots.length).toBeGreaterThan(0);
      expect(
        verified.model.students.every((student) => student.studentPosition !== undefined),
      ).toBe(true);
      expect(
        verified.model.students.every(
          (student) =>
            student.sourceLocator.sheetDisplayName.endsWith('VG') &&
            /^K[5-9]|K[1-4][0-9]|K50$/u.test(student.sourceLocator.cellAddress ?? ''),
        ),
      ).toBe(true);
      expect(verified.model.gradeSlots.every((slot) => slot.sourceLocator.cellAddress)).toBe(true);
    },
  );
});
