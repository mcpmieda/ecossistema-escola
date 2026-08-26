import { describe, expect, it } from 'vitest';
import { genericModelInstanceSchema } from '../shared/banco-notas-generic-model';
import { genericWorkbookPresentationSourceSchema } from '../shared/banco-notas-workbook-presentation';
import { buildGenericWorkbookPresentation } from '../server/banco-notas/workbook-presentation';

const classId = '44444444-4444-4444-8444-444444444444';
const componentA = '55555555-5555-4555-8555-555555555555';
const componentB = '77777777-7777-4777-8777-777777777777';
const studentId = '66666666-6666-4666-8666-666666666666';
const gradeKeyA = `2026|${classId}|${componentA}|${studentId}`;
const gradeKeyB = `2026|${classId}|${componentB}|${studentId}`;
const sheetKeyA = `generated:${classId}:${componentA}`;
const sheetKeyB = `generated:${classId}:${componentB}`;

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
      gradeKey: gradeKeyA,
      field: 'NotaT1',
      sheetKey: sheetKeyA,
      studentPosition: 1,
      cellAddress: 'B2',
    },
    {
      gradeKey: gradeKeyA,
      field: 'NotaFinal',
      sheetKey: sheetKeyA,
      studentPosition: 1,
      cellAddress: 'C2',
    },
    {
      gradeKey: gradeKeyB,
      field: 'NotaT1',
      sheetKey: sheetKeyB,
      studentPosition: 1,
      cellAddress: 'B2',
    },
    {
      gradeKey: gradeKeyB,
      field: 'NotaFinal',
      sheetKey: sheetKeyB,
      studentPosition: 1,
      cellAddress: 'C2',
    },
  ],
});

function source(overrides: Record<string, unknown> = {}) {
  return genericWorkbookPresentationSourceSchema.parse({
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
        sheetKey: sheetKeyB,
        classDisplayName: 'Turma / A',
        componentDisplayName: 'Componente muito extenso com mesmo começo para testar nomes',
        rows: [
          { studentPosition: 1, gradeKey: gradeKeyB, studentDisplayName: 'Estudante' },
        ],
      },
      {
        sheetKey: sheetKeyA,
        classDisplayName: 'Turma / A',
        componentDisplayName: 'Componente muito extenso com mesmo começo para testar nomes',
        rows: [
          { studentPosition: 1, gradeKey: gradeKeyA, studentDisplayName: 'Estudante' },
        ],
      },
    ],
    ...overrides,
  });
}

describe('Banco de Notas workbook presentation builder', () => {
  it('derives safe deterministic unique Excel sheet names from canonical context', () => {
    const first = buildGenericWorkbookPresentation({ instance, source: source() });
    const second = buildGenericWorkbookPresentation({ instance, source: source() });

    expect(first).toEqual(second);
    expect(first.sheets.map((sheet) => sheet.sheetKey)).toEqual([sheetKeyA, sheetKeyB]);
    expect(first.sheets[0]?.displayName).not.toContain('/');
    expect(first.sheets[0]?.displayName.length).toBeLessThanOrEqual(31);
    expect(first.sheets[1]?.displayName.length).toBeLessThanOrEqual(31);
    expect(first.sheets[0]?.displayName).not.toBe(first.sheets[1]?.displayName);
    expect(first.sheets[1]?.displayName).toMatch(/\(2\)$/u);
  });

  it('keeps canonical roster identity and display text separate', () => {
    const result = buildGenericWorkbookPresentation({ instance, source: source() });
    const sheet = result.sheets.find((item) => item.sheetKey === sheetKeyA);

    expect(sheet?.rows[0]).toEqual({
      studentPosition: 1,
      gradeKey: gradeKeyA,
      studentDisplayName: 'Estudante',
    });
    expect(sheet?.displayName).not.toContain(classId);
    expect(sheet?.displayName).not.toContain(componentA);
  });

  it('fails closed when canonical roster identity differs from the generated instance', () => {
    const mismatched = source({
      sheets: [
        {
          sheetKey: sheetKeyA,
          classDisplayName: 'Turma A',
          componentDisplayName: 'Componente A',
          rows: [
            {
              studentPosition: 1,
              gradeKey: '2026|mismatch|mismatch|mismatch',
              studentDisplayName: 'Estudante',
            },
          ],
        },
        {
          sheetKey: sheetKeyB,
          classDisplayName: 'Turma A',
          componentDisplayName: 'Componente B',
          rows: [
            { studentPosition: 1, gradeKey: gradeKeyB, studentDisplayName: 'Estudante' },
          ],
        },
      ],
    });

    expect(() => buildGenericWorkbookPresentation({ instance, source: mismatched })).toThrow(
      'xlsx_presentation_source_roster_does_not_match_mapping',
    );
  });

  it('fails closed when the presentation omits a generated sheet or grade field', () => {
    const missingSheet = source({
      sheets: [
        {
          sheetKey: sheetKeyA,
          classDisplayName: 'Turma A',
          componentDisplayName: 'Componente A',
          rows: [
            { studentPosition: 1, gradeKey: gradeKeyA, studentDisplayName: 'Estudante' },
          ],
        },
      ],
    });
    expect(() => buildGenericWorkbookPresentation({ instance, source: missingSheet })).toThrow(
      'xlsx_presentation_source_sheets_do_not_match_instance',
    );

    const missingField = source({
      gradeHeaders: [{ field: 'NotaT1', label: '1º trimestre' }],
    });
    expect(() => buildGenericWorkbookPresentation({ instance, source: missingField })).toThrow(
      'xlsx_presentation_source_fields_do_not_match_layout',
    );
  });
});
