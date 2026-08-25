import { z } from 'zod';

export const gradeFieldSchema = z.enum([
  'NotaT1',
  'NotaT2',
  'NotaT3',
  'RecT1',
  'RecT2',
  'RecT3',
  'Total',
  'TotalRec',
  'NotaFinal',
]);

export const gradeEventTypeSchema = z.enum([
  'grade.changed',
  'grade.recalculated',
  'grade.reverted',
]);

export const gradeEventStatusSchema = z.enum(['applied', 'stale', 'duplicate', 'queued', 'rejected']);
export const gradeValueSchema = z.union([z.number(), z.string().max(120), z.null()]);

export const eventSourceSchema = z.object({
  kind: z.enum(['excel-addin', 'web-model', 'reconciliation']),
  workbookId: z.string().min(1).max(180),
  worksheetId: z.string().min(1).max(180),
  cellAddress: z.string().min(2).max(40),
});

export const gradeEventInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().uuid(),
    correlationId: z.string().uuid(),
    eventType: gradeEventTypeSchema,
    gradeKey: z.string().min(7).max(180),
    field: gradeFieldSchema,
    dataSourceId: z.string().uuid(),
    teacherModelId: z.string().uuid(),
    source: eventSourceSchema,
    valueBefore: gradeValueSchema.optional(),
    valueAfter: gradeValueSchema,
    isAbsent: z.boolean(),
    derivedValues: z
      .object({
        Total: gradeValueSchema.optional(),
        TotalRec: gradeValueSchema.optional(),
        NotaFinal: gradeValueSchema.optional(),
      })
      .strict()
      .optional(),
    sequence: z.number().int().min(1),
    sourceRevision: z.string().min(1).max(120).optional(),
    clientSentAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.isAbsent && value.valueAfter !== null) {
      context.addIssue({
        code: 'custom',
        path: ['valueAfter'],
        message: 'absent grade must have null valueAfter',
      });
    }
  });

export type GradeField = z.infer<typeof gradeFieldSchema>;
export type GradeEventType = z.infer<typeof gradeEventTypeSchema>;
export type GradeEventStatus = z.infer<typeof gradeEventStatusSchema>;
export type GradeValue = z.infer<typeof gradeValueSchema>;
export type GradeEventInput = z.infer<typeof gradeEventInputSchema>;

export type GradeSnapshot = {
  gradeKey: string;
  field: GradeField;
  value: GradeValue;
  isAbsent: boolean;
  sequence: number;
  lastEventId: string;
  sourceId: string;
  updatedAt: string;
};

export type StoredGradeEvent = {
  eventId: string;
  correlationId: string;
  idempotencyKey: string;
  payloadHash: string;
  eventType: GradeEventType;
  gradeKey: string;
  field: GradeField;
  sourceId: string;
  teacherModelId: string;
  sequence: number;
  valueAfter: GradeValue;
  isAbsent: boolean;
  status: Exclude<GradeEventStatus, 'duplicate' | 'queued'>;
  clientSentAt: string;
  receivedAt: string;
};

export type GradeEventReceipt = {
  schemaVersion: 1;
  eventId: string;
  correlationId: string;
  idempotencyKey: string;
  status: GradeEventStatus;
  receivedAt: string;
  snapshot?: GradeSnapshot;
};

export type GradeEventCommit = {
  event: StoredGradeEvent;
  snapshot: GradeSnapshot | null;
};

export type GradeEventStore = {
  findByIdempotencyKey(idempotencyKey: string): Promise<StoredGradeEvent | null>;
  getSnapshot(gradeKey: string, field: GradeField): Promise<GradeSnapshot | null>;
  assertIngestionAllowed(input: GradeEventInput): Promise<void>;
  commit(command: GradeEventCommit, provenanceJson: string): Promise<void>;
};
