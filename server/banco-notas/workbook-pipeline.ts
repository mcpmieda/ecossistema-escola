import {
  genericModelInstanceSchema,
  legacyIntermediateModelSchema,
} from '../../shared/banco-notas-generic-model';
import {
  genericWorkbookArtifactMetadataSchema,
  legacyWorkbookSourceMetadataSchema,
  type GenericWorkbookArtifactMetadata,
  type LegacyWorkbookSourceMetadata,
} from '../../shared/banco-notas-workbook-pipeline';
import type {
  GenericModelInstance,
  LegacyIntermediateModel,
} from '../../shared/banco-notas-generic-model';

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

export type GenericWorkbookArtifact = {
  metadata: GenericWorkbookArtifactMetadata;
  bytes: Uint8Array;
  serializerId: string;
};

export type GenericWorkbookSerializer = {
  id: string;
  serialize(instance: GenericModelInstance): Promise<{
    metadata: GenericWorkbookArtifactMetadata;
    bytes: Uint8Array;
  }>;
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

function assertAdapterId(id: string, kind: 'analyzer' | 'serializer'): void {
  if (!id.trim()) throw new WorkbookPipelineError(`${kind}_id_required`);
}

export async function analyzeLegacyWorkbook(args: {
  source: LegacyWorkbookSource;
  analyzer: LegacyWorkbookAnalyzer;
}): Promise<VerifiedLegacyWorkbookAnalysis> {
  const metadata = legacyWorkbookSourceMetadataSchema.parse(args.source.metadata);
  assertAdapterId(args.analyzer.id, 'analyzer');

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

export async function serializeGenericWorkbook(args: {
  instance: GenericModelInstance;
  serializer: GenericWorkbookSerializer;
}): Promise<GenericWorkbookArtifact> {
  const instance = genericModelInstanceSchema.parse(args.instance);
  assertAdapterId(args.serializer.id, 'serializer');

  const serialized = await args.serializer.serialize(instance);
  const metadata = genericWorkbookArtifactMetadataSchema.parse(serialized.metadata);

  if (serialized.bytes.byteLength !== metadata.byteLength) {
    throw new WorkbookPipelineError('generic_workbook_byte_length_mismatch');
  }

  const actualHash = await sha256Bytes(serialized.bytes);
  if (actualHash !== metadata.sha256) {
    throw new WorkbookPipelineError('generic_workbook_sha256_mismatch');
  }

  const expected = {
    modelId: instance.modelId,
    definitionVersion: instance.definitionVersion,
    layoutVersion: instance.layout.layoutVersion,
    mappingVersion: instance.mappingVersion,
    sourceHash: instance.sourceHash,
    relationshipSnapshotId: instance.relationshipSnapshotId,
  } as const;

  for (const [key, value] of Object.entries(expected)) {
    if (metadata[key as keyof typeof expected] !== value) {
      throw new WorkbookPipelineError(`generic_workbook_metadata_mismatch:${key}`);
    }
  }

  const artifactBytes = new Uint8Array(serialized.bytes.byteLength);
  artifactBytes.set(serialized.bytes);

  return {
    metadata,
    bytes: artifactBytes,
    serializerId: args.serializer.id,
  };
}
