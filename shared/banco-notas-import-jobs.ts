import { z } from 'zod';

export const importJobStateSchema = z.enum([
  'draft',
  'analyzed',
  'generated',
  'validated',
  'ready_to_share',
  'shared',
  'connected',
  'failed',
]);

export const importFindingInputSchema = z
  .object({
    severity: z.enum(['info', 'warning', 'error']),
    code: z.string().min(1).max(100),
    location: z.record(z.string(), z.unknown()).default({}),
    details: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const importFindingSchema = importFindingInputSchema
  .extend({
    id: z.string().uuid(),
    resolvedAt: z.string().datetime().nullable(),
  })
  .strict();

export const importJobCreateSchema = z
  .object({
    schoolYearId: z.string().uuid(),
    teacherId: z.string().uuid(),
    dataSourceId: z.string().uuid(),
    idempotencyKey: z.string().min(8).max(180),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceFormat: z.enum(['xlsb', 'xlsx']),
    provenance: z.record(z.string(), z.unknown()),
  })
  .strict();

export const importJobTransitionSchema = z
  .object({
    targetState: importJobStateSchema,
    reason: z.string().trim().min(3).max(500),
    findings: z.array(importFindingInputSchema).default([]),
    resolvedFindingIds: z.array(z.string().uuid()).default([]),
    provenance: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.resolvedFindingIds).size !== value.resolvedFindingIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedFindingIds'],
        message: 'resolved finding ids must be unique',
      });
    }
  });

export type ImportJobState = z.infer<typeof importJobStateSchema>;
export type ImportFindingInput = z.infer<typeof importFindingInputSchema>;
export type ImportFinding = z.infer<typeof importFindingSchema>;
export type ImportJobCreate = z.infer<typeof importJobCreateSchema>;
export type ImportJobTransition = z.infer<typeof importJobTransitionSchema>;

export type ImportJob = {
  id: string;
  schoolYearId: string;
  teacherId: string;
  dataSourceId: string;
  idempotencyKey: string;
  sourceHash: string;
  state: ImportJobState;
  provenance: Record<string, unknown>;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  findings: ImportFinding[];
};

export type ImportJobRepository = {
  listImportJobs(schoolYearId?: string): Promise<ImportJob[]>;
  findImportJob(id: string): Promise<ImportJob | null>;
  createImportJob(input: ImportJobCreate, actor: string): Promise<ImportJob>;
  transitionImportJob(
    id: string,
    input: ImportJobTransition,
    actor: string,
  ): Promise<ImportJob | null>;
};
