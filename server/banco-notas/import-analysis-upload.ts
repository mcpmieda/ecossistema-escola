import type { BancoNotasRepository } from '../../shared/banco-notas-contract';
import type {
  ImportAnalysisRepository,
  ImportAnalysis,
} from '../../shared/banco-notas-import-analysis';
import type { ImportJob } from '../../shared/banco-notas-import-jobs';
import { analyzeImportJob } from './import-analysis';
import type { LegacyWorkbookAnalyzer } from './workbook-pipeline';

export type ImportAnalysisRuntime = {
  repository: ImportAnalysisRepository;
  analyzers: readonly LegacyWorkbookAnalyzer[];
};

type ImportAnalysisJobs = Pick<BancoNotasRepository, 'findImportJob' | 'listSchoolYears'>;

type ImportSourceFormat = 'xlsb' | 'xlsx';

function sourceFormat(job: ImportJob): ImportSourceFormat {
  const value = job.provenance.sourceFormat;
  if (value !== 'xlsb' && value !== 'xlsx') throw new Error('import_job_source_format_invalid');
  return value;
}

function selectAnalyzer(
  analyzers: readonly LegacyWorkbookAnalyzer[],
  format: ImportSourceFormat,
): LegacyWorkbookAnalyzer {
  const compatible = analyzers.filter((analyzer) => analyzer.supportedFormats.includes(format));
  if (compatible.length === 0) throw new Error(`import_analyzer_not_configured:${format}`);
  if (compatible.length > 1) throw new Error(`import_analyzer_ambiguous:${format}`);
  return compatible[0]!;
}

export async function findImportAnalysis(args: {
  repository: ImportAnalysisRepository;
  importJobId: string;
}): Promise<ImportAnalysis | null> {
  return args.repository.findImportAnalysis(args.importJobId);
}

export async function analyzeUploadedImportWorkbook(args: {
  jobs: ImportAnalysisJobs;
  runtime: ImportAnalysisRuntime;
  importJobId: string;
  bytes: Uint8Array;
  actor: string;
  reason: string;
}) {
  const job = await args.jobs.findImportJob(args.importJobId);
  if (!job) throw new Error('import_job_not_found');
  const year = (await args.jobs.listSchoolYears()).find((item) => item.id === job.schoolYearId);
  if (!year) throw new Error('import_job_school_year_not_found');

  const format = sourceFormat(job);
  const analyzer = selectAnalyzer(args.runtime.analyzers, format);
  const stableBytes = new Uint8Array(args.bytes.byteLength);
  stableBytes.set(args.bytes);

  return analyzeImportJob({
    jobs: args.jobs,
    analyses: args.runtime.repository,
    jobId: job.id,
    source: {
      metadata: {
        sourceFormat: format,
        sourceHash: job.sourceHash,
        byteLength: stableBytes.byteLength,
        schoolYear: year.year,
      },
      bytes: stableBytes,
    },
    analyzer,
    actor: args.actor,
    reason: args.reason,
  });
}
