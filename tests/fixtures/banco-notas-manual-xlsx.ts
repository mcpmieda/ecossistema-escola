import { genericModelInstanceSchema } from '../../shared/banco-notas-generic-model';
import { genericWorkbookPresentationSchema } from '../../shared/banco-notas-workbook-presentation';
import { xlsxLegacyAnalysisProfileSchema } from '../../shared/banco-notas-xlsx-analysis-profile';
import { createGenericXlsxWorkbookSerializer } from '../../server/banco-notas/xlsx-workbook-serializer';
import { serializeGenericWorkbook } from '../../server/banco-notas/workbook-pipeline';

const classId = '44444444-4444-4444-8444-444444444444';
const componentId = '55555555-5555-4555-8555-555555555555';
const studentId = '66666666-6666-4666-8666-666666666666';
const sheetKey = `generated:${classId}:${componentId}`;
const gradeKey = `2026|${classId}|${componentId}|${studentId}`;

export const manualXlsxProfile = xlsxLegacyAnalysisProfileSchema.parse({
  schemaVersion: 1,
  profileId: 'manual-upload-synthetic-v1',
  analysisVersion: 'manual-upload-v1',
  worksheetRules: [
    {
      ruleId: 'class-component',
      sheetNamePattern: '^(?<class>.+?) - (?<component>.+)$',
      caseInsensitive: false,
      studentPositionColumn: 'A',
      studentNameColumn: 'D',
      firstStudentRow: 2,
      maxStudentRows: 100,
      gradeColumns: [
        { field: 'NotaT1', column: 'B' },
        { field: 'NotaFinal', column: 'C' },
      ],
    },
  ],
});

export async function createManualXlsxFixture(): Promise<Uint8Array> {
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
    mappingVersion: 1,
    layout: {
      layoutVersion: '2026.1-layout',
      firstStudentRow: 2,
      gradeColumns: [
        { field: 'NotaT1', column: 'B' },
        { field: 'NotaFinal', column: 'C' },
      ],
    },
    mappings: [
      { gradeKey, field: 'NotaT1', sheetKey, studentPosition: 1, cellAddress: 'B2' },
      { gradeKey, field: 'NotaFinal', sheetKey, studentPosition: 1, cellAddress: 'C2' },
    ],
  });
  const presentation = genericWorkbookPresentationSchema.parse({
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
        rows: [{ studentPosition: 1, gradeKey, studentDisplayName: 'Estudante Sintético' }],
      },
    ],
  });
  const artifact = await serializeGenericWorkbook({
    instance,
    serializer: createGenericXlsxWorkbookSerializer(presentation),
  });
  return artifact.bytes;
}
