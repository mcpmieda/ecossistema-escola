import { describe, expect, it, vi } from 'vitest';
import { genericModelInstanceSchema } from '../shared/banco-notas-generic-model';
import { genericWorkbookPresentationSchema } from '../shared/banco-notas-workbook-presentation';
import { xlsxLegacyAnalysisProfileSchema } from '../shared/banco-notas-xlsx-analysis-profile';
import { storeShareAndVerifyTeacherModel } from '../server/banco-notas/teacher-model-graph';
import { createGenericXlsxLegacyAnalyzer } from '../server/banco-notas/xlsx-legacy-analyzer';
import { createGenericXlsxWorkbookSerializer } from '../server/banco-notas/xlsx-workbook-serializer';
import {
  analyzeLegacyWorkbook,
  serializeGenericWorkbook,
} from '../server/banco-notas/workbook-pipeline';

const modelId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-3333-4333-8333-333333333333';
const componentId = '44444444-4444-4444-8444-444444444444';
const studentId = '55555555-5555-4555-8555-555555555555';
const relationshipSnapshotId = '66666666-6666-4666-8666-666666666666';
const sheetKey = `generated:${classId}:${componentId}`;
const gradeKey = `2026|${classId}|${componentId}|${studentId}`;

const instance = genericModelInstanceSchema.parse({
  schemaVersion: 1,
  modelId,
  teacherEntraObjectId: teacherId,
  schoolYear: 2026,
  definitionVersion: '2026.1-graph-roundtrip',
  sourceHash: 'a'.repeat(64),
  relationshipSnapshotId,
  environment: 'homologation',
  syncEnabled: false,
  mappingVersion: 1,
  layout: {
    layoutVersion: '2026.1-graph-roundtrip-layout',
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
  presentationVersion: '2026.1-graph-roundtrip-presentation',
  modelId,
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
  profileId: 'synthetic-graph-roundtrip-v1',
  analysisVersion: 'xlsx-graph-roundtrip-v1',
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

describe('Banco de Notas Graph XLSX round trip', () => {
  it('serializes, stores, downloads, hashes and reanalyzes the same generic workbook', async () => {
    const artifact = await serializeGenericWorkbook({
      instance,
      serializer: createGenericXlsxWorkbookSerializer(presentation),
    });
    const downloaded = new Uint8Array(artifact.bytes);
    const gateway = {
      store: vi.fn(async () => ({ driveItemId: 'item-graph-roundtrip', etag: 'stored' })),
      share: vi.fn(async () => ({ permissionId: 'permission-graph-roundtrip' })),
      metadata: vi.fn(async () => ({ etag: 'verified', size: downloaded.byteLength })),
      download: vi.fn(async () => new Uint8Array(downloaded)),
      revokeShare: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const audit = { record: vi.fn(async () => undefined) };
    const verifyDownloadedWorkbook = vi.fn(async ({ content }: { content: Uint8Array }) => {
      const analysis = await analyzeLegacyWorkbook({
        source: {
          metadata: {
            sourceFormat: 'xlsx',
            sourceHash: artifact.metadata.sha256,
            byteLength: content.byteLength,
            schoolYear: 2026,
          },
          bytes: content,
        },
        analyzer: createGenericXlsxLegacyAnalyzer(profile),
      });
      expect(analysis.model.classes.map((item) => item.displayName)).toEqual(['Turma A']);
      expect(analysis.model.components.map((item) => item.displayName)).toEqual(['Matemática']);
      expect(analysis.model.students.map((item) => item.displayName)).toEqual([
        'Estudante Sintético',
      ]);
      expect(analysis.model.findings).toEqual([]);
    });

    await storeShareAndVerifyTeacherModel({
      model: {
        teacherModelId: modelId,
        fileName: 'modelo-generico-sintetico.xlsx',
        modelHash: artifact.metadata.sha256,
        definitionVersion: instance.definitionVersion,
        mappingVersion: instance.mappingVersion,
        content: artifact.bytes,
      },
      recipient: {
        entraObjectId: teacherId,
        upn: 'professor.synthetic@example.edu',
      },
      gateway,
      audit,
      verifyDownloadedWorkbook,
      correlationId: 'graph-roundtrip-correlation',
    });

    expect(gateway.download).toHaveBeenCalledOnce();
    expect(verifyDownloadedWorkbook).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ result: 'succeeded' }));
  });
});
