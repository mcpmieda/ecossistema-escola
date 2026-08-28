import { describe, expect, it, vi } from 'vitest';
import type { SchoolYear } from '../shared/banco-notas-contract';
import type {
  ImportAnalysis,
  ImportAnalysisCommit,
  ImportAnalysisRepository,
} from '../shared/banco-notas-import-analysis';
import type { ImportJob } from '../shared/banco-notas-import-jobs';
import { analyzeImportJob } from '../server/banco-notas/import-analysis';
import type {
  LegacyWorkbookAnalyzer,
  LegacyWorkbookSource,
} from '../server/banco-notas/workbook-pipeline';

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function source(): Promise<LegacyWorkbookSource> {
  const bytes = new TextEncoder().encode('synthetic-import-analysis-workbook');
  return {
    metadata: {
      sourceFormat: 'xlsx',
      sourceHash: await sha256(bytes),
      byteLength: bytes.byteLength,
      schoolYear: 2026,
    },
    bytes,
  };
}

function job(sourceHash: string, state: ImportJob['state'] = 'draft'): ImportJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    schoolYearId: '22222222-2222-4222-8222-222222222222',
    teacherId: '33333333-3333-4333-8333-333333333333',
    dataSourceId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'synthetic-analysis-job',
    sourceHash,
    state,
    provenance: { sourceFormat: 'xlsx' },
    requestedBy: 'actor@example.test',
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
    findings: [],
  };
}

const schoolYear: SchoolYear = {
  id: '22222222-2222-4222-8222-222222222222',
  year: 2026,
  name: '2026',
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
  status: 'planning',
};

function analyzer(): LegacyWorkbookAnalyzer {
  return {
    id: 'synthetic-xlsx-analyzer',
    supportedFormats: ['xlsx'],
    async analyze(input) {
      return {
        schemaVersion: 1,
        sourceFormat: input.metadata.sourceFormat,
        sourceHash: input.metadata.sourceHash,
        schoolYear: input.metadata.schoolYear,
        analysisVersion: 'analysis-1',
        classes: [],
        components: [],
        students: [],
        gradeSlots: [],
        findings: ['estrutura sintética revisada'],
      };
    },
  };
}

function analysisFrom(input: ImportAnalysisCommit): ImportAnalysis {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    importJobId: input.importJobId,
    analyzerId: input.analyzerId,
    analysisVersion: input.analysisVersion,
    sourceHash: input.sourceHash,
    sourceFormat: input.sourceFormat,
    schoolYear: input.schoolYear,
    model: input.model,
    createdBy: input.createdBy,
    createdAt: '2026-08-26T00:01:00.000Z',
  };
}

