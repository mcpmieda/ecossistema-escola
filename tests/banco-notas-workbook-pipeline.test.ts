import { describe, expect, it, vi } from 'vitest';
import {
  genericModelInstanceSchema,
  legacyIntermediateModelSchema,
} from '../shared/banco-notas-generic-model';
import type {
  GenericWorkbookSerializer,
  LegacyWorkbookAnalyzer,
  LegacyWorkbookSource,
} from '../server/banco-notas/workbook-pipeline';
import {
  analyzeLegacyWorkbook,
  serializeGenericWorkbook,
} from '../server/banco-notas/workbook-pipeline';

async function sha256(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stableBytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function source(format: 'xlsb' | 'xlsx' = 'xlsx'): Promise<LegacyWorkbookSource> {
  const bytes = new TextEncoder().encode(`synthetic-${format}-workbook`);
  return {
    metadata: {
      sourceFormat: format,
      sourceHash: await sha256(bytes),
      byteLength: bytes.byteLength,
      schoolYear: 2026,
    },
    bytes,
  };
}

function analyzer(overrides: Partial<LegacyWorkbookAnalyzer> = {}): LegacyWorkbookAnalyzer {
  return {
    id: 'synthetic-xlsx-analyzer',
    supportedFormats: ['xlsx'],
    async analyze(input) {
      return legacyIntermediateModelSchema.parse({
        schemaVersion: 1,
        sourceFormat: input.metadata.sourceFormat,
        sourceHash: input.metadata.sourceHash,
        schoolYear: input.metadata.schoolYear,
        analysisVersion: 'synthetic-1',
        classes: [],
        components: [],
        students: [],
        gradeSlots: [],
        findings: [],
      });
    },
    ...overrides,
  };
}

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
    gradeColumns: [{ field: 'NotaT1', column: 'B' }],
  },
  mappings: [
    {
      gradeKey:
        '2026|44444444-4444-4444-8444-444444444444|55555555-5555-4555-8555-555555555555|66666666-6666-4666-8666-666666666666',
      field: 'NotaT1',
      sheetKey:
        'generated:44444444-4444-4444-8444-444444444444:55555555-5555-4555-8555-555555555555',
      studentPosition: 1,
      cellAddress: 'B2',
    },
  ],
});

async function serializer(
  mutateMetadata: (metadata: Record<string, unknown>) => Record<string, unknown> = (metadata) =>
    metadata,
): Promise<GenericWorkbookSerializer> {
  const bytes = new TextEncoder().encode('synthetic-generated-xlsx');
  const metadata = mutateMetadata({
    format: 'xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sha256: await sha256(bytes),
    byteLength: bytes.byteLength,
    modelId: instance.modelId,
    definitionVersion: instance.definitionVersion,
    layoutVersion: instance.layout.layoutVersion,
    mappingVersion: instance.mappingVersion,
    sourceHash: instance.sourceHash,
    relationshipSnapshotId: instance.relationshipSnapshotId,
  });

  return {
    id: 'synthetic-xlsx-serializer',
    async serialize() {
      return { metadata, bytes } as Awaited<ReturnType<GenericWorkbookSerializer['serialize']>>;
    },
  };
}

describe('Banco de Notas workbook pipeline boundaries', () => {
  it('verifies source bytes and preserves analyzer provenance', async () => {
    const input = await source('xlsx');
    const analyze = vi.fn(analyzer().analyze);

    const result = await analyzeLegacyWorkbook({
      source: input,
      analyzer: analyzer({ analyze }),
    });

    expect(analyze).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      analyzerId: 'synthetic-xlsx-analyzer',
      metadata: input.metadata,
      model: {
        sourceFormat: 'xlsx',
        sourceHash: input.metadata.sourceHash,
        schoolYear: 2026,
      },
    });
  });

  it('fails closed for XLSB when no explicit analyzer declares support', async () => {
    const input = await source('xlsb');
    const analyze = vi.fn(analyzer().analyze);

    await expect(
      analyzeLegacyWorkbook({ source: input, analyzer: analyzer({ analyze }) }),
    ).rejects.toThrow('workbook_format_not_supported:xlsb');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('rejects tampered source bytes before invoking the analyzer', async () => {
    const input = await source('xlsx');
    input.bytes[0] = input.bytes[0] === 0 ? 1 : 0;
    const analyze = vi.fn(analyzer().analyze);

    await expect(
      analyzeLegacyWorkbook({ source: input, analyzer: analyzer({ analyze }) }),
    ).rejects.toThrow('legacy_workbook_sha256_mismatch');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('rejects an analyzer that mutates its verified source copy', async () => {
    const input = await source('xlsx');
    const mutatingAnalyzer = analyzer({
      async analyze(sourceInput) {
        sourceInput.bytes[0] = sourceInput.bytes[0] === 0 ? 1 : 0;
        return legacyIntermediateModelSchema.parse({
          schemaVersion: 1,
          sourceFormat: sourceInput.metadata.sourceFormat,
          sourceHash: sourceInput.metadata.sourceHash,
          schoolYear: sourceInput.metadata.schoolYear,
          analysisVersion: 'synthetic-1',
          classes: [],
          components: [],
          students: [],
          gradeSlots: [],
          findings: [],
        });
      },
    });

    await expect(
      analyzeLegacyWorkbook({ source: input, analyzer: mutatingAnalyzer }),
    ).rejects.toThrow('analyzer_mutated_verified_source');
    expect(await sha256(input.bytes)).toBe(input.metadata.sourceHash);
  });

  it('rejects analyzer provenance that does not match the verified source', async () => {
    const input = await source('xlsx');
    const badAnalyzer = analyzer({
      async analyze(sourceInput) {
        return legacyIntermediateModelSchema.parse({
          schemaVersion: 1,
          sourceFormat: sourceInput.metadata.sourceFormat,
          sourceHash: 'f'.repeat(64),
          schoolYear: sourceInput.metadata.schoolYear,
          analysisVersion: 'synthetic-1',
          classes: [],
          components: [],
          students: [],
          gradeSlots: [],
          findings: [],
        });
      },
    });

    await expect(analyzeLegacyWorkbook({ source: input, analyzer: badAnalyzer })).rejects.toThrow(
      'legacy_analysis_source_hash_mismatch',
    );
  });

  it('verifies XLSX artifact bytes and binds metadata to the generic instance', async () => {
    const output = await serializeGenericWorkbook({
      instance,
      serializer: await serializer(),
    });

    expect(output.serializerId).toBe('synthetic-xlsx-serializer');
    expect(output.metadata).toMatchObject({
      format: 'xlsx',
      modelId: instance.modelId,
      layoutVersion: '2026.1-layout',
      mappingVersion: 3,
      sourceHash: instance.sourceHash,
      relationshipSnapshotId: instance.relationshipSnapshotId,
    });
    expect(output.bytes.byteLength).toBe(output.metadata.byteLength);
  });

  it('rejects serializer metadata that points at a different layout', async () => {
    await expect(
      serializeGenericWorkbook({
        instance,
        serializer: await serializer((metadata) => ({
          ...metadata,
          layoutVersion: 'different-layout',
        })),
      }),
    ).rejects.toThrow('generic_workbook_metadata_mismatch:layoutVersion');
  });

  it('rejects serializer bytes whose digest does not match the declared artifact hash', async () => {
    await expect(
      serializeGenericWorkbook({
        instance,
        serializer: await serializer((metadata) => ({ ...metadata, sha256: '0'.repeat(64) })),
      }),
    ).rejects.toThrow('generic_workbook_sha256_mismatch');
  });
});
