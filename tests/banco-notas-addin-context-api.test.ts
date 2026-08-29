// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasAddinApi } from '../server/banco-notas/addin-api';
import { BancoNotasAddinForbiddenError } from '../server/banco-notas/d1-addin-authorizer';
import {
  BearerAuthenticationError,
  type EntraAccessTokenClaims,
} from '../server/auth/entra-access-token';
import type { BancoNotasAddinContextRepository } from '../shared/banco-notas-addin-context';
import type { GradeEventStore } from '../shared/banco-notas-grade-events';
import { testEnv } from './fixtures';

const oid = '11111111-1111-4111-8111-111111111111';
const query = new URLSearchParams({
  workbookModelId: '22222222-2222-4222-8222-222222222222',
  sourceHash: 'a'.repeat(64),
  relationshipSnapshotId: '33333333-3333-4333-8333-333333333333',
  definitionVersion: 'definition-v1',
  layoutVersion: 'layout-v1',
  mappingVersion: '2',
  schoolYear: '2026',
  sheetKey: 'sheet-matematica',
});

const response = {
  schemaVersion: 1 as const,
  teacher: { label: 'Professor Sintético' },
  schoolYear: { label: 'Ano 2026' },
  assignment: { classGroupLabel: '2º Ano A', componentLabel: 'Matemática' },
  model: { version: 3, mappingVersion: 2, state: 'connected' as const },
  syncEnabled: false,
  lastActivityAt: null,
  preflight: {
    status: 'warning' as const,
    checks: {
      structureValid: true as const,
      modelRecognized: true as const,
      teacherAuthorized: true as const,
      workbookCompatible: true as const,
    },
    reasons: ['sync_disabled_by_administration' as const],
  },
  pending: [
    {
      severity: 'info' as const,
      code: 'sync_disabled_by_administration' as const,
      message: 'Sincronização indisponível pela administração enquanto o piloto não está ativo.',
    },
  ],
  mappings: [],
};

function claims(): EntraAccessTokenClaims {
  return {
    ver: '2.0',
    aud: '44444444-4444-4444-8444-444444444444',
    iss: 'https://login.microsoftonline.com/tenant/v2.0',
    tid: '55555555-5555-4555-8555-555555555555',
    oid,
    sub: 'synthetic-subject',
    exp: 2_000_000_000,
    scp: 'BancoNotas.Sync',
    azp: '44444444-4444-4444-8444-444444444444',
  };
}

const store = {} as GradeEventStore;
const authorizer = { assertTeacherModelOwner: vi.fn() };

function request(search = query, method = 'GET') {
  return new Request(`https://admin.escolaieda.com/api/banco-notas/v1/addin/context?${search}`, {
    method,
    headers: { Authorization: 'Bearer synthetic-token' },
  });
}

function route(args: {
  repository?: BancoNotasAddinContextRepository;
  request?: Request;
  verifyToken?: () => Promise<EntraAccessTokenClaims>;
}) {
  return routeBancoNotasAddinApi({
    request: args.request ?? request(),
    env: testEnv,
    store,
    authorizer,
    contextRepository: args.repository,
    verifyToken: (args.verifyToken ?? (async () => claims())) as never,
  });
}

describe('Banco de Notas cotidiano add-in context API', () => {
  it('requires delegated bearer and forwards the OID only to the ownership repository', async () => {
    const repository: BancoNotasAddinContextRepository = {
      context: vi.fn().mockResolvedValue(response),
    };
    const result = await route({ repository });
    await expect(result.json()).resolves.toEqual(response);
    expect(repository.context).toHaveBeenCalledWith(
      expect.objectContaining({ sheetKey: 'sheet-matematica', mappingVersion: 2 }),
      oid,
    );
  });

  it('fails closed for missing bearer, ownership denial and unavailable storage', async () => {
    await expect(
      route({
        repository: { context: vi.fn() },
        verifyToken: async () => {
          throw new BearerAuthenticationError('Missing or malformed bearer token');
        },
      }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      route({
        repository: {
          context: vi
            .fn()
            .mockRejectedValue(new BancoNotasAddinForbiddenError('teacher_model_not_owned')),
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(route({})).rejects.toMatchObject({ status: 503 });
  });

  it('distinguishes invalid context, unknown workbook and wrong method', async () => {
    await expect(
      route({
        repository: { context: vi.fn() },
        request: request(new URLSearchParams({ sheetKey: 'only-one-field' })),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      route({ repository: { context: vi.fn().mockResolvedValue(null) } }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      route({ repository: { context: vi.fn() }, request: request(query, 'POST') }),
    ).rejects.toMatchObject({ status: 405 });
  });

  it('returns a minimized DTO without claims or technical identity fields', async () => {
    const result = await route({ repository: { context: vi.fn().mockResolvedValue(response) } });
    const serialized = await result.text();
    expect(serialized).not.toMatch(/oid|claims|tenant|drive_item|teacher_model_id|token/iu);
  });
});
