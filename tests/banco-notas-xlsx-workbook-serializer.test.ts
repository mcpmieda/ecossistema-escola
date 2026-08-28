import { describe, expect, it } from 'vitest';
import { genericModelInstanceSchema } from '../shared/banco-notas-generic-model';
import { genericWorkbookPresentationSchema } from '../shared/banco-notas-workbook-presentation';
import { serializeGenericWorkbook } from '../server/banco-notas/workbook-pipeline';
import { createGenericXlsxWorkbookSerializer } from '../server/banco-notas/xlsx-workbook-serializer';

const sheetKey =
  'generated:44444444-4444-4444-8444-444444444444:55555555-5555-4555-8555-555555555555';
const gradeKey =
  '2026|44444444-4444-4444-8444-444444444444|55555555-5555-4555-8555-555555555555|66666666-6666-4666-8666-666666666666';

const instance = genericModelInstanceSchema.parse({
  schemaVersion: 1,
  modelId: '11111111-1111-4111-8111-111111111111',
  teacherEntraObjectId: '22222222-2222-4222-8222-222222222222',
  schoolYear: 2026,
  definitionVersion: '2026.1',
  sourceHash: 'a'.repeat(64),
  relationshipSnapshotId: '33333333-3333-4333-8333-333333333333',
  environment: 'homologation',
  syncEnabled: false,
  mappingVersion: 3,
  layout: {
    layoutVersion: '2026.1-layout',
    firstStudentRow: 2,
    gradeColumns: [
      { field: 'NotaT1', column: 'B' },
      { field: 'NotaFinal', column: 'C' },
    ],
  },
  mappings: [
    {
      gradeKey,
      field: 'NotaT1',
      sheetKey,
      studentPosition: 1,
      cellAddress: 'B2',
    },
    {
      gradeKey,
      field: 'NotaFinal',
      sheetKey,
      studentPosition: 1,
      cellAddress: 'C2',
    },
  ],
});

function presentation(overrides: Record<string, unknown> = {}) {
  return genericWorkbookPresentationSchema.parse({
    schemaVersion: 1,
    presentationVersion: '2026.1-presentation',
    modelId: instance.modelId,
    schoolYear: 2026,
    title: 'Banco de Notas 2026',
    teacherDisplayName: 'Docente Sintético',
    studentPositionColumn: 'A',
    studentNameColumn: 'D',
    positionHeader: 'Nº',
    studentHeader: 'Estudante',
    gradeHeaders: [
      { field: 'NotaT1', label: '1º trimestre' },
      { field: 'NotaFinal', label: 'Nota final' },
    ],
    sheets: [
      {
        sheetKey,
        displayName: 'Turma A - Matemática',
        classDisplayName: 'Turma A',
        componentDisplayName: 'Matemática',
        rows: [
          {
            studentPosition: 1,
            gradeKey,
            studentDisplayName: 'Estudante Sintético',
          },
        ],
      },
    ],
    ...overrides,
  });
}

