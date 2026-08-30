import { z } from 'zod';
import { gradeFieldSchema } from './banco-notas-grade-events';

const opaqueIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const excelColumnSchema = z.string().regex(/^[A-Z]{1,3}$/u, 'expected an Excel column');

export const xlsxLegacySheetRuleSchema = z
  .object({
    ruleId: opaqueIdSchema,
    sheetNamePattern: z.string().min(1).max(240),
    caseInsensitive: z.boolean().default(false),
    componentNameCell: z
      .string()
      .regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/u)
      .optional(),
    studentPositionColumn: excelColumnSchema.optional(),
    studentNameColumn: excelColumnSchema,
    firstStudentRow: z.number().int().min(1).max(1_000_000),
    maxStudentRows: z.number().int().min(1).max(10_000),
    gradeColumns: z
      .array(
        z
          .object({
            field: gradeFieldSchema,
            column: excelColumnSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const fields = value.gradeColumns.map((item) => item.field);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({
        code: 'custom',
        path: ['gradeColumns'],
        message: 'grade fields must be unique inside a worksheet rule',
      });
    }

    const columns = value.gradeColumns.map((item) => item.column);
    if (new Set(columns).size !== columns.length) {
      context.addIssue({
        code: 'custom',
        path: ['gradeColumns'],
        message: 'grade columns must be unique inside a worksheet rule',
      });
    }

    if (columns.includes(value.studentNameColumn)) {
      context.addIssue({
        code: 'custom',
        path: ['studentNameColumn'],
        message: 'student name column cannot also be a grade column',
      });
    }
    if (
      value.studentPositionColumn &&
      (columns.includes(value.studentPositionColumn) ||
        value.studentPositionColumn === value.studentNameColumn)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['studentPositionColumn'],
        message: 'student position column must be distinct from name and grade columns',
      });
    }
  });

export const xlsxLegacyAnalysisProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    profileId: opaqueIdSchema,
    analysisVersion: z.string().min(1).max(40),
    worksheetRules: z.array(xlsxLegacySheetRuleSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.worksheetRules.map((item) => item.ruleId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['worksheetRules'],
        message: 'worksheet rule identifiers must be unique',
      });
    }
  });

export type XlsxLegacySheetRule = z.infer<typeof xlsxLegacySheetRuleSchema>;
export type XlsxLegacyAnalysisProfile = z.infer<typeof xlsxLegacyAnalysisProfileSchema>;
