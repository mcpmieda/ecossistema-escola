import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';
import { PLATFORM_CAPABILITIES, type PlatformCapability } from '../shared/platform-contract';

function repository(): BancoNotasRepository {
  return {
    listSchoolYears: vi.fn(async () => []),
    createSchoolYear: vi.fn(async (input) => ({ id: 'year-id', ...input, status: 'planning' })),
    listTeachers: vi.fn(async () => []),
    listSources: vi.fn(async () => []),
    createSource: vi.fn(async (input) => ({
      id: '11111111-1111-4111-8111-111111111111',
      ...input,
      status: 'active',
      migrationState: 'not_started',
      environment: 'homologation',
    })),
    patchSource: vi.fn(async () => null),
    listAssignments: vi.fn(async () => []),
    createAssignment: vi.fn(async (input) => ({
      id: '22222222-2222-4222-8222-222222222222',
      ...input,
      status: 'active',
      operatorId: 'actor',
      createdAt: '2026-08-25T12:00:00Z',
      updatedAt: '2026-08-25T12:00:00Z',
    })),
    patchAssignment: vi.fn(async () => null),
    listImportJobs: vi.fn(async () => []),
    findImportJob: vi.fn(async () => null),
    createImportJob: vi.fn(async (input, actor) => ({
      id: '33333333-3333-4333-8333-333333333333',
      ...input,
      state: 'draft' as const,
      provenance: { ...input.provenance, sourceFormat: input.sourceFormat },
      requestedBy: actor,
      createdAt: '2026-08-25T12:00:00Z',
      updatedAt: '2026-08-25T12:00:00Z',
      findings: [],
    })),
    transitionImportJob: vi.fn(async () => null),
  } as BancoNotasRepository;
}

function capabilities(...items: PlatformCapability[]): PlatformCapability[] {
  return items;
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

  it('allows source reads with read capability but rejects writes without manage', async () => {
    const repo = repository();
    const readResponse = await routeBancoNotasApi({
      request: new Request('https://example.test/api/banco-notas/v1/data-sources'),
      repository: repo,
      capabilities: capabilities('grades.sources.read'),
      actor: 'actor',
    });
    expect(readResponse.status).toBe(200);
    expect(repo.listSources).toHaveBeenCalledOnce();

    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/data-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolYearId: '11111111-1111-4111-8111-111111111111',
            type: 'legacy_import',
            name: 'Fonte sintética',
            description: '',
          }),
        }),
        repository: repo,
        capabilities: capabilities('grades.sources.read'),
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.createSource).not.toHaveBeenCalled();
  });

  it('requires a reason for administrative source patches', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/data-sources/11111111-1111-4111-8111-111111111111',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'inactive' }),
          },
        ),
        repository: repository(),
        capabilities: capabilities('grades.sources.manage'),
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('requires a reason for administrative assignment patches', async () => {
    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/source-assignments/22222222-2222-4222-8222-222222222222',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ syncEnabled: true }),
          },
        ),
        repository: repository(),
        capabilities: capabilities('grades.sources.manage'),
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps a cross-year source assignment to a conflict', async () => {
    const repo = repository();
    vi.mocked(repo.createAssignment).mockRejectedValueOnce(
      new Error('source_assignment_year_mismatch'),
    );

    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/source-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolYearId: '11111111-1111-4111-8111-111111111111',
            sourceId: '22222222-2222-4222-8222-222222222222',
            scope: 'school_year_default',
            teacherId: null,
            authorityMode: 'authoritative',
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            syncEnabled: false,
            reason: 'teste de integridade',
          }),
        }),
        repository: repo,
        capabilities: capabilities('grades.sources.manage'),
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 409 });
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

  it('creates an import job only with the import capability and preserves provenance', async () => {
    const repo = repository();
    const response = await routeBancoNotasApi({
      request: new Request('https://example.test/api/banco-notas/v1/import-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolYearId: '11111111-1111-4111-8111-111111111111',
          teacherId: '22222222-2222-4222-8222-222222222222',
          dataSourceId: '33333333-3333-4333-8333-333333333333',
          idempotencyKey: 'synthetic-import-key',
          sourceHash: 'a'.repeat(64),
          sourceFormat: 'xlsb',
          provenance: { bridge: 'legacy-com-regression-only' },
        }),
      }),
      repository: repo,
      capabilities: capabilities('grades.import.run'),
      actor: 'actor',
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      state: 'draft',
      sourceHash: 'a'.repeat(64),
      provenance: { bridge: 'legacy-com-regression-only', sourceFormat: 'xlsb' },
    });
    expect(repo.createImportJob).toHaveBeenCalledOnce();
  });

  it('rejects a manual analyzed transition and reserves it for verified analysis', async () => {
    const repo = repository();

    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/import-jobs/33333333-3333-4333-8333-333333333333',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetState: 'analyzed',
              reason: 'tentativa manual',
              findings: [],
              resolvedFindingIds: [],
              provenance: {},
            }),
          },
        ),
        repository: repo,
        capabilities: capabilities('grades.import.run'),
        actor: 'actor',
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Import job analysis must use the verified analysis pipeline',
    });
    expect(repo.transitionImportJob).not.toHaveBeenCalled();
  });
});
