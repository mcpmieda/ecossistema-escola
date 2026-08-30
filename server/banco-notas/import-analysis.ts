import type { BancoNotasRepository } from '../../shared/banco-notas-contract';
import type {
  ImportAnalysis,
  ImportAnalysisRepository,
} from '../../shared/banco-notas-import-analysis';
import type { ImportFindingInput, ImportJob } from '../../shared/banco-notas-import-jobs';
import {
  analyzeLegacyWorkbook,
  type LegacyWorkbookAnalyzer,
  type LegacyWorkbookSource,
  type VerifiedLegacyWorkbookAnalysis,
} from './workbook-pipeline';

export type ImportAnalysisResult = {
  job: ImportJob;
  analysis: ImportAnalysis;
};

export type ImportAnalysisJobRepository = Pick<
  BancoNotasRepository,
  'findImportJob' | 'listSchoolYears'
>;

async function eligibleImportContext(jobs: ImportAnalysisJobRepository, jobId: string) {
  const job = await jobs.findImportJob(jobId);
  if (!job) throw new Error('import_job_not_found');
  if (job.state !== 'draft' && job.state !== 'analyzed') {
    throw new Error(`invalid_import_job_transition:${job.state}:analyzed`);
  }
  const schoolYear = (await jobs.listSchoolYears()).find((item) => item.id === job.schoolYearId);
  if (!schoolYear) throw new Error('import_job_school_year_not_found');
  return { job, schoolYear };
}

async function persistVerifiedImportAnalysis(args: {
  jobs: ImportAnalysisJobRepository;
  analyses: ImportAnalysisRepository;
  job: ImportJob;
  schoolYear: { year: number };
  verified: VerifiedLegacyWorkbookAnalysis;
  actor: string;
  reason: string;
}): Promise<ImportAnalysisResult> {
  const { job, schoolYear } = args;
  const jobSourceFormat = job.provenance.sourceFormat;
  if (
    args.verified.metadata.sourceHash !== job.sourceHash ||
    args.verified.metadata.schoolYear !== schoolYear.year ||
    args.verified.metadata.sourceFormat !== jobSourceFormat
  ) {
    throw new Error('import_analysis_source_mismatch');
  }

  const analysis = await args.analyses.commitImportAnalysis({
    importJobId: job.id,
    analyzerId: args.verified.analyzerId,
    analysisVersion: args.verified.model.analysisVersion,
    sourceHash: args.verified.metadata.sourceHash,
    sourceFormat: args.verified.metadata.sourceFormat,
    schoolYear: args.verified.metadata.schoolYear,
    model: args.verified.model,
    createdBy: args.actor,
    reason: args.reason,
    findings: analysisFindings(args.verified.model.findings),
  });

  const updatedJob = await args.jobs.findImportJob(job.id);
  if (!updatedJob) throw new Error('import_job_disappeared_after_analysis');
  if (updatedJob.state !== 'analyzed') throw new Error('import_job_analysis_commit_incomplete');
  return { job: updatedJob, analysis };
}

function analysisFindings(messages: readonly string[]): ImportFindingInput[] {
  return messages.map((message, index) => ({
    severity: 'warning',
    code: 'legacy_analysis_finding',
    location: { analysisFindingIndex: index },
    details: { message },
  }));
}

export async function commitVerifiedImportAnalysis(args: {
  jobs: ImportAnalysisJobRepository;
  analyses: ImportAnalysisRepository;
  jobId: string;
  verified: VerifiedLegacyWorkbookAnalysis;
  actor: string;
  reason: string;
}): Promise<ImportAnalysisResult> {
  const context = await eligibleImportContext(args.jobs, args.jobId);
  return persistVerifiedImportAnalysis({ ...args, ...context });
}

export async function analyzeImportJob(args: {
  jobs: ImportAnalysisJobRepository;
  analyses: ImportAnalysisRepository;
  jobId: string;
  source: LegacyWorkbookSource;
  analyzer: LegacyWorkbookAnalyzer;
  actor: string;
  reason: string;
}): Promise<ImportAnalysisResult> {
  const context = await eligibleImportContext(args.jobs, args.jobId);
  if (
    args.source.metadata.sourceHash !== context.job.sourceHash ||
    args.source.metadata.schoolYear !== context.schoolYear.year ||
    args.source.metadata.sourceFormat !== context.job.provenance.sourceFormat
  ) {
    throw new Error('import_analysis_source_mismatch');
  }

  const verified = await analyzeLegacyWorkbook({ source: args.source, analyzer: args.analyzer });
  return persistVerifiedImportAnalysis({
    jobs: args.jobs,
    analyses: args.analyses,
    ...context,
    verified,
    actor: args.actor,
    reason: args.reason,
  });
}
