import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { ProfessoresRepository } from '../shared/banco-notas-professores';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';

function service(): ProfessoresRepository {
  return {
    filters: vi.fn(async () => ({
      schoolYears: [],
      classGroups: [],
      components: [],
      diagnostics: {
        orphanAssignments: 0,
        modelsWithoutAssignments: 0,
        inactiveTeachersWithActiveAssignments: 0,
        assignmentsWithoutSource: 0,
      },
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

const repository = {} as BancoNotasRepository;
const teacherId = '22222222-2222-4222-8222-222222222222';
const yearId = '11111111-1111-4111-8111-111111111111';

describe('Banco de Notas Professores API', () => {
  it('requires analytics capability and forwards validated list filters', async () => {
    const readModel = service();
    const response = await routeBancoNotasApi({
      request: new Request(
        `https://example.test/api/banco-notas/v1/professores?schoolYearId=${yearId}&identity=missing&assignment=without&attention=normal&q=Bento&page=2&pageSize=10`,
      ),
      repository,
      professores: readModel,
      capabilities: ['grades.analytics.read'],
      actor: 'actor',
    });
    expect(response.status).toBe(200);
    expect(readModel.list).toHaveBeenCalledWith({
      schoolYearId: yearId,
      identity: 'missing',
      assignment: 'without',
      attention: 'normal',
      q: 'Bento',
      page: 2,
      pageSize: 10,
    });
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/professores'),
        repository,
        professores: readModel,
        capabilities: ['grades.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('validates the detail year and returns a safe 404', async () => {
    const readModel = service();
    await expect(
      routeBancoNotasApi({
        request: new Request(
          `https://example.test/api/banco-notas/v1/professores/${teacherId}?schoolYearId=${yearId}`,
        ),
        repository,
        professores: readModel,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 404, message: 'Professor não encontrado' });
    expect(readModel.detail).toHaveBeenCalledWith(teacherId, { schoolYearId: yearId });
    await expect(
      routeBancoNotasApi({
        request: new Request(
          `https://example.test/api/banco-notas/v1/professores/${teacherId}?schoolYearId=invalid`,
        ),
        repository,
        professores: readModel,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects invalid list filters and fails closed without the adapter', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/professores?pageSize=101&identity=unknown',
        ),
        repository,
        professores: service(),
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/professores/filters'),
        repository,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
