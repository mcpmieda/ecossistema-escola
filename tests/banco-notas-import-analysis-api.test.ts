import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { BancoNotasRepository, SchoolYear } from '../shared/banco-notas-contract';
import type {
  ImportAnalysis,
  ImportAnalysisRepository,
} from '../shared/banco-notas-import-analysis';
import type { ImportJob } from '../shared/banco-notas-import-jobs';
import type { LegacyWorkbookAnalyzer } from '../server/banco-notas/workbook-pipeline';

const importJobId = '33333333-3333-4333-8333-333333333333';
const schoolYearId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const dataSourceId = '44444444-4444-4444-8444-444444444444';
const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);

async function hash(value: Uint8Array): Promise<string> {
  const stable = new Uint8Array(value.byteLength);
  stable.set(value);
  const digest = await crypto.subtle.digest('SHA-256', stable);
  return Array.from(new Uint8Array(digest), (item) =>
    item.toString(16).padStart(2, '0'),
  ).join('');
}

function year(): SchoolYear {
  return {
    id: schoolYearId,
    year: 2026,
    name: 'Ano 2026',
    status: 'planning',
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
  };
}

async function setup(sourceHash = await hash(bytes)) {
  let state: ImportJob['state'] = 'draft';
  const job = (): ImportJob => ({
    id: importJobId,
    schoolYearId,
    teacherId,
    dataSourceId,
    idempotencyKey: 'synthetic-import-key',
    sourceHash,
    state,
    provenance: { sourceFormat: 'xlsx' },
    requestedBy: 'actor',
    createdAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
    findings: [],
  });

  const repository = {
    findImportJob: vi.fn(async () => job()),
    listSchoolYears: vi.fn(async () => [year()]),
  } as unknown as BancoNotasRepository;

  let stored: ImportAnalysis | null = null;
  const analyses: ImportAnalysisRepository = {
    findImportAnalysis: vi.fn(async () => stored),
    commitImportAnalysis: vi.fn(async (input) => {
      stored = {
        id: '55555555-5555-4555-8555-555555555555',
        importJobId: input.importJobId,
        analyzerId: input.analyzerId,
        analysisVersion: input.analysisVersion,
        sourceHash: input.sourceHash,
        sourceFormat: input.sourceFormat,
        schoolYear: input.schoolYear,
        model: input.model,
        createdBy: input.createdBy,
        createdAt: '2026-08-26T10:01:00.000Z',
      };
      state = 'analyzed';
      return stored;
    }),
  };

  const analyzer: LegacyWorkbookAnalyzer = {
    id: 'synthetic-xlsx-analyzer-v1',
    supportedFormats: ['xlsx'],
    async analyze(source) {
      return {
        schemaVersion: 1,
        sourceFormat: 'xlsx',
        sourceHash: source.metadata.sourceHash,
        schoolYear: source.metadata.schoolYear,
        analysisVersion: 'synthetic-analysis-v1',
        classes: [
          {
            sourceClassId: 'class:synthetic',
            displayName: 'Turma Sintética',
            sourceLocator: {
              sheetId: 'sheet:1',
              sheetDisplayName: 'Turma Sintética - Matemática',
              rangeAddress: 'A2:B2',
            },
          },
        ],
        components: [
          {
            sourceComponentId: 'component:synthetic',
            displayName: 'Matemática',
            sourceLocator: {
              sheetId: 'sheet:1',
              sheetDisplayName: 'Turma Sintética - Matemática',
              rangeAddress: 'A2:B2',
            },
          },
        ],
        students: [
          {
            sourceStudentId: 'student:synthetic',
            displayName: 'Estudante Sintético',
            sourceClassId: 'class:synthetic',
            sourceLocator: {
              sheetId: 'sheet:1',
              sheetDisplayName: 'Turma Sintética - Matemática',
              cellAddress: 'A2',
            },
          },
        ],
        gradeSlots: [
          {
            sourceGradeSlotId: 'slot:synthetic',
            sourceClassId: 'class:synthetic',
            sourceComponentId: 'component:synthetic',
            sourceStudentId: 'student:synthetic',
            field: 'NotaT1',
            sourceLocator: {
              sheetId: 'sheet:1',
              sheetDisplayName: 'Turma Sintética - Matemática',
              cellAddress: 'B2',
            },
          },
        ],
        findings: [],
      };
    },
  };

  return { repository, analyses, analyzer };
}

function uploadRequest(body = bytes): Request {
  return new Request(
    `https://example.test/api/banco-notas/v1/import-jobs/${importJobId}/analysis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'X-Import-Reason': 'análise sintética verificada',
      },
      body,
    },
  );
}

describe('Banco de Notas import analysis API', () => {
  it('analyzes a bounded XLSX upload through the registered verified analyzer', async () => {
    const { repository, analyses, analyzer } = await setup();
    const response = await routeBancoNotasApi({
      request: uploadRequest(),
      repository,
      capabilities: ['grades.import.run'],
      actor: 'actor',
      importAnalysis: { repository: analyses, analyzers: [analyzer] },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: { id: importJobId, state: 'analyzed' },
      analysis: {
        importJobId,
        analyzerId: 'synthetic-xlsx-analyzer-v1',
        analysisVersion: 'synthetic-analysis-v1',
      },
    });
    expect(analyses.commitImportAnalysis).toHaveBeenCalledOnce();
  });

  it('returns the persisted immutable analysis without re-running an analyzer', async () => {
    const { repository, analyses, analyzer } = await setup();
    await routeBancoNotasApi({
      request: uploadRequest(),
      repository,
      capabilities: ['grades.import.run'],
      actor: 'actor',
      importAnalysis: { repository: analyses, analyzers: [analyzer] },
    });

    const response = await routeBancoNotasApi({
      request: new Request(
        `https://example.test/api/banco-notas/v1/import-jobs/${importJobId}/analysis`,
      ),
      repository,
      capabilities: ['grades.import.run'],
      actor: 'actor',
      importAnalysis: { repository: analyses, analyzers: [] },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ importJobId });
  });

  it('fails closed when no analyzer is registered for the job format', async () => {
    const { repository, analyses } = await setup();
    await expect(
      routeBancoNotasApi({
        request: uploadRequest(),
        repository,
        capabilities: ['grades.import.run'],
        actor: 'actor',
        importAnalysis: { repository: analyses, analyzers: [] },
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(analyses.commitImportAnalysis).not.toHaveBeenCalled();
  });

  it('rejects bytes that do not match the import job SHA-256', async () => {
    const { repository, analyses, analyzer } = await setup('a'.repeat(64));
    await expect(
      routeBancoNotasApi({
        request: uploadRequest(),
        repository,
        capabilities: ['grades.import.run'],
        actor: 'actor',
        importAnalysis: { repository: analyses, analyzers: [analyzer] },
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(analyses.commitImportAnalysis).not.toHaveBeenCalled();
  });

  it('requires an explicit bounded audit reason for analysis', async () => {
    const { repository, analyses, analyzer } = await setup();
    const request = uploadRequest();
    request.headers.delete('X-Import-Reason');
    await expect(
      routeBancoNotasApi({
        request,
        repository,
        capabilities: ['grades.import.run'],
        actor: 'actor',
        importAnalysis: { repository: analyses, analyzers: [analyzer] },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