function storedEntries(bytes: Uint8Array): Map<string, string> {
  const entries = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    expect(method).toBe(0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return entries;
}

describe('Banco de Notas real XLSX serializer', () => {
  it('creates a deterministic XLSX package with visible grade sheet and veryHidden metadata', async () => {
    const serializer = createGenericXlsxWorkbookSerializer(presentation());
    const first = await serializeGenericWorkbook({ instance, serializer });
    const second = await serializeGenericWorkbook({ instance, serializer });

    expect(first.serializerId).toBe('banco-notas-xlsx-stored-v1:2026.1-presentation');
    expect(first.metadata.format).toBe('xlsx');
    expect(first.bytes[0]).toBe(0x50);
    expect(first.bytes[1]).toBe(0x4b);
    expect(Array.from(first.bytes)).toEqual(Array.from(second.bytes));
    expect(first.metadata.sha256).toBe(second.metadata.sha256);

    const entries = storedEntries(first.bytes);
    expect(entries.has('[Content_Types].xml')).toBe(true);
    expect(entries.has('xl/workbook.xml')).toBe(true);
    expect(entries.has('xl/styles.xml')).toBe(true);
    expect(entries.has('xl/worksheets/sheet1.xml')).toBe(true);
    expect(entries.has('xl/worksheets/sheet2.xml')).toBe(true);

    expect(entries.get('xl/workbook.xml')).toContain('Turma A - Matemática');
    expect(entries.get('xl/workbook.xml')).toContain('name="_BancoNotas"');
    expect(entries.get('xl/workbook.xml')).toContain('state="veryHidden"');
    expect(entries.get('xl/workbook.xml')).toContain('<bookViews><workbookView/></bookViews>');

    const gradeSheet = entries.get('xl/worksheets/sheet1.xml') ?? '';
    expect(gradeSheet).toContain('Estudante Sintético');
    expect(gradeSheet).toContain('1º trimestre');
    expect(gradeSheet).toContain('Nota final');
    expect(gradeSheet).toContain('r="A2"><v>1</v>');
    expect(gradeSheet).toContain('r="D2" t="inlineStr"');
    expect(gradeSheet).toContain(
      '<cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/><col min="3" max="3" width="12" customWidth="1"/><col min="4" max="4" width="32" customWidth="1"/></cols>',
    );
    expect(gradeSheet.indexOf('r="A1"')).toBeLessThan(gradeSheet.indexOf('r="B1"'));
    expect(gradeSheet.indexOf('r="B1"')).toBeLessThan(gradeSheet.indexOf('r="C1"'));
    expect(gradeSheet.indexOf('r="C1"')).toBeLessThan(gradeSheet.indexOf('r="D1"'));

    const metadataSheet = entries.get('xl/worksheets/sheet2.xml') ?? '';
    expect(metadataSheet).toContain(instance.modelId);
    expect(metadataSheet).toContain(instance.relationshipSnapshotId);
    expect(metadataSheet).toContain(sheetKey);
    expect(metadataSheet).toContain(gradeKey);
    expect(metadataSheet).toContain('B2');
    expect(metadataSheet).toContain('C2');
    expect(metadataSheet).toContain('2026.1-presentation');
  });

  it('fails closed when presentation columns collide with the versioned grade layout', async () => {
    const serializer = createGenericXlsxWorkbookSerializer(
      presentation({ studentPositionColumn: 'A', studentNameColumn: 'B' }),
    );
    await expect(serializeGenericWorkbook({ instance, serializer })).rejects.toThrow(
      'xlsx_student_column_collides_with_grade_layout',
    );
  });

  it('fails closed when a canonical roster row does not match the mapping grade key', async () => {
    const badPresentation = presentation({
      sheets: [
        {
          sheetKey,
          displayName: 'Turma A - Matemática',
          classDisplayName: 'Turma A',
          componentDisplayName: 'Matemática',
          rows: [
            {
              studentPosition: 1,
              gradeKey: '2026|another-canonical-grade-key',
              studentDisplayName: 'Estudante Sintético',
            },
          ],
        },
      ],
    });
    const serializer = createGenericXlsxWorkbookSerializer(badPresentation);
    await expect(serializeGenericWorkbook({ instance, serializer })).rejects.toThrow(
      'xlsx_presentation_roster_does_not_match_mapping',
    );
  });

  it('rejects unsafe or duplicate Excel sheet names before serialization', () => {
    expect(() =>
      presentation({
        sheets: [
          {
            sheetKey,
            displayName: 'Turma/A',
            classDisplayName: 'Turma A',
            componentDisplayName: 'Matemática',
            rows: [{ studentPosition: 1, gradeKey, studentDisplayName: 'Estudante Sintético' }],
          },
        ],
      }),
    ).toThrow('sheet name contains an invalid Excel character');
  });
});
