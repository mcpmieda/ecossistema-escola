import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';
import { PLATFORM_CAPABILITIES } from '../shared/platform-contract';

function repository(): BancoNotasRepository {
  return {
    listSchoolYears: vi.fn(async () => []),
    createSchoolYear: vi.fn(async (input) => ({ id: 'year-id', ...input, status: 'planning' })),
    listTeachers: vi.fn(async () => []),
    listSources: vi.fn(async () => []),
    createSource: vi.fn(),
    patchSource: vi.fn(),
    listAssignments: vi.fn(async () => []),
    createAssignment: vi.fn(),
    patchAssignment: vi.fn(),
  } as BancoNotasRepository;
}
describe('Banco de Notas API', () => {
  it('returns a versioned health contract', async () => {
    const response = await routeBancoNotasApi({
      request: new Request('https://example.test/api/banco-notas/health'),
      repository: repository(),
      capabilities: PLATFORM_CAPABILITIES,
      actor: 'actor',
    });
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'banco-de-notas',
      version: '0.1.0',
    });
  });
  it('validates and creates a school year', async () => {
    const response = await routeBancoNotasApi({
      request: new Request('https://example.test/api/banco-notas/v1/school-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: 2026,
          name: 'Ano 2026',
          startsOn: '2026-01-01',
          endsOn: '2026-12-31',
        }),
      }),
      repository: repository(),
      capabilities: PLATFORM_CAPABILITIES,
      actor: 'actor',
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: 'year-id', year: 2026 });
  });
  it('fails closed without grades.read', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/health'),
        repository: repository(),
        capabilities: [],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
