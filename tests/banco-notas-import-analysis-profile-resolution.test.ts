import { describe, expect, it, vi } from 'vitest';
import type { ImportAnalysisProfileRepository } from '../shared/banco-notas-import-analysis-profile';
import type { ImportJob } from '../shared/banco-notas-import-jobs';
import { resolveImportAnalyzer } from '../server/banco-notas/import-analysis-upload';

const job: ImportJob = {
  id: '11111111-1111-4111-8111-111111111111',
  schoolYearId: '22222222-2222-4222-8222-222222222222',
  teacherId: '33333333-3333-4333-8333-333333333333',
  dataSourceId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'synthetic-import-key',
  sourceHash: 'a'.repeat(64),
  state: 'draft',
  provenance: { sourceFormat: 'xlsx' },
  requestedBy: 'actor',
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
  findings: [],
};

function profiles(attached = true): ImportAnalysisProfileRepository {
  return {
    listProfiles: vi.fn(async () => []),
    findProfile: vi.fn(async () => null),
    createProfile: vi.fn(async () => {
      throw new Error('not used');
    }),
    findForJob: vi.fn(async () =>
      attached
        ? {
            id: '55555555-5555-4555-8555-555555555555',
            schoolYearId: job.schoolYearId,
            dataSourceId: job.dataSourceId,
            sourceFormat: 'xlsx' as const,
            profileId: 'generic-source-v1',
            analysisVersion: 'xlsx-analysis-v1',
            profileHash: 'b'.repeat(64),
            profile: {
              schemaVersion: 1 as const,
              profileId: 'generic-source-v1',
              analysisVersion: 'xlsx-analysis-v1',
              worksheetRules: [
                {
                  ruleId: 'class-component',
                  sheetNamePattern: '^(?<class>.+?) - (?<component>.+)$',
                  caseInsensitive: false,
                  studentNameColumn: 'A',
                  firstStudentRow: 2,
                  maxStudentRows: 100,
                  gradeColumns: [{ field: 'NotaT1' as const, column: 'B' }],
                },
              ],
            },
            createdBy: 'actor',
            reason: 'configuração sintética',
            createdAt: '2026-08-26T10:00:00.000Z',
          }
        : null,
    ),
    attachToJob: vi.fn(async () => {
      throw new Error('not used');
    }),
  };
}

describe('Banco de Notas import analyzer resolution', () => {
  it('builds the XLSX analyzer from the immutable profile attached to the import job', async () => {
    const repository = profiles();
    const analyzer = await resolveImportAnalyzer(
      {
        repository: {
          findImportAnalysis: vi.fn(async () => null),
          commitImportAnalysis: vi.fn(async () => {
            throw new Error('not used');
          }),
        },
        analyzers: [],
        profiles: repository,
      },
      job,
    );

    expect(analyzer.id).toBe('banco-notas-xlsx-ooxml-v1:generic-source-v1:xlsx-analysis-v1');
    expect(analyzer.supportedFormats).toEqual(['xlsx']);
    expect(repository.findForJob).toHaveBeenCalledWith(job.id);
  });

  it('fails closed when an XLSX import has no attached profile', async () => {
    await expect(
      resolveImportAnalyzer(
        {
          repository: {
            findImportAnalysis: vi.fn(async () => null),
            commitImportAnalysis: vi.fn(async () => {
              throw new Error('not used');
            }),
          },
          analyzers: [],
          profiles: profiles(false),
        },
        job,
      ),
    ).rejects.toThrow('import_analysis_profile_not_attached');
  });

  it('keeps XLSB fail closed without an explicit XLSB analyzer', async () => {
    await expect(
      resolveImportAnalyzer(
        {
          repository: {
            findImportAnalysis: vi.fn(async () => null),
            commitImportAnalysis: vi.fn(async () => {
              throw new Error('not used');
            }),
          },
          analyzers: [],
          profiles: profiles(),
        },
        { ...job, provenance: { sourceFormat: 'xlsb' } },
      ),
    ).rejects.toThrow('import_analyzer_not_configured:xlsb');
  });
});
