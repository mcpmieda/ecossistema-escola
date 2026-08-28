import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { TurmasAlunosRepository } from '../shared/banco-notas-turmas-alunos';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';

function service(): TurmasAlunosRepository {
  return {
    filters: vi.fn(async () => ({
      schoolYears: [],
      classGroups: [],
      teachers: [],
      components: [],
    })),
    listTurmas: vi.fn(async (query) => ({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
      totalPages: 0,
    })),
    turmaDetail: vi.fn(async () => null),
    listAlunos: vi.fn(async (query) => ({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
      totalPages: 0,
    })),
    alunoDetail: vi.fn(async () => null),
  };
}
const repository = {} as BancoNotasRepository;
describe('Banco de Notas Turmas e Alunos API', () => {
  it('requires analytics capability and forwards validated filters', async () => {
    const readModel = service();
    const response = await routeBancoNotasApi({
      request: new Request(
        'https://example.test/api/banco-notas/v1/alunos?classGroupId=11111111-1111-4111-8111-111111111111&q=Ana&page=2&pageSize=10',
      ),
      repository,
      turmasAlunos: readModel,
      capabilities: ['grades.analytics.read'],
      actor: 'actor',
    });
    expect(response.status).toBe(200);
    expect(readModel.listAlunos).toHaveBeenCalledWith({
      classGroupId: '11111111-1111-4111-8111-111111111111',
      q: 'Ana',
      page: 2,
      pageSize: 10,
    });
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/turmas'),
        repository,
        turmasAlunos: readModel,
        capabilities: ['grades.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('rejects invalid pagination and returns safe not-found errors', async () => {
    const readModel = service();
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/turmas?pageSize=101'),
        repository,
        turmasAlunos: readModel,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/alunos/11111111-1111-4111-8111-111111111111',
        ),
        repository,
        turmasAlunos: readModel,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 404, message: 'Aluno não encontrado' });
  });
  it('fails closed when the read-model adapter is unavailable', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/turmas'),
        repository,
        capabilities: ['grades.analytics.read'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
