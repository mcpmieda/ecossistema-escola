import { describe, expect, it, vi } from 'vitest';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';
import type { ImportAnalysisRepository } from '../shared/banco-notas-import-analysis';
import type { ImportAnalysisProfileRepository } from '../shared/banco-notas-import-analysis-profile';
import { routeBancoNotasApi } from '../server/banco-notas/api';

const endpoint =
  'https://example.test/api/banco-notas/v1/manual-imports?schoolYearId=11111111-1111-4111-8111-111111111111&teacherId=22222222-2222-4222-8222-222222222222&dataSourceId=33333333-3333-4333-8333-333333333333&profileKey=ieda-standard-overview-2026-v1&fileName=Notas%202026.xlsx';

function request(contentType = 'application/octet-stream') {
  return new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'X-Import-Reason': 'upload manual' },
    body: new Uint8Array([1, 2, 3]),
  });
}

const repository = { createImportJob: vi.fn() } as unknown as BancoNotasRepository;
const profiles = {} as ImportAnalysisProfileRepository;
const analyses = {} as ImportAnalysisRepository;

describe('Banco de Notas manual import API boundary', () => {
  it('requires grades.import.run before reading the binary body', async () => {
    await expect(
      routeBancoNotasApi({
        request: request(),
        repository,
        capabilities: ['grades.read'],
        actor: 'operator',
        importAnalysis: { repository: analyses, analyzers: [], profiles },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.createImportJob).not.toHaveBeenCalled();
  });

  it('rejects a non-XLSX media type before invoking persistence', async () => {
    await expect(
      routeBancoNotasApi({
        request: request(),
        repository,
        capabilities: ['grades.import.run'],
        actor: 'operator',
        importAnalysis: { repository: analyses, analyzers: [], profiles },
      }),
    ).rejects.toMatchObject({ status: 415 });
    expect(repository.createImportJob).not.toHaveBeenCalled();
  });
});
