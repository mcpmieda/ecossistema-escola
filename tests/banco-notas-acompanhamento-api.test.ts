import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { AcompanhamentoRepository } from '../shared/banco-notas-acompanhamento';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';

const emptySummary = {
  classGroups: 0,
  trackedItems: 0,
  teachers: 0,
  models: 0,
  connectedModels: 0,
  syncEnabled: 0,
  openFindings: 0,
  needsAttention: 0,
  modelStates: [],
  filters: { schoolYears: [], classGroups: [], teachers: [] },
  recentActivity: [],
};

function acompanhamento(): AcompanhamentoRepository {
  return {
    summary: vi.fn(async () => emptySummary),
    list: vi.fn(async (query) => ({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
      totalPages: 0,
    })),
    detail: vi.fn(async () => null),
  };
}

function baseRepository(): BancoNotasRepository {
  return {} as BancoNotasRepository;
}

describe('Banco de Notas Acompanhamento API', () => {
  it('returns the summary only with the administrative analytics capability', async () => {
    const service = acompanhamento();
    const response = await routeBancoNotasApi({
      request: new Request('https://example.test/api/banco-notas/v1/acompanhamento/summary'),
      repository: baseRepository(),
      acompanhamento: service,
      capabilities: ['grades.analytics.read'],
      actor: 'synthetic-actor',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(emptySummary);
    expect(service.summary).toHaveBeenCalledOnce();

    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/acompanhamento/summary'),
        repository: baseRepository(),
        acompanhamento: service,
        capabilities: ['grades.read'],
        actor: 'synthetic-actor',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('validates and forwards server-side filters and pagination', async () => {
    const service = acompanhamento();
    const response = await routeBancoNotasApi({
      request: new Request(
        'https://example.test/api/banco-notas/v1/acompanhamento/turmas?schoolYearId=11111111-1111-4111-8111-111111111111&modelState=connected&sync=disabled&attention=normal&q=Turma&page=2&pageSize=10',
      ),
      repository: baseRepository(),
      acompanhamento: service,
      capabilities: ['grades.analytics.read'],
      actor: 'synthetic-actor',
    });

    expect(response.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith({
      schoolYearId: '11111111-1111-4111-8111-111111111111',
      modelState: 'connected',
      sync: 'disabled',
      attention: 'normal',
      q: 'Turma',
      page: 2,
      pageSize: 10,
    });
  });

  it('rejects invalid filters and returns a safe not-found response for an absent class', async () => {
    const service = acompanhamento();
    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/acompanhamento/turmas?pageSize=1000',
        ),
        repository: baseRepository(),
        acompanhamento: service,
        capabilities: ['grades.analytics.read'],
        actor: 'synthetic-actor',
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/acompanhamento/turmas/22222222-2222-4222-8222-222222222222',
        ),
        repository: baseRepository(),
        acompanhamento: service,
        capabilities: ['grades.analytics.read'],
        actor: 'synthetic-actor',
      }),
    ).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada' });
  });

  it('fails closed when the D1 acompanhamento adapter is unavailable', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/acompanhamento/summary'),
        repository: baseRepository(),
        capabilities: ['grades.analytics.read'],
        actor: 'synthetic-actor',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
