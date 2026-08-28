import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { BancoNotasSearchRepository } from '../shared/banco-notas-pesquisa';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';

function service(): BancoNotasSearchRepository {
  return {
    search: vi.fn(async (query) => ({
      query: query.q,
      normalizedQuery: query.q.toLowerCase(),
      limitPerType: query.limitPerType,
      results: {
        students: { items: [], total: 0, hasMore: false },
        teachers: { items: [], total: 0, hasMore: false },
        classGroups: { items: [], total: 0, hasMore: false },
      },
    })),
  };
}

const repository = {} as BancoNotasRepository;
const yearId = '11111111-1111-4111-8111-111111111111';

describe('Banco de Notas Pesquisa Global API', () => {
  it('requires analytics capability and forwards validated parameters', async () => {
    const search = service();
    const response = await routeBancoNotasApi({
      request: new Request(
        `https://example.test/api/banco-notas/v1/pesquisa?q=Aurora&types=teachers,classGroups&limitPerType=4&schoolYearId=${yearId}`,
      ),
      repository,
      search,
      capabilities: ['grades.analytics.read'],
      actor: 'actor',
    });
    expect(response.status).toBe(200);
    expect(search.search).toHaveBeenCalledWith({
      q: 'Aurora',
      types: ['teachers', 'classGroups'],
      limitPerType: 4,
      schoolYearId: yearId,
    });
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/pesquisa?q=Aurora'),
        repository,
        search,
        capabilities: ['grades.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects short, oversized and unsupported queries', async () => {
    for (const query of ['q=a', 'q=aa&limitPerType=11', 'q=aa&types=students,unknown']) {
      await expect(
        routeBancoNotasApi({
          request: new Request(`https://example.test/api/banco-notas/v1/pesquisa?${query}`),
          repository,
          search: service(),
          capabilities: ['grades.analytics.read'],
          actor: 'actor',
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('allows only GET and fails closed when the D1 adapter is absent', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/pesquisa?q=Ana', {
          method: 'POST',
          body: '{}',
          headers: { 'Content-Type': 'application/json' },
        }),
        repository,
        search: service(),
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 405 });
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/pesquisa?q=Ana'),
        repository,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
