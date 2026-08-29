import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';
import type { PendenciasRepository } from '../shared/banco-notas-pendencias';

const repository = {} as BancoNotasRepository;
const yearId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';

function service(): PendenciasRepository {
  return {
    summary: vi.fn(async () => ({
      total: 0,
      error: 0,
      warning: 0,
      info: 0,
      byKind: [],
      filters: { schoolYears: [], teachers: [], classGroups: [], components: [] },
    })),
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

function request(path: string) {
  return new Request(`https://example.test/api/banco-notas${path}`);
}

describe('Banco de Notas Central de Pendências API', () => {
  it('requires analytics capability and forwards validated summary filters', async () => {
    const readModel = service();
    const response = await routeBancoNotasApi({
      request: request(
        `/v1/pendencias/summary?schoolYearId=${yearId}&teacherId=${teacherId}&kind=source_missing&q=Bento`,
      ),
      repository,
      pendencias: readModel,
      capabilities: ['grades.analytics.read'],
      actor: 'actor',
    });
    expect(response.status).toBe(200);
    expect(readModel.summary).toHaveBeenCalledWith({
      schoolYearId: yearId,
      teacherId,
      kind: 'source_missing',
      q: 'Bento',
    });
    await expect(
      routeBancoNotasApi({
        request: request('/v1/pendencias/summary'),
        repository,
        pendencias: readModel,
        capabilities: ['grades.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('validates and forwards list filters with bounded pagination', async () => {
    const readModel = service();
    await routeBancoNotasApi({
      request: request(
        `/v1/pendencias?schoolYearId=${yearId}&severity=warning&kind=source_missing&teacherId=${teacherId}&status=open&page=2&pageSize=10`,
      ),
      repository,
      pendencias: readModel,
      capabilities: ['grades.analytics.read'],
      actor: 'actor',
    });
    expect(readModel.list).toHaveBeenCalledWith({
      schoolYearId: yearId,
      severity: 'warning',
      kind: 'source_missing',
      teacherId,
      status: 'open',
      page: 2,
      pageSize: 10,
    });
    await expect(
      routeBancoNotasApi({
        request: request('/v1/pendencias?severity=critical&pageSize=101'),
        repository,
        pendencias: readModel,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('decodes stable detail ids, returns 404 safely and fails closed without storage', async () => {
    const readModel = service();
    await expect(
      routeBancoNotasApi({
        request: request('/v1/pendencias/source_missing%3Aassignment-1'),
        repository,
        pendencias: readModel,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 404, message: 'Pendência não encontrada' });
    expect(readModel.detail).toHaveBeenCalledWith('source_missing:assignment-1');

    await expect(
      routeBancoNotasApi({
        request: request('/v1/pendencias'),
        repository,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('keeps all Central endpoints read-only', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/pendencias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
        repository,
        pendencias: service(),
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 405 });
  });
});
