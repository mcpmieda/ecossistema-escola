import { describe, expect, it, vi } from 'vitest';
import type { BancoNotasRepository, SchoolYear } from '../shared/banco-notas-contract';
import type {
  ImportAnalysis,
  ImportAnalysisCommit,
  ImportAnalysisRepository,
} from '../shared/banco-notas-import-analysis';
import type {
  ImportAnalysisProfile,
  ImportAnalysisProfileRepository,
} from '../shared/banco-notas-import-analysis-profile';
import type { ImportJob, ImportJobCreate } from '../shared/banco-notas-import-jobs';
import { manualImportQuerySchema } from '../shared/banco-notas-manual-import';
import { institutionalManualProfileKey } from '../shared/banco-notas-institutional-xlsx-profile';
import { importManualXlsx } from '../server/banco-notas/manual-import';
import { createManualXlsxFixture, manualXlsxProfile } from './fixtures/banco-notas-manual-xlsx';

const schoolYearId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const dataSourceId = '33333333-3333-4333-8333-333333333333';
const profileId = '44444444-4444-4444-8444-444444444444';
const jobId = '55555555-5555-4555-8555-555555555555';
const analysisId = '66666666-6666-4666-8666-666666666666';

const year: SchoolYear = {
  id: schoolYearId,
  year: 2026,
  name: 'Ano 2026',
  status: 'active',
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
};

const profile: ImportAnalysisProfile = {
  id: profileId,
  schoolYearId,
  dataSourceId,
  sourceFormat: 'xlsx',
  profileId: manualXlsxProfile.profileId,
  analysisVersion: manualXlsxProfile.analysisVersion,
  profileHash: 'a'.repeat(64),
  profile: manualXlsxProfile,
  createdBy: 'operator',
  reason: 'perfil sintético',
  createdAt: '2026-08-30T00:00:00.000Z',
};

function setup() {
  let currentJob: ImportJob | null = null;
  let currentAnalysis: ImportAnalysis | null = null;
  const createImportJob = vi.fn(async (input: ImportJobCreate): Promise<ImportJob> => {
    if (currentJob) return currentJob;
    currentJob = {
      id: jobId,
      schoolYearId: input.schoolYearId,
      teacherId: input.teacherId,
      dataSourceId: input.dataSourceId,
      idempotencyKey: input.idempotencyKey,
      sourceHash: input.sourceHash,
      state: 'draft',
      provenance: { ...input.provenance, sourceFormat: input.sourceFormat },
      requestedBy: 'operator',
      createdAt: '2026-08-30T00:01:00.000Z',
      updatedAt: '2026-08-30T00:01:00.000Z',
      findings: [],
    };
    return currentJob;
  });
  const repository = {
    listSchoolYears: vi.fn(async () => [year]),
    createImportJob,
    findImportJob: vi.fn(async () => currentJob),
  } as unknown as BancoNotasRepository;
  const analyses: ImportAnalysisRepository = {
    findImportAnalysis: vi.fn(async () => currentAnalysis),
    commitImportAnalysis: vi.fn(async (input: ImportAnalysisCommit) => {
      if (!currentAnalysis) {
        currentAnalysis = {
          id: analysisId,
          importJobId: input.importJobId,
          analyzerId: input.analyzerId,
          analysisVersion: input.analysisVersion,
          sourceHash: input.sourceHash,
          sourceFormat: input.sourceFormat,
          schoolYear: input.schoolYear,
          model: input.model,
          createdBy: input.createdBy,
          createdAt: '2026-08-30T00:02:00.000Z',
        };
      }
      if (currentJob) currentJob = { ...currentJob, state: 'analyzed' };
      return currentAnalysis;
    }),
  };
  const profiles = {
    createProfile: vi.fn(async () => profile),
    attachToJob: vi.fn(async () => profile),
  } as unknown as ImportAnalysisProfileRepository;
  return { repository, analyses, profiles, createImportJob };
}

function input() {
  return manualImportQuerySchema.parse({
    schoolYearId,
    teacherId,
    dataSourceId,
    profileKey: institutionalManualProfileKey,
    fileName: 'Notas Docente 2026.xlsx',
  });
}

describe('Banco de Notas manual XLSX import', () => {
  it('hashes, verifies and stores a position-based analysis in one operation', async () => {
    const bytes = await createManualXlsxFixture();
    const runtime = setup();
    const result = await importManualXlsx({
      repository: runtime.repository,
      runtime: { repository: runtime.analyses, analyzers: [], profiles: runtime.profiles },
      input: input(),
      bytes,
      actor: 'operator',
      reason: 'upload manual sintético',
    });

    expect(result).toMatchObject({
      state: 'analyzed',
      reused: false,
      classCount: 1,
      componentCount: 1,
      studentCount: 1,
      gradeSlotCount: 2,
    });
    const created = runtime.createImportJob.mock.calls[0]?.[0];
    expect(created?.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(created?.idempotencyKey).toBe(`manual-xlsx-v1:${dataSourceId}:${created?.sourceHash}`);
    expect(created?.provenance).toMatchObject({
      uploadMode: 'manual-xlsx-v1',
      fileName: 'Notas Docente 2026.xlsx',
      analysisProfileId: profileId,
    });
    const analysis = await runtime.analyses.findImportAnalysis(jobId);
    expect(analysis?.model.students[0]).toMatchObject({ studentPosition: 1 });
  });

  it('reuses the analyzed job when the same content is uploaded again', async () => {
    const bytes = await createManualXlsxFixture();
    const runtime = setup();
    const args = {
      repository: runtime.repository,
      runtime: { repository: runtime.analyses, analyzers: [], profiles: runtime.profiles },
      input: input(),
      bytes,
      actor: 'operator',
      reason: 'repetição idempotente',
    } as const;
    await importManualXlsx(args);
    const repeated = await importManualXlsx(args);

    expect(repeated.reused).toBe(true);
    expect(runtime.createImportJob).toHaveBeenCalledTimes(2);
    expect(await runtime.analyses.findImportAnalysis(jobId)).toMatchObject({ id: analysisId });
  });

  it('rejects an invalid package before creating an import job', async () => {
    const runtime = setup();
    await expect(
      importManualXlsx({
        repository: runtime.repository,
        runtime: { repository: runtime.analyses, analyzers: [], profiles: runtime.profiles },
        input: input(),
        bytes: new TextEncoder().encode('not-an-xlsx'),
        actor: 'operator',
        reason: 'arquivo inválido',
      }),
    ).rejects.toThrow(/^xlsx_/u);
    expect(runtime.createImportJob).not.toHaveBeenCalled();
  });

  it('rejects XLSB names at the public contract boundary', () => {
    expect(() =>
      manualImportQuerySchema.parse({ ...input(), fileName: 'Notas 2026.xlsb' }),
    ).toThrow('expected an XLSX file');
  });
});
