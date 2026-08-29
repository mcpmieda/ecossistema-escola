import { z } from 'zod';
import { addinContextQuerySchema } from './banco-notas-addin-context';
import { gradeFieldSchema, gradeValueSchema } from './banco-notas-grade-events';

export const syncReasonCodeSchema = z.enum([
  'SYNC_DISABLED',
  'PILOT_NOT_ALLOWED',
  'OWNERSHIP_DENIED',
  'MODEL_MISSING',
  'MODEL_SUSPENDED',
  'MODEL_VERSION_STALE',
  'ASSIGNMENT_INACTIVE',
  'SOURCE_INVALID',
  'WORKBOOK_MISMATCH',
  'MAPPING_MISMATCH',
  'BASELINE_STALE',
  'CONFLICT',
  'NO_CHANGES',
  'PAYLOAD_TOO_LARGE',
  'DUPLICATE_REQUEST',
  'INVALID_CHANGE',
  'NETWORK_UNKNOWN',
]);
export const syncChangeSchema = z
  .object({
    cellAddress: z.string().trim().min(2).max(40),
    field: gradeFieldSchema,
    baselineEventId: z.string().uuid(),
    baselineSequence: z.number().int().min(1),
    valueAfter: gradeValueSchema,
    isAbsent: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.isAbsent && v.valueAfter !== null)
      ctx.addIssue({ code: 'custom', path: ['valueAfter'], message: 'absent grade must be null' });
  });
export const syncPreflightRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().uuid(),
    workbook: addinContextQuerySchema,
    changes: z.array(syncChangeSchema).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = new Set<string>();
    value.changes.forEach((change, index) => {
      const key = `${change.cellAddress.toUpperCase()}|${change.field}`;
      if (keys.has(key))
        context.addIssue({
          code: 'custom',
          path: ['changes', index],
          message: 'duplicate mapped change',
        });
      keys.add(key);
    });
  });
export const syncCommitRequestSchema = syncPreflightRequestSchema
  .extend({
    preflightFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export const syncOutcomeRequestSchema = z.object({ requestId: z.string().uuid() }).strict();
export type SyncPreflightRequest = z.infer<typeof syncPreflightRequestSchema>;
export type SyncCommitRequest = z.infer<typeof syncCommitRequestSchema>;
export type SyncReasonCode = z.infer<typeof syncReasonCodeSchema>;
export const syncResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().uuid(),
    status: z.enum(['ready', 'blocked', 'committed', 'duplicate', 'conflict', 'failed']),
    reasonCode: syncReasonCodeSchema.optional(),
    changeCount: z.number().int().min(0).max(500),
    conflictCount: z.number().int().min(0).max(500),
    preflightFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    eventIds: z.array(z.string().uuid()).max(500).optional(),
  })
  .strict();
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export const syncAttemptsQuerySchema = z
  .object({
    status: z.enum(['committed', 'rejected', 'conflict', 'duplicate', 'failed']).optional(),
    teacherModelId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type SyncAttemptSummary = {
  attemptId: string;
  requestId: string;
  teacherModelId: string | null;
  teacherModelVersionId: string | null;
  status: 'committed' | 'rejected' | 'conflict' | 'duplicate' | 'failed';
  changeCount: number;
  conflictCount: number;
  reasonCode: SyncReasonCode | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string;
};
export type SyncReadinessItem = {
  teacherModelId: string;
  schoolYearId: string;
  status: 'ready' | 'blocked' | 'needs_attention';
  reasons: SyncReasonCode[];
  pilotEligible: boolean;
};
export type SyncReadinessReport = {
  generatedAt: string;
  globalSyncEnabled: boolean;
  commitRouteEnabled: boolean;
  counts: { ready: number; blocked: number; needsAttention: number };
  items: SyncReadinessItem[];
};
