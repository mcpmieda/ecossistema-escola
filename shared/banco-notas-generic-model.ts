import { z } from 'zod';
import { gradeFieldSchema, gradeValueSchema } from './banco-notas-grade-events';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'expected lowercase SHA-256');
const opaqueIdSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const studentPositionSchema = z.number().int().min(1).max(1_000_000);

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
    studentPosition: studentPositionSchema.optional(),
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
    sourceValue: gradeValueSchema.optional(),
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
        context.addIssue({
          code: 'custom',
          path: [path],
          message: `${path} identifiers must be unique`,
        });
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

export type LegacyIntermediateModel = z.infer<typeof legacyIntermediateModelSchema>;