describe('Banco de Notas import analysis orchestration', () => {
  it('verifies the workbook and commits an analyzed job with provenance findings', async () => {
    const input = await source();
    const initial = job(input.metadata.sourceHash);
    const analyzedJob = { ...initial, state: 'analyzed' as const };
    const findImportJob = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(analyzedJob);
    const commitImportAnalysis = vi.fn(async (commit: ImportAnalysisCommit) =>
      analysisFrom(commit),
    );

    const result = await analyzeImportJob({
      jobs: {
        findImportJob,
        listSchoolYears: vi.fn().mockResolvedValue([schoolYear]),
      },
      analyses: {
        findImportAnalysis: vi.fn(),
        commitImportAnalysis,
      },
      jobId: initial.id,
      source: input,
      analyzer: analyzer(),
      actor: 'actor@example.test',
      reason: 'análise sintética validada',
    });

    expect(result.job.state).toBe('analyzed');
    expect(result.analysis.analyzerId).toBe('synthetic-xlsx-analyzer');
    expect(commitImportAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        importJobId: initial.id,
        sourceHash: input.metadata.sourceHash,
        sourceFormat: 'xlsx',
        schoolYear: 2026,
        analysisVersion: 'analysis-1',
        findings: [
          {
            severity: 'warning',
            code: 'legacy_analysis_finding',
            location: { analysisFindingIndex: 0 },
            details: { message: 'estrutura sintética revisada' },
          },
        ],
      }),
    );
  });

  it('rejects a source hash mismatch before invoking the analyzer or persistence', async () => {
    const input = await source();
    const analyze = vi.fn(analyzer().analyze);
    const commitImportAnalysis = vi.fn();

    await expect(
      analyzeImportJob({
        jobs: {
          findImportJob: vi.fn().mockResolvedValue(job('f'.repeat(64))),
          listSchoolYears: vi.fn().mockResolvedValue([schoolYear]),
        },
        analyses: {
          findImportAnalysis: vi.fn(),
          commitImportAnalysis,
        } as unknown as ImportAnalysisRepository,
        jobId: '11111111-1111-4111-8111-111111111111',
        source: input,
        analyzer: { ...analyzer(), analyze },
        actor: 'actor@example.test',
        reason: 'análise sintética validada',
      }),
    ).rejects.toThrow('import_analysis_source_mismatch');

    expect(analyze).not.toHaveBeenCalled();
    expect(commitImportAnalysis).not.toHaveBeenCalled();
  });

  it('does not mutate the import job when the analyzer fails', async () => {
    const input = await source();
    const initial = job(input.metadata.sourceHash);
    const commitImportAnalysis = vi.fn();

    await expect(
      analyzeImportJob({
        jobs: {
          findImportJob: vi.fn().mockResolvedValue(initial),
          listSchoolYears: vi.fn().mockResolvedValue([schoolYear]),
        },
        analyses: {
          findImportAnalysis: vi.fn(),
          commitImportAnalysis,
        } as unknown as ImportAnalysisRepository,
        jobId: initial.id,
        source: input,
        analyzer: {
          ...analyzer(),
          async analyze() {
            throw new Error('synthetic_analyzer_failure');
          },
        },
        actor: 'actor@example.test',
        reason: 'análise sintética validada',
      }),
    ).rejects.toThrow('synthetic_analyzer_failure');

    expect(commitImportAnalysis).not.toHaveBeenCalled();
  });

  it('allows an idempotent analyzed retry to be resolved by the analysis repository', async () => {
    const input = await source();
    const analyzed = job(input.metadata.sourceHash, 'analyzed');
    const commitImportAnalysis = vi.fn(async (commit: ImportAnalysisCommit) =>
      analysisFrom(commit),
    );
    const findImportJob = vi.fn().mockResolvedValue(analyzed);

    const result = await analyzeImportJob({
      jobs: {
        findImportJob,
        listSchoolYears: vi.fn().mockResolvedValue([schoolYear]),
      },
      analyses: {
        findImportAnalysis: vi.fn(),
        commitImportAnalysis,
      },
      jobId: analyzed.id,
      source: input,
      analyzer: analyzer(),
      actor: 'actor@example.test',
      reason: 'repetição idempotente',
    });

    expect(result.job.state).toBe('analyzed');
    expect(commitImportAnalysis).toHaveBeenCalledOnce();
  });

  it('blocks analysis after the job has advanced beyond analyzed', async () => {
    const input = await source();
    const commitImportAnalysis = vi.fn();

    await expect(
      analyzeImportJob({
        jobs: {
          findImportJob: vi.fn().mockResolvedValue(job(input.metadata.sourceHash, 'generated')),
          listSchoolYears: vi.fn().mockResolvedValue([schoolYear]),
        },
        analyses: {
          findImportAnalysis: vi.fn(),
          commitImportAnalysis,
        } as unknown as ImportAnalysisRepository,
        jobId: '11111111-1111-4111-8111-111111111111',
        source: input,
        analyzer: analyzer(),
        actor: 'actor@example.test',
        reason: 'análise tardia',
      }),
    ).rejects.toThrow('invalid_import_job_transition:generated:analyzed');

    expect(commitImportAnalysis).not.toHaveBeenCalled();
  });
});
