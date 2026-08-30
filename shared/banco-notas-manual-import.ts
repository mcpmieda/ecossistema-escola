import { z } from 'zod';
import { institutionalManualProfileKey } from './banco-notas-institutional-xlsx-profile';

const safeXlsxFileNameSchema = z
  .string()
  .trim()
  .min(6)
  .max(180)
  .refine(
    (value) =>
      Array.from(value).every(
        (character) => character.codePointAt(0)! >= 32 && character !== '\\' && character !== '/',
      ),
    'file name contains unsafe characters',
  )
  .refine((value) => value.toLocaleLowerCase('pt-BR').endsWith('.xlsx'), 'expected an XLSX file');

export const manualImportQuerySchema = z
  .object({
    schoolYearId: z.string().uuid(),
    teacherId: z.string().uuid(),
    dataSourceId: z.string().uuid(),
    profileKey: z.literal(institutionalManualProfileKey).default(institutionalManualProfileKey),
    fileName: safeXlsxFileNameSchema,
  })
  .strict();

export type ManualImportQuery = z.infer<typeof manualImportQuerySchema>;

export type ManualImportSummary = {
  schemaVersion: 1;
  jobId: string;
  analysisId: string;
  state: 'analyzed';
  reused: boolean;
  sourceHash: string;
  fileName: string;
  classCount: number;
  componentCount: number;
  studentCount: number;
  gradeSlotCount: number;
  findingCount: number;
};
