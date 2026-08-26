import { z } from 'zod';
import {
  xlsxLegacyAnalysisProfileSchema,
  type XlsxLegacyAnalysisProfile,
} from './banco-notas-xlsx-analysis-profile';

export const importAnalysisProfileCreateSchema = z
  .object({
    schoolYearId: z.string().uuid(),
    dataSourceId: z.string().uuid(),
    profile: xlsxLegacyAnalysisProfileSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const importAnalysisProfileAttachSchema = z
  .object({
    profileId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type ImportAnalysisProfileCreate = z.infer<typeof importAnalysisProfileCreateSchema>;
export type ImportAnalysisProfileAttach = z.infer<typeof importAnalysisProfileAttachSchema>;

export type ImportAnalysisProfile = {
  id: string;
  schoolYearId: string;
  dataSourceId: string;
  sourceFormat: 'xlsx';
  profileId: string;
  analysisVersion: string;
  profileHash: string;
  profile: XlsxLegacyAnalysisProfile;
  createdBy: string;
  reason: string;
  createdAt: string;
};

export type ImportAnalysisProfileRepository = {
  listProfiles(schoolYearId?: string, dataSourceId?: string): Promise<ImportAnalysisProfile[]>;
  findProfile(id: string): Promise<ImportAnalysisProfile | null>;
  createProfile(
    input: ImportAnalysisProfileCreate,
    actor: string,
  ): Promise<ImportAnalysisProfile>;
  findForJob(importJobId: string): Promise<ImportAnalysisProfile | null>;
  attachToJob(
    importJobId: string,
    input: ImportAnalysisProfileAttach,
    actor: string,
  ): Promise<ImportAnalysisProfile>;
};
