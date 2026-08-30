import { describe, expect, it, vi } from 'vitest';
import { legacyIntermediateModelSchema } from '../shared/banco-notas-generic-model';
import type {
  LegacyWorkbookAnalyzer,
  LegacyWorkbookSource,
} from '../server/banco-notas/workbook-pipeline';
import { analyzeLegacyWorkbook } from '../server/banco-notas/workbook-pipeline';

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

describe('Banco de Notas workbook analysis boundary', () => {
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

  it('fails closed for XLSB when no analyzer declares support', async () => {
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
});
