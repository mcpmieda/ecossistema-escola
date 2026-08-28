import { describe, expect, it } from 'vitest';
import {
  genericModelDefinitionSchema,
  genericModelInstanceSchema,
} from '../shared/banco-notas-generic-model';
import { genericWorkbookPresentationSchema } from '../shared/banco-notas-workbook-presentation';
import { xlsxLegacyAnalysisProfileSchema } from '../shared/banco-notas-xlsx-analysis-profile';
import {
  buildGenericTransformationPlan,
  generateGenericModelInstance,
} from '../server/banco-notas/generic-model';
import { createGenericXlsxLegacyAnalyzer } from '../server/banco-notas/xlsx-legacy-analyzer';
import { createGenericXlsxWorkbookSerializer } from '../server/banco-notas/xlsx-workbook-serializer';
import { buildGenericWorkbookPresentation } from '../server/banco-notas/workbook-presentation';
import {
  analyzeLegacyWorkbook,
  serializeGenericWorkbook,
} from '../server/banco-notas/workbook-pipeline';

const classId = '44444444-4444-4444-8444-444444444444';
const componentId = '55555555-5555-4555-8555-555555555555';
const studentId = '66666666-6666-4666-8666-666666666666';
const initialModelId = '11111111-1111-4111-8111-111111111111';
const regeneratedModelId = '77777777-7777-4777-8777-777777777777';
const teacherId = '22222222-2222-4222-8222-222222222222';
const relationshipSnapshotId = '33333333-3333-4333-8333-333333333333';
const regeneratedRelationshipSnapshotId = '88888888-8888-4888-8888-888888888888';
const sheetKey = `generated:${classId}:${componentId}`;
const gradeKey = `2026|${classId}|${componentId}|${studentId}`;

const definition = genericModelDefinitionSchema.parse({
  schemaVersion: 1,
  definitionVersion: '2026.1-roundtrip',
  blankMeans: 'absent',
  calculationAuthority: 'server',
  relationshipMode: 'manual-wizard',
  defaultEnvironment: 'homologation',
  defaultSyncEnabled: false,
  gradeFields: ['NotaT1', 'NotaFinal'],
  layout: {
    layoutVersion: '2026.1-roundtrip-layout',
    firstStudentRow: 2,
    gradeColumns: [
      { field: 'NotaT1', column: 'B' },
      { field: 'NotaFinal', column: 'C' },
    ],
  },
});

const initialInstance = genericModelInstanceSchema.parse({
  schemaVersion: 1,
  modelId: initialModelId,
  teacherEntraObjectId: teacherId,
  schoolYear: 2026,
  definitionVersion: definition.definitionVersion,
  sourceHash: 'a'.repeat(64),
  relationshipSnapshotId,
  environment: 'homologation',
  syncEnabled: false,
  mappingVersion: 1,
  layout: definition.layout,
  mappings: [
    { gradeKey, field: 'NotaT1', sheetKey, studentPosition: 1, cellAddress: 'B2' },
    { gradeKey, field: 'NotaFinal', sheetKey, studentPosition: 1, cellAddress: 'C2' },
  ],
});

