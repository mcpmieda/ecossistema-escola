import { z } from 'zod';
import { legacyIntermediateModelSchema } from './banco-notas-generic-model';
import type { ImportFindingInput, ImportJob } from './banco-notas-import-jobs';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'expected lowercase SHA-256');

export const importAnalysisSchema = z
  .object({
    id: z.string().uuid(),
    importJobId: z.string().uuid(),
    analyzerId: z.string().trim().min(1).max(120),
    analysisVersion: z.string().min(1).max(40),
    sourceHash: sha256Schema,
    sourceFormat: z.enum(['xlsb', 'xlsx']),
    schoolYear: z.number().int().min(2000).max(2200),
    model: legacyIntermediateModelSchema,
    createdBy: z.string().min(1).max(180),
    createdAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.model.sourceHash !== value.sourceHash) {
      context.addIssue({
        code: 'custom',
        path: ['model', 'sourceHash'],
        message: 'analysis model source hash must match analysis source hash',
      });
    }
    if (value.model.sourceFormat !== value.sourceFormat) {
      context.addIssue({
        code: 'custom',
        path: ['model', 'sourceFormat'],
        message: 'analysis model source format must match analysis source format',
      });
    }
    if (value.model.schoolYear !== value.schoolYear) {
      context.addIssue({
        code: 'custom',
        path: ['model', 'schoolYear'],
        message: 'analysis model school year must match analysis school year',
      });
    }
    if (value.model.analysisVersion !== value.analysisVersion) {
      context.addIssue({
        code: 'custom',
        path: ['model', 'analysisVersion'],
        message: 'analysis model version must match analysis version',
      });
    }
  });

export type ImportAnalysis = z.infer<typeof importAnalysisSchema>;

export type ImportAnalysisCommit = Omit<ImportAnalysis, 'id' | 'createdAt'> & {
  findings: ImportFindingInput[];
  reason: string;
};

export type ImportAnalysisRepository = {
  findImportAnalysis(importJobId: string): Promise<ImportAnalysis | null>;
  commitImportAnalysis(input: ImportAnalysisCommit): Promise<ImportJob | null>;
};
