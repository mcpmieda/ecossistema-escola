import { z } from 'zod';
import { gradeFieldSchema } from './banco-notas-grade-events';

const excelColumnSchema = z.string().regex(/^[A-Z]{1,3}$/u, 'expected an Excel column');
const invalidSheetNameCharacters = new Set(['\\', '/', '*', '?', ':', '[', ']']);
const safeSheetNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(31)
  .refine(
    (value) => ![...value].some((character) => invalidSheetNameCharacters.has(character)),
    'sheet name contains an invalid Excel character',
  )
  .refine((value) => value.toLocaleLowerCase('en-US') !== '_banconotas', 'sheet name is reserved');

const gradeHeaderSchema = z
  .object({
    field: gradeFieldSchema,
    label: z.string().min(1).max(80),
  })
  .strict();

const presentationRowSchema = z
  .object({
    studentPosition: z.number().int().min(1).max(1_000_000),
    gradeKey: z.string().min(7).max(180),
    studentDisplayName: z.string().min(1).max(240),
  })
  .strict();

const presentationSourceBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    presentationVersion: z.string().min(1).max(40),
    modelId: z.string().uuid(),
    schoolYear: z.number().int().min(2000).max(2200),
    title: z.string().min(1).max(120),
    teacherDisplayName: z.string().min(1).max(240),
    studentPositionColumn: excelColumnSchema,
    studentNameColumn: excelColumnSchema,
    positionHeader: z.string().min(1).max(80),
    studentHeader: z.string().min(1).max(80),
    gradeHeaders: z.array(gradeHeaderSchema).min(1),
  })
  .strict();

function validateCommonPresentationRules(
  value: {
    studentPositionColumn: string;
    studentNameColumn: string;
    gradeHeaders: readonly { field: string }[];
  },
  context: z.RefinementCtx,
): void {
  if (value.studentPositionColumn === value.studentNameColumn) {
    context.addIssue({
      code: 'custom',
      path: ['studentNameColumn'],
      message: 'student position and name columns must be different',
    });
  }

  const gradeFields = value.gradeHeaders.map((item) => item.field);
  if (new Set(gradeFields).size !== gradeFields.length) {
    context.addIssue({
      code: 'custom',
      path: ['gradeHeaders'],
      message: 'grade header fields must be unique',
    });
  }
}

export const genericWorkbookPresentationSourceSchema = presentationSourceBaseSchema
  .extend({
    sheets: z
      .array(
        z
          .object({
            sheetKey: z.string().min(1).max(180),
            classDisplayName: z.string().min(1).max(180),
            componentDisplayName: z.string().min(1).max(180),
            rows: z.array(presentationRowSchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    validateCommonPresentationRules(value, context);
    const sheetKeys = value.sheets.map((sheet) => sheet.sheetKey);
    if (new Set(sheetKeys).size !== sheetKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['sheets'],
        message: 'workbook sheet keys must be unique',
      });
    }
    for (const [sheetIndex, sheet] of value.sheets.entries()) {
      const positions = sheet.rows.map((row) => row.studentPosition);
      if (new Set(positions).size !== positions.length) {
        context.addIssue({
          code: 'custom',
          path: ['sheets', sheetIndex, 'rows'],
          message: 'student positions must be unique within each sheet',
        });
      }
      const gradeKeys = sheet.rows.map((row) => row.gradeKey);
      if (new Set(gradeKeys).size !== gradeKeys.length) {
        context.addIssue({
          code: 'custom',
          path: ['sheets', sheetIndex, 'rows'],
          message: 'grade keys must be unique within each sheet roster',
        });
      }
    }
  });

export const genericWorkbookPresentationSchema = presentationSourceBaseSchema
  .extend({
    sheets: z
      .array(
        z
          .object({
            sheetKey: z.string().min(1).max(180),
            displayName: safeSheetNameSchema,
            classDisplayName: z.string().min(1).max(180),
            componentDisplayName: z.string().min(1).max(180),
            rows: z.array(presentationRowSchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    validateCommonPresentationRules(value, context);

    const sheetKeys = value.sheets.map((sheet) => sheet.sheetKey);
    if (new Set(sheetKeys).size !== sheetKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['sheets'],
        message: 'workbook sheet keys must be unique',
      });
    }

    const normalizedNames = value.sheets.map((sheet) =>
      sheet.displayName.toLocaleLowerCase('en-US'),
    );
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      context.addIssue({
        code: 'custom',
        path: ['sheets'],
        message: 'Excel sheet display names must be unique case-insensitively',
      });
    }

    for (const [sheetIndex, sheet] of value.sheets.entries()) {
      const positions = sheet.rows.map((row) => row.studentPosition);
      if (new Set(positions).size !== positions.length) {
        context.addIssue({
          code: 'custom',
          path: ['sheets', sheetIndex, 'rows'],
          message: 'student positions must be unique within each sheet',
        });
      }
      const gradeKeys = sheet.rows.map((row) => row.gradeKey);
      if (new Set(gradeKeys).size !== gradeKeys.length) {
        context.addIssue({
          code: 'custom',
          path: ['sheets', sheetIndex, 'rows'],
          message: 'grade keys must be unique within each sheet roster',
        });
      }
    }
  });

export type GenericWorkbookPresentationSource = z.infer<
  typeof genericWorkbookPresentationSourceSchema
>;
export type GenericWorkbookPresentation = z.infer<typeof genericWorkbookPresentationSchema>;
