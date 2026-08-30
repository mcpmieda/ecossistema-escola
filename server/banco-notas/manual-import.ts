import type { BancoNotasRepository } from '../../shared/banco-notas-contract';
import {
  institutionalManualProfileKey,
  institutionalManualXlsxProfile,
} from '../../shared/banco-notas-institutional-xlsx-profile';
import type {
  ManualImportQuery,
  ManualImportSummary,
} from '../../shared/banco-notas-manual-import';
import { commitVerifiedImportAnalysis } from './import-analysis';
import type { ImportAnalysisRuntime } from './import-analysis-upload';
import { analyzeLegacyWorkbook } from './workbook-pipeline';
import { createGenericXlsxLegacyAnalyzer } from './xlsx-legacy-analyzer';

async function sha256(bytes: Uint8Array): Promise<string> {
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stable);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function importManualXlsx(args: {
  repository: BancoNotasRepository;
  runtime: ImportAnalysisRuntime;
  input: ManualImportQuery;
  bytes: Uint8Array;
  actor: string;
  reason: string;
}): Promise<ManualImportSummary> {
  const profiles = args.runtime.profiles;
  if (!profiles) throw new Error('import_analysis_profile_storage_unavailable');
  const year = (await args.repository.listSchoolYears()).find(
    (candidate) => candidate.id === args.input.schoolYearId,
  );
  if (!year) throw new Error('import_job_school_year_not_found');
  if (args.input.profileKey !== institutionalManualProfileKey) {
    throw new Error('manual_import_profile_not_supported');
  }
  const profile = await profiles.createProfile(
    {
      schoolYearId: args.input.schoolYearId,
      dataSourceId: args.input.dataSourceId,
      profile: institutionalManualXlsxProfile,
      reason: 'Perfil institucional automático do Upload Manual V1',
    },
    args.actor,
  );

  const stableBytes = new Uint8Array(args.bytes.byteLength);
  stableBytes.set(args.bytes);
  const sourceHash = await sha256(stableBytes);
  const analyzer = createGenericXlsxLegacyAnalyzer(profile.profile);
  const verified = await analyzeLegacyWorkbook({
    source: {
      metadata: {
        sourceFormat: 'xlsx',
        sourceHash,
        byteLength: stableBytes.byteLength,
        schoolYear: year.year,
      },
      bytes: stableBytes,
    },
    analyzer,
  });
  if (verified.model.students.some((student) => student.studentPosition === undefined)) {
    throw new Error('manual_import_student_position_required');
  }

  const created = await args.repository.createImportJob(
    {
      schoolYearId: args.input.schoolYearId,
      teacherId: args.input.teacherId,
      dataSourceId: args.input.dataSourceId,
      idempotencyKey: `manual-xlsx-v1:${args.input.dataSourceId}:${sourceHash}`,
      sourceHash,
      sourceFormat: 'xlsx',
      provenance: {
        uploadMode: 'manual-xlsx-v1',
        fileName: args.input.fileName,
        byteLength: stableBytes.byteLength,
        analysisProfileId: profile.id,
        analysisProfileVersion: profile.analysisVersion,
      },
    },
    args.actor,
  );
  const reused = created.state === 'analyzed';
  await profiles.attachToJob(
    created.id,
    {
      profileId: profile.id,
      reason: args.reason,
    },
    args.actor,
  );
  const result = await commitVerifiedImportAnalysis({
    jobs: args.repository,
    analyses: args.runtime.repository,
    jobId: created.id,
    verified,
    actor: args.actor,
    reason: args.reason,
  });

  return {
    schemaVersion: 1,
    jobId: result.job.id,
    analysisId: result.analysis.id,
    state: 'analyzed',
    reused,
    sourceHash,
    fileName: args.input.fileName,
    classCount: result.analysis.model.classes.length,
    componentCount: result.analysis.model.components.length,
    studentCount: result.analysis.model.students.length,
    gradeSlotCount: result.analysis.model.gradeSlots.length,
    findingCount: result.job.findings.length,
  };
}
