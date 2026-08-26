import { z } from 'zod';
import { gradeFieldSchema } from './banco-notas-grade-events';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'expected lowercase SHA-256');
const opaqueIdSchema = z.string().min(1).max(180).regex(/^[A-Za-z0-9._:-]+$/u);
const canonicalIdSchema = z.string().uuid();

export const genericModelDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    definitionVersion: z.string().min(1).max(40),
    blankMeans: z.literal('absent'),
    calculationAuthority: z.literal('server'),
    relationshipMode: z.enum(['manual-wizard', 'api']),
    defaultEnvironment: z.literal('homologation'),
    defaultSyncEnabled: z.literal(false),
    gradeFields: z.array(gradeFieldSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.gradeFields).size !== value.gradeFields.length) {
      context.addIssue({
        code: 'custom',
        path: ['gradeFields'],
        message: 'grade fields must be unique',
      });
    }
  });

export const legacySourceLocatorSchema = z
  .object({
    sheetId: opaqueIdSchema,
    sheetDisplayName: z.string().min(1).max(180),
    cellAddress: z.string().min(2).max(40).optional(),
    rangeAddress: z.string().min(2).max(80).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.cellAddress || value.rangeAddress), {
    message: 'source locator needs a cell or range address',
  });

export const legacyClassCandidateSchema = z
  .object({
    sourceClassId: opaqueIdSchema,
    displayName: z.string().min(1).max(180),
    sourceLocator: legacySourceLocatorSchema,
  })
  .strict();

export const legacyComponentCandidateSchema = z
  .object({
    sourceComponentId: opaqueIdSchema,
    displayName: z.string().min(1).max(180),
    sourceLocator: legacySourceLocatorSchema,
  })
  .strict();

export const legacyStudentCandidateSchema = z
  .object({
    sourceStudentId: opaqueIdSchema,
    displayName: z.string().min(1).max(240),
    sourceClassId: opaqueIdSchema,
    sourceLocator: legacySourceLocatorSchema,
  })
  .strict();

export const legacyGradeSlotSchema = z
  .object({
    sourceGradeSlotId: opaqueIdSchema,
    sourceClassId: opaqueIdSchema,
    sourceComponentId: opaqueIdSchema,
    sourceStudentId: opaqueIdSchema,
    field: gradeFieldSchema,
    sourceLocator: legacySourceLocatorSchema,
  })
  .strict();

export const legacyIntermediateModelSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceFormat: z.enum(['xlsb', 'xlsx']),
    sourceHash: sha256Schema,
    schoolYear: z.number().int().min(2000).max(2200),
    analysisVersion: z.string().min(1).max(40),
    classes: z.array(legacyClassCandidateSchema),
    components: z.array(legacyComponentCandidateSchema),
    students: z.array(legacyStudentCandidateSchema),
    gradeSlots: z.array(legacyGradeSlotSchema),
    findings: z.array(z.string().min(1).max(500)).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const unique = (values: string[], path: string) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', path: [path], message: `${path} identifiers must be unique` });
      }
    };
    unique(
      value.classes.map((item) => item.sourceClassId),
      'classes',
    );
    unique(
      value.components.map((item) => item.sourceComponentId),
      'components',
    );
    unique(
      value.students.map((item) => item.sourceStudentId),
      'students',
    );
    unique(
      value.gradeSlots.map((item) => item.sourceGradeSlotId),
      'gradeSlots',
    );

    const classIds = new Set(value.classes.map((item) => item.sourceClassId));
    const componentIds = new Set(value.components.map((item) => item.sourceComponentId));
    const studentIds = new Set(value.students.map((item) => item.sourceStudentId));
    for (const [index, student] of value.students.entries()) {
      if (!classIds.has(student.sourceClassId)) {
        context.addIssue({
          code: 'custom',
          path: ['students', index, 'sourceClassId'],
          message: 'student references an unknown source class',
        });
      }
    }
    for (const [index, slot] of value.gradeSlots.entries()) {
      if (!classIds.has(slot.sourceClassId)) {
        context.addIssue({
          code: 'custom',
          path: ['gradeSlots', index, 'sourceClassId'],
          message: 'grade slot references an unknown source class',
        });
      }
      if (!componentIds.has(slot.sourceComponentId)) {
        context.addIssue({
          code: 'custom',
          path: ['gradeSlots', index, 'sourceComponentId'],
          message: 'grade slot references an unknown source component',
        });
      }
      if (!studentIds.has(slot.sourceStudentId)) {
        context.addIssue({
          code: 'custom',
          path: ['gradeSlots', index, 'sourceStudentId'],
          message: 'grade slot references an unknown source student',
        });
      }
    }
  });

export const relationshipResolutionSchema = z
  .object({
    sourceClassId: opaqueIdSchema,
    classGroupId: canonicalIdSchema,
    sourceComponentId: opaqueIdSchema,
    componentId: canonicalIdSchema,
    sourceStudentId: opaqueIdSchema,
    studentId: canonicalIdSchema,
  })
  .strict();

export const transformationMappingSchema = z
  .object({
    sourceGradeSlotId: opaqueIdSchema,
    gradeKey: z.string().min(7).max(180),
    field: gradeFieldSchema,
    classGroupId: canonicalIdSchema,
    componentId: canonicalIdSchema,
    studentId: canonicalIdSchema,
  })
  .strict();

export const transformationPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceHash: sha256Schema,
    schoolYear: z.number().int().min(2000).max(2200),
    definitionVersion: z.string().min(1).max(40),
    relationshipSnapshotId: canonicalIdSchema,
    mappings: z.array(transformationMappingSchema),
    findings: z.array(z.string().min(1).max(500)),
    blockers: z.array(z.string().min(1).max(500)),
    readyToGenerate: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.readyToGenerate !== (value.blockers.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['readyToGenerate'],
        message: 'readyToGenerate must reflect the absence of blockers',
      });
    }
    const keys = value.mappings.map((item) => `${item.gradeKey}::${item.field}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['mappings'],
        message: 'target gradeKey and field pairs must be unique',
      });
    }
  });

export const genericModelInstanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    modelId: canonicalIdSchema,
    teacherEntraObjectId: canonicalIdSchema,
    schoolYear: z.number().int().min(2000).max(2200),
    definitionVersion: z.string().min(1).max(40),
    sourceHash: sha256Schema,
    relationshipSnapshotId: canonicalIdSchema,
    environment: z.literal('homologation'),
    syncEnabled: z.literal(false),
    mappingVersion: z.number().int().min(1),
    mappings: z.array(
      z
        .object({
          gradeKey: z.string().min(7).max(180),
          field: gradeFieldSchema,
          sheetKey: opaqueIdSchema,
          cellAddress: z.string().min(2).max(40),
        })
        .strict(),
    ),
  })
  .strict();

export type GenericModelDefinition = z.infer<typeof genericModelDefinitionSchema>;
export type LegacyIntermediateModel = z.infer<typeof legacyIntermediateModelSchema>;
export type RelationshipResolution = z.infer<typeof relationshipResolutionSchema>;
export type TransformationMapping = z.infer<typeof transformationMappingSchema>;
export type TransformationPlan = z.infer<typeof transformationPlanSchema>;
export type GenericModelInstance = z.infer<typeof genericModelInstanceSchema>;
