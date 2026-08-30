import { legacyIntermediateModelSchema } from '../../shared/banco-notas-generic-model';
import {
  legacyWorkbookSourceMetadataSchema,
  type LegacyWorkbookSourceMetadata,
} from '../../shared/banco-notas-workbook-pipeline';
import type { LegacyIntermediateModel } from '../../shared/banco-notas-generic-model';

export type LegacyWorkbookSource = {
  metadata: LegacyWorkbookSourceMetadata;
  bytes: Uint8Array;
};

export type LegacyWorkbookAnalyzer = {
  id: string;
  supportedFormats: readonly LegacyWorkbookSourceMetadata['sourceFormat'][];
  analyze(source: LegacyWorkbookSource): Promise<LegacyIntermediateModel>;
};

export type VerifiedLegacyWorkbookAnalysis = {
  model: LegacyIntermediateModel;
  metadata: LegacyWorkbookSourceMetadata;
  analyzerId: string;
};

export class WorkbookPipelineError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'WorkbookPipelineError';
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stableBytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function analyzeLegacyWorkbook(args: {
  source: LegacyWorkbookSource;
  analyzer: LegacyWorkbookAnalyzer;
}): Promise<VerifiedLegacyWorkbookAnalysis> {
  const metadata = legacyWorkbookSourceMetadataSchema.parse(args.source.metadata);
  if (!args.analyzer.id.trim()) throw new WorkbookPipelineError('analyzer_id_required');

  if (!args.analyzer.supportedFormats.includes(metadata.sourceFormat)) {
    throw new WorkbookPipelineError(`workbook_format_not_supported:${metadata.sourceFormat}`);
  }
  if (args.source.bytes.byteLength !== metadata.byteLength) {
    throw new WorkbookPipelineError('legacy_workbook_byte_length_mismatch');
  }

  const actualHash = await sha256Bytes(args.source.bytes);
  if (actualHash !== metadata.sourceHash) {
    throw new WorkbookPipelineError('legacy_workbook_sha256_mismatch');
  }

  const analyzerBytes = new Uint8Array(args.source.bytes.byteLength);
  analyzerBytes.set(args.source.bytes);
  const analyzed = legacyIntermediateModelSchema.parse(
    await args.analyzer.analyze({ metadata, bytes: analyzerBytes }),
  );

  if ((await sha256Bytes(analyzerBytes)) !== metadata.sourceHash) {
    throw new WorkbookPipelineError('analyzer_mutated_verified_source');
  }
  if (analyzed.sourceHash !== metadata.sourceHash) {
    throw new WorkbookPipelineError('legacy_analysis_source_hash_mismatch');
  }
  if (analyzed.sourceFormat !== metadata.sourceFormat) {
    throw new WorkbookPipelineError('legacy_analysis_source_format_mismatch');
  }
  if (analyzed.schoolYear !== metadata.schoolYear) {
    throw new WorkbookPipelineError('legacy_analysis_school_year_mismatch');
  }

  return {
    model: analyzed,
    metadata,
    analyzerId: args.analyzer.id,
  };
}
