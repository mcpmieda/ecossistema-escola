// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasAddinApi } from '../server/banco-notas/addin-api';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import {
  BearerAuthenticationError,
  type EntraAccessTokenClaims,
} from '../server/auth/entra-access-token';
import type { D1BancoNotasSyncService } from '../server/banco-notas/d1-sync-service';
import type { BancoNotasRepository } from '../shared/banco-notas-contract';
import type { GradeEventStore } from '../shared/banco-notas-grade-events';
import { testEnv } from './fixtures';

const oid = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const body = {
  schemaVersion: 1 as const,
  requestId,
  workbook: {
    workbookModelId: '33333333-3333-4333-8333-333333333333',
    sourceHash: 'a'.repeat(64),
    relationshipSnapshotId: '44444444-4444-4444-8444-444444444444',
    definitionVersion: '1',
    layoutVersion: '1',
    mappingVersion: 1,
    schoolYear: 2026,
    sheetKey: 'sheet-1',
  },
  changes: [
    {
      cellAddress: 'B2',
      field: 'NotaT1' as const,
      baselineEventId: '55555555-5555-4555-8555-555555555555',
      baselineSequence: 1,
      valueAfter: 8,
      isAbsent: false,
    },
  ],
};
const claims: EntraAccessTokenClaims = {
  ver: '2.0',
  aud: '66666666-6666-4666-8666-666666666666',
  iss: 'https://login.microsoftonline.com/tenant/v2.0',
  tid: '77777777-7777-4777-8777-777777777777',
  oid,
  sub: 'subject',
  exp: 2_000_000_000,
  scp: 'BancoNotas.Sync',
  azp: '66666666-6666-4666-8666-666666666666',
};

function service() {
  return {
    preflight: vi.fn(async () => ({
      schemaVersion: 1,
      requestId,
      status: 'ready',
      changeCount: 1,
      conflictCount: 0,
      preflightFingerprint: 'b'.repeat(64),
    })),
    commit: vi.fn(async () => ({
      schemaVersion: 1,
      requestId,
      status: 'committed',
      changeCount: 1,
      conflictCount: 0,
      eventIds: ['88888888-8888-4888-8888-888888888888'],
    })),
    outcome: vi.fn(async () => ({
      schemaVersion: 1,
      requestId,
      status: 'committed',
      changeCount: 1,
      conflictCount: 0,
    })),
    listAttempts: vi.fn(async () => []),
    attemptDetail: vi.fn(async () => null),
    readiness: vi.fn(async () => ({
      generatedAt: '2026-08-29T12:00:00.000Z',
      globalSyncEnabled: false,
      commitRouteEnabled: false,
      counts: { ready: 0, blocked: 0, needsAttention: 0 },
      items: [],
    })),
  };
}
function addinRequest(path: string, value: unknown = body, method = 'POST') {
  return new Request(`https://admin.escolaieda.com/api/banco-notas${path}`, {
    method,
    headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(value) : undefined,
  });
}
function addinRoute(
  sync: ReturnType<typeof service>,
  request: Request,
  verifyToken = async () => claims,
) {
  return routeBancoNotasAddinApi({
    request,
    env: testEnv,
    store: {} as GradeEventStore,
    authorizer: { assertTeacherModelOwner: vi.fn() },
    syncService: sync as unknown as D1BancoNotasSyncService,
    verifyToken: verifyToken as never,
  });
}

describe('Banco de Notas Sync API', () => {
  it('authenticates delegated preflight and forwards only validated input with actor OID', async () => {
    const sync = service();
    const response = await addinRoute(sync, addinRequest('/v1/addin/sync/preflight'));
    expect(response.status).toBe(200);
    expect(sync.preflight).toHaveBeenCalledWith(body, oid);
  });

  it('validates commit and scopes outcome lookup to the authenticated actor', async () => {
    const sync = service();
    await addinRoute(
      sync,
      addinRequest('/v1/addin/sync/commit', { ...body, preflightFingerprint: 'b'.repeat(64) }),
    );
    expect(sync.commit).toHaveBeenCalledWith(
      expect.objectContaining({ requestId, preflightFingerprint: 'b'.repeat(64) }),
      oid,
    );
    await addinRoute(sync, addinRequest('/v1/addin/sync/outcome', { requestId }));
    expect(sync.outcome).toHaveBeenCalledWith(requestId, oid);
  });

  it('fails closed for invalid bearer, schema, method, storage and oversized payload', async () => {
    const sync = service();
    await expect(
      addinRoute(sync, addinRequest('/v1/addin/sync/preflight'), async () => {
        throw new BearerAuthenticationError('missing');
      }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      addinRoute(
        sync,
        addinRequest('/v1/addin/sync/preflight', { ...body, forgedGradeKey: 'forged' }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      addinRoute(sync, addinRequest('/v1/addin/sync/preflight', body, 'GET')),
    ).rejects.toMatchObject({ status: 405 });
    await expect(
      routeBancoNotasAddinApi({
        request: addinRequest('/v1/addin/sync/preflight'),
        env: testEnv,
        store: {} as GradeEventStore,
        authorizer: { assertTeacherModelOwner: vi.fn() },
        verifyToken: (async () => claims) as never,
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      addinRoute(sync, addinRequest('/v1/addin/sync/preflight', { padding: 'x'.repeat(17_000) })),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('governs admin attempts by analytics capability, bounded filters and read-only methods', async () => {
    const sync = service();
    await routeBancoNotasApi({
      request: new Request(
        `https://example.test/api/banco-notas/v1/sync/attempts?status=conflict&teacherModelId=${body.workbook.workbookModelId}&limit=20`,
      ),
      repository: {} as BancoNotasRepository,
      capabilities: ['grades.analytics.read'],
      actor: 'admin',
      syncAttempts: sync as unknown as D1BancoNotasSyncService,
    });
    expect(sync.listAttempts).toHaveBeenCalledWith({
      status: 'conflict',
      teacherModelId: body.workbook.workbookModelId,
      limit: 20,
    });
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/sync/attempts'),
        repository: {} as BancoNotasRepository,
        capabilities: ['grades.read'],
        actor: 'admin',
        syncAttempts: sync as unknown as D1BancoNotasSyncService,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/sync/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
        repository: {} as BancoNotasRepository,
        capabilities: ['grades.analytics.read'],
        actor: 'admin',
        syncAttempts: sync as unknown as D1BancoNotasSyncService,
      }),
    ).rejects.toMatchObject({ status: 405 });
  });

  it('exposes automated cohort readiness only with analytics capability', async () => {
    const sync = service();
    const response = await routeBancoNotasApi({
      request: new Request('https://example.test/api/banco-notas/v1/sync/readiness'),
      repository: {} as BancoNotasRepository,
      capabilities: ['grades.analytics.read'],
      actor: 'admin',
      syncAttempts: sync as unknown as D1BancoNotasSyncService,
    });
    expect(response.status).toBe(200);
    expect(sync.readiness).toHaveBeenCalledOnce();
    await expect(
      routeBancoNotasApi({
        request: new Request('https://example.test/api/banco-notas/v1/sync/readiness'),
        repository: {} as BancoNotasRepository,
        capabilities: ['grades.read'],
        actor: 'admin',
        syncAttempts: sync as unknown as D1BancoNotasSyncService,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