const initialPresentation = genericWorkbookPresentationSchema.parse({
  schemaVersion: 1,
  presentationVersion: '2026.1-roundtrip-presentation',
  modelId: initialInstance.modelId,
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

const profile = xlsxLegacyAnalysisProfileSchema.parse({
  schemaVersion: 1,
  profileId: 'synthetic-roundtrip-v1',
  analysisVersion: 'xlsx-roundtrip-v1',
  worksheetRules: [
    {
      ruleId: 'class-component',
      sheetNamePattern: '^(?<class>.+?) - (?<component>.+)$',
      caseInsensitive: false,
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

function exactlyOne<T>(items: readonly T[], label: string): T {
  if (items.length !== 1 || !items[0]) throw new Error(`roundtrip_expected_one_${label}`);
  return items[0];
}

function sourceFromArtifact(artifact: Awaited<ReturnType<typeof serializeGenericWorkbook>>) {
  return {
    metadata: {
      sourceFormat: 'xlsx' as const,
      sourceHash: artifact.metadata.sha256,
      byteLength: artifact.bytes.byteLength,
      schoolYear: 2026,
    },
    bytes: artifact.bytes,
  };
}

describe('Banco de Notas XLSX complete round trip', () => {
  it('preserves generic academic structure through analyze, transform, regenerate, and reanalyze', async () => {
    const firstArtifact = await serializeGenericWorkbook({
      instance: initialInstance,
      serializer: createGenericXlsxWorkbookSerializer(initialPresentation),
    });
    const firstAnalysis = await analyzeLegacyWorkbook({
      source: sourceFromArtifact(firstArtifact),
      analyzer: createGenericXlsxLegacyAnalyzer(profile),
    });

    const sourceClass = exactlyOne(firstAnalysis.model.classes, 'class');
    const sourceComponent = exactlyOne(firstAnalysis.model.components, 'component');
    const sourceStudent = exactlyOne(firstAnalysis.model.students, 'student');

    const plan = buildGenericTransformationPlan({
      legacy: firstAnalysis.model,
      definition,
      relationshipSnapshotId: regeneratedRelationshipSnapshotId,
      resolutions: [
        {
          sourceClassId: sourceClass.sourceClassId,
          classGroupId: classId,
          sourceComponentId: sourceComponent.sourceComponentId,
          componentId,
          sourceStudentId: sourceStudent.sourceStudentId,
          studentId,
          studentPosition: 1,
        },
      ],
    });

    expect(plan.readyToGenerate).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(plan.mappings).toHaveLength(2);
    expect(new Set(plan.mappings.map((mapping) => mapping.gradeKey))).toEqual(new Set([gradeKey]));

    const regeneratedInstance = generateGenericModelInstance({
      plan,
      modelId: regeneratedModelId,
      teacherEntraObjectId: teacherId,
      mappingVersion: 2,
    });

    expect(regeneratedInstance).toMatchObject({
      environment: 'homologation',
      syncEnabled: false,
      sourceHash: firstAnalysis.model.sourceHash,
      relationshipSnapshotId: regeneratedRelationshipSnapshotId,
    });
    expect(regeneratedInstance.mappings.map((mapping) => mapping.cellAddress).sort()).toEqual([
      'B2',
      'C2',
    ]);

    const regeneratedPresentation = buildGenericWorkbookPresentation({
      instance: regeneratedInstance,
      source: {
        schemaVersion: 1,
        presentationVersion: '2026.1-roundtrip-regenerated',
        modelId: regeneratedInstance.modelId,
        schoolYear: regeneratedInstance.schoolYear,
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
            classDisplayName: sourceClass.displayName,
            componentDisplayName: sourceComponent.displayName,
            rows: [
              {
                studentPosition: 1,
                gradeKey,
                studentDisplayName: sourceStudent.displayName,
              },
            ],
          },
        ],
      },
    });

    const regeneratedArtifact = await serializeGenericWorkbook({
      instance: regeneratedInstance,
      serializer: createGenericXlsxWorkbookSerializer(regeneratedPresentation),
    });

    expect(regeneratedArtifact.metadata.sourceHash).toBe(firstAnalysis.model.sourceHash);
    expect(regeneratedArtifact.metadata.modelId).toBe(regeneratedModelId);

    const secondAnalysis = await analyzeLegacyWorkbook({
      source: sourceFromArtifact(regeneratedArtifact),
      analyzer: createGenericXlsxLegacyAnalyzer(profile),
    });

    expect(secondAnalysis.model.sourceHash).toBe(regeneratedArtifact.metadata.sha256);
    expect(secondAnalysis.model.classes.map((item) => item.displayName)).toEqual(
      firstAnalysis.model.classes.map((item) => item.displayName),
    );
    expect(secondAnalysis.model.components.map((item) => item.displayName)).toEqual(
      firstAnalysis.model.components.map((item) => item.displayName),
    );
    expect(secondAnalysis.model.students.map((item) => item.displayName)).toEqual(
      firstAnalysis.model.students.map((item) => item.displayName),
    );
    expect(secondAnalysis.model.gradeSlots.map((item) => item.field).sort()).toEqual([
      'NotaFinal',
      'NotaT1',
    ]);
    expect(
      secondAnalysis.model.gradeSlots.map((item) => item.sourceLocator.cellAddress).sort(),
    ).toEqual(['B2', 'C2']);
    expect(secondAnalysis.model.findings).toEqual([]);
  });
});
