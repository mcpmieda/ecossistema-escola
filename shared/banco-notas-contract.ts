import { z } from 'zod';

export const sourceTypeSchema = z.enum(['legacy_import', 'linked_teacher_model']);
export const sourceStatusSchema = z.enum(['active', 'inactive', 'archived']);
export const sourceEnvironmentSchema = z.enum(['homologation', 'production']);
export const migrationStateSchema = z.enum([
  'not_started',
  'preparing',
  'reconciling',
  'ready',
  'blocked',
]);
export const authorityModeSchema = z.enum(['authoritative', 'reference_only']);
export const assignmentScopeSchema = z.enum(['school_year_default', 'teacher_override']);

export const schoolYearInputSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  name: z.string().trim().min(1).max(120),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
});

export const sourceInputSchema = z.object({
  schoolYearId: z.string().uuid(),
  type: sourceTypeSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).default(''),
});

export const sourcePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).optional(),
    status: sourceStatusSchema.optional(),
    environment: sourceEnvironmentSchema.optional(),
    migrationState: migrationStateSchema.optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.environment !== undefined ||
      value.migrationState !== undefined,
    { message: 'at least one source field must change' },
  );

export const assignmentInputSchema = z
  .object({
    schoolYearId: z.string().uuid(),
    sourceId: z.string().uuid(),
    scope: assignmentScopeSchema,
    teacherId: z.string().uuid().nullable().default(null),
    authorityMode: authorityModeSchema,
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullable().default(null),
    syncEnabled: z.boolean().default(false),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((value, context) => {
    if ((value.scope === 'teacher_override') !== Boolean(value.teacherId)) {
      context.addIssue({ code: 'custom', message: 'teacher override requires teacherId' });
    }
    if (value.effectiveTo && value.effectiveFrom > value.effectiveTo) {
      context.addIssue({ code: 'custom', message: 'invalid effective period' });
    }
  });

export const assignmentPatchSchema = z
  .object({
    authorityMode: authorityModeSchema.optional(),
    effectiveFrom: z.string().date().optional(),
    effectiveTo: z
      .string()
      .date()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    clearEffectiveTo: z.literal(true).optional(),
    syncEnabled: z.boolean().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((value, context) => {
    if (value.clearEffectiveTo && value.effectiveTo !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'effectiveTo and clearEffectiveTo cannot be sent together',
      });
    }
  })
  .refine(
    (value) =>
      value.authorityMode !== undefined ||
      value.effectiveFrom !== undefined ||
      value.effectiveTo !== undefined ||
      value.clearEffectiveTo === true ||
      value.syncEnabled !== undefined ||
      value.status !== undefined,
    { message: 'at least one assignment field must change' },
  );

export type SchoolYearInput = z.infer<typeof schoolYearInputSchema>;
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type SourcePatch = z.infer<typeof sourcePatchSchema>;
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type AssignmentPatch = z.infer<typeof assignmentPatchSchema>;

export type SchoolYear = SchoolYearInput & { id: string; status: string };
export type Teacher = { id: string; displayName: string; status: string };
export type DataSource = SourceInput & {
  id: string;
  status: string;
  migrationState: string;
  environment: string;
};
export type SourceAssignment = AssignmentInput & {
  id: string;
  status: string;
  operatorId: string;
  createdAt: string;
  updatedAt: string;
};

export type BancoNotasRepository = {
  listSchoolYears(): Promise<SchoolYear[]>;
  createSchoolYear(input: SchoolYearInput, actor: string): Promise<SchoolYear>;
  listTeachers(): Promise<Teacher[]>;
  listSources(schoolYearId?: string): Promise<DataSource[]>;
  createSource(input: SourceInput, actor: string): Promise<DataSource>;
  patchSource(id: string, input: SourcePatch, actor: string): Promise<DataSource | null>;
  listAssignments(schoolYearId?: string): Promise<SourceAssignment[]>;
  createAssignment(input: AssignmentInput, actor: string): Promise<SourceAssignment>;
  patchAssignment(
    id: string,
    input: AssignmentPatch,
    actor: string,
  ): Promise<SourceAssignment | null>;
};
