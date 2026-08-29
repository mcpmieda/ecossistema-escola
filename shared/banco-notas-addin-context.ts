import { z } from 'zod';
import { gradeFieldSchema, gradeValueSchema } from './banco-notas-grade-events';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'expected lowercase SHA-256');
const workbookTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9._:-]+$/u);

export const addinContextQuerySchema = z
  .object({
    workbookModelId: z.string().uuid(),
    sourceHash: sha256Schema,
    relationshipSnapshotId: z.string().uuid(),
    definitionVersion: z.string().trim().min(1).max(40),
    layoutVersion: z.string().trim().min(1).max(40),
    mappingVersion: z.coerce.number().int().min(1).max(1_000_000),
    schoolYear: z.coerce.number().int().min(2000).max(2200),
    sheetKey: workbookTokenSchema,
  })
  .strict();

export const addinReadinessReasonSchema = z.enum([
  'sync_disabled_by_administration',
  'model_not_connected',
  'model_suspended',
  'model_unavailable',
  'assignment_missing',
  'authoritative_source_missing',
  'mapping_unknown',
  'baseline_unavailable',
]);

export const addinPendingSchema = z
  .object({
    severity: z.enum(['error', 'warning', 'info']),
    code: addinReadinessReasonSchema,
    message: z.string().trim().min(1).max(240),
  })
  .strict();

export const addinContextMappingSchema = z
  .object({
    cellAddress: z.string().trim().min(2).max(40),
    field: gradeFieldSchema,
    studentLabel: z.string().trim().min(1).max(240),
    known: z.boolean(),
    knownValue: gradeValueSchema,
    knownAbsent: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.knownAbsent && value.knownValue !== null) {
      context.addIssue({
        code: 'custom',
        path: ['knownValue'],
        message: 'an absent known value must be null',
      });
    }
  });

export const addinContextResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    teacher: z.object({ label: z.string().trim().min(1).max(240) }).strict(),
    schoolYear: z.object({ label: z.string().trim().min(1).max(120) }).strict(),
    assignment: z
      .object({
        classGroupLabel: z.string().trim().min(1).max(180),
        componentLabel: z.string().trim().min(1).max(180),
      })
      .strict()
      .nullable(),
    model: z
      .object({
        version: z.number().int().min(1),
        mappingVersion: z.number().int().min(1),
        state: z.enum([
          'draft',
          'validated',
          'ready_to_share',
          'shared',
          'connected',
          'suspended',
          'archived',
        ]),
      })
      .strict(),
    syncEnabled: z.boolean(),
    lastActivityAt: z.string().datetime({ offset: true }).nullable(),
    preflight: z
      .object({
        status: z.enum(['ready', 'warning', 'blocked']),
        checks: z
          .object({
            structureValid: z.literal(true),
            modelRecognized: z.literal(true),
            teacherAuthorized: z.literal(true),
            workbookCompatible: z.literal(true),
          })
          .strict(),
        reasons: z.array(addinReadinessReasonSchema),
      })
      .strict(),
    pending: z.array(addinPendingSchema),
    mappings: z.array(addinContextMappingSchema).max(5_000),
  })
  .strict();

export type AddinContextQuery = z.infer<typeof addinContextQuerySchema>;
export type AddinReadinessReason = z.infer<typeof addinReadinessReasonSchema>;
export type AddinPending = z.infer<typeof addinPendingSchema>;
export type AddinContextMapping = z.infer<typeof addinContextMappingSchema>;
export type AddinContextResponse = z.infer<typeof addinContextResponseSchema>;

export interface BancoNotasAddinContextRepository {
  context(query: AddinContextQuery, entraObjectId: string): Promise<AddinContextResponse | null>;
}
