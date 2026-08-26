import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'expected lowercase SHA-256');

export const legacyWorkbookSourceMetadataSchema = z
  .object({
    sourceFormat: z.enum(['xlsb', 'xlsx']),
    sourceHash: sha256Schema,
    byteLength: z.number().int().positive(),
    schoolYear: z.number().int().min(2000).max(2200),
  })
  .strict();

export const genericWorkbookArtifactMetadataSchema = z
  .object({
    format: z.literal('xlsx'),
    contentType: z.literal(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
    sha256: sha256Schema,
    byteLength: z.number().int().positive(),
    modelId: z.string().uuid(),
    definitionVersion: z.string().min(1).max(40),
    layoutVersion: z.string().min(1).max(40),
    mappingVersion: z.number().int().min(1),
    sourceHash: sha256Schema,
    relationshipSnapshotId: z.string().uuid(),
  })
  .strict();

export type LegacyWorkbookSourceMetadata = z.infer<typeof legacyWorkbookSourceMetadataSchema>;
export type GenericWorkbookArtifactMetadata = z.infer<
  typeof genericWorkbookArtifactMetadataSchema
>;
