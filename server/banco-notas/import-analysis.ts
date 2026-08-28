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
} from './workbook-pipeline';

export type ImportAnalysisResult = {
  job: ImportJob;
  analysis: ImportAnalysis;
};

type ImportAnalysisJobRepository = Pick<BancoNotasRepository, 'findImportJob' | 'listSchoolYears'>;

function analysisFindings(messages: readonly string[]): ImportFindingInput[] {
  return messages.map((message, index) => ({
    severity: 'warning',
    code: 'legacy_analysis_finding',
    location: { analysisFindingIndex: index },
    details: { message },
  }));
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
  const job = await args.jobs.findImportJob(args.jobId);
  if (!job) throw new Error('import_job_not_found');
  if (job.state !== 'draft' && job.state !== 'analyzed') {
    throw new Error(`invalid_import_job_transition:${job.state}:analyzed`);
  }

  const schoolYear = (await args.jobs.listSchoolYears()).find(
    (item) => item.id === job.schoolYearId,
  );
  if (!schoolYear) throw new Error('import_job_school_year_not_found');

  const jobSourceFormat = job.provenance.sourceFormat;
  if (
    args.source.metadata.sourceHash !== job.sourceHash ||
    args.source.metadata.schoolYear !== schoolYear.year ||
    args.source.metadata.sourceFormat !== jobSourceFormat
  ) {
    throw new Error('import_analysis_source_mismatch');
  }

  const verified = await analyzeLegacyWorkbook({
    source: args.source,
    analyzer: args.analyzer,
  });

  const analysis = await args.analyses.commitImportAnalysis({
    importJobId: job.id,
    analyzerId: verified.analyzerId,
    analysisVersion: verified.model.analysisVersion,
    sourceHash: verified.metadata.sourceHash,
    sourceFormat: verified.metadata.sourceFormat,
    schoolYear: verified.metadata.schoolYear,
    model: verified.model,
    createdBy: args.actor,
    reason: args.reason,
    findings: analysisFindings(verified.model.findings),
  });

  const updatedJob = await args.jobs.findImportJob(job.id);
  if (!updatedJob) throw new Error('import_job_disappeared_after_analysis');
  if (updatedJob.state !== 'analyzed') throw new Error('import_job_analysis_commit_incomplete');

  return { job: updatedJob, analysis };
}
