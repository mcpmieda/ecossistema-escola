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

export type LegacyWorkbookSourceMetadata = z.infer<typeof legacyWorkbookSourceMetadataSchema>;
