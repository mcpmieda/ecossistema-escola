import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onRequest } from '../../../functions/[[path]]';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import {
  GRADEBOOK_AUDIT_WORKSPACE_ROUTE_V1,
  handleAuditWorkspaceRequestV1,
} from '../../../server/gradebook/http/audit-workspace-routes-v1';
import { authorizeGradebookD1RuntimeV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import type { AuditOccurrenceId, AuditOccurrenceV1 } from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { ImportBatchResultV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type { ImportBatchId, ImportFileId } from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import { testEnv } from '../../fixtures';
import {
  academicYearId,
  context,
  instant,
  openMigratedDatabase,
  seedContext,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const LOCAL_ORIGIN = 'http://localhost:8788';
const SESSION_OID = '11111111-1111-4111-8111-111111111111';
const batchA = 'import-batch:audit-http:a' as ImportBatchId;
const batchB = 'import-batch:audit-http:b' as ImportBatchId;
const fileA = 'import-file:audit-http:a' as ImportFileId;
const occurrenceId = 'audit-occurrence:audit-http:a' as AuditOccurrenceId;
type TestRole = 'ADMINISTRADOR' | 'PROFESSOR';

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  seedContext(database);
});

afterEach(() => database.raw.close());

function localEnv(binding: unknown = database): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: 'local',
    OFFICIAL_ORIGIN: LOCAL_ORIGIN,
    GRADEBOOK_D1: binding,
  };
}

async function requestHeaders(role?: TestRole, origin = LOCAL_ORIGIN): Promise<Headers> {
  const headers = new Headers({ Origin: origin, 'Content-Type': 'application/json' });
  if (!role) return headers;
  const session = await seal(
    {
      oid: SESSION_OID,
      name: 'Administrador Sintético',
      username: 'synthetic-audit@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  headers.set('Cookie', `${SESSION_COOKIE}=${session}`);
  return headers;
}

async function auditRequest(
  body: unknown,
  options: { readonly role?: TestRole; readonly origin?: string; readonly base?: string } = {},
): Promise<Request> {
  const base = options.base ?? LOCAL_ORIGIN;
  return new Request(`${base}${GRADEBOOK_AUDIT_WORKSPACE_ROUTE_V1}`, {
    method: 'POST',
    headers: await requestHeaders(options.role, options.origin ?? base),
    body: JSON.stringify(body),
  });
}

async function invoke(request: Request, env: RuntimeEnv): Promise<Response> {
  return await onRequest({ request, env } as never);
}

function batch(id: ImportBatchId, status: ImportBatchResultV1['status'], updatedAt: string): ImportBatchResultV1 {
  return {
    id,
    status,
    receivedAt: instant,
    updatedAt,
    files:
      id === batchA
        ? [
            {
              id: fileA,
              sourceFile: {
                fileName: 'synthetic-audit-http.xlsx',
                extension: 'xlsx',
                reportedMimeType: null,
                sizeBytes: 96,
                lastModifiedAt: null,
              },
              manifest: null,
              status: 'review-required',
              diagnosticIds: [],
            },
          ]
        : [],
    diagnostics: [],
    summary: {
      totalFileCount: id === batchA ? 1 : 0,
      processedFileCount: id === batchA ? 1 : 0,
      approvedFileCount: status === 'approved' ? 1 : 0,
      reviewRequiredFileCount: status === 'review-required' ? 1 : 0,
      rejectedFileCount: 0,
      failedFileCount: 0,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 0,
      criticalErrorCount: 0,
    },
  };
}

function occurrence(): AuditOccurrenceV1 {
  return {
    id: occurrenceId,
    importBatchId: batchA,
    severity: 'warning',
    category: 'synthetic-audit-http',
    message: 'Ocorrência sintética para o bridge de Auditoria.',
    createdAt: instant,
    state: 'open',
    stateHistory: [],
  };
}

async function seedAuditData(): Promise<ReturnType<typeof createGradebookD1RuntimeV1>> {
  const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
  const runtime = createGradebookD1RuntimeV1(localEnv(), authorization, { now: () => instant });
  const unit = runtime.persistenceUnitOfWork();
  await unit.imports.appendImportBatchVersion(context, batch(batchA, 'review-required', '2026-09-01T18:00:00.000Z'), {
    expectedVersion: null,
  });
  await unit.imports.appendImportBatchVersion(context, batch(batchB, 'approved', '2026-09-01T17:00:00.000Z'), {
    expectedVersion: null,
  });
  await unit.audit.appendVersion(
    context,
    { kind: 'occurrence', id: occurrenceId },
    { kind: 'occurrence', value: occurrence() },
    { expectedVersion: null },
  );
  return runtime;
}

describe('Audit Workspace HTTP bridge V1', () => {
  it('rejeita sessão ausente ou sem capability antes de tocar no binding', async () => {
    const prepare = vi.fn(() => {
      throw new Error('synthetic-sensitive-binding');
    });
    const env = localEnv({ prepare, exec: vi.fn() });
    const body = {
      contractVersion: 1,
      academicYearId,
      collection: 'import-batches',
      filters: {},
      page: { limit: 20, cursor: null },
      order: 'updated-at-desc-id-asc',
    };

    const unauthenticated = await invoke(await auditRequest(body), env);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('Cache-Control')).toContain('no-store');
    expect(await unauthenticated.text()).toBe('');

    const forbidden = await invoke(await auditRequest(body, { role: 'PROFESSOR' }), env);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('Cache-Control')).toContain('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('mantém produção fail-closed antes de inspecionar o binding', async () => {
    const prepare = vi.fn(() => {
      throw new Error('production-sensitive-binding');
    });
    const env = {
      ...testEnv,
      RUNTIME_ENVIRONMENT: 'production',
      GRADEBOOK_D1: { prepare, exec: vi.fn() },
    } satisfies RuntimeEnv;
    const response = await invoke(
      await auditRequest(
        {
          contractVersion: 1,
          academicYearId,
          collection: 'import-batches',
          filters: {},
          page: { limit: 20, cursor: null },
          order: 'updated-at-desc-id-asc',
        },
        { role: 'ADMINISTRADOR', base: testEnv.OFFICIAL_ORIGIN, origin: testEnv.OFFICIAL_ORIGIN },
      ),
      env,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('lista com filtros e pagina por cursor opaco através do bridge local autorizado', async () => {
    await seedAuditData();
    const first = await handleAuditWorkspaceRequestV1(
      await auditRequest(
        {
          contractVersion: 1,
          academicYearId,
          collection: 'import-batches',
          filters: {},
          page: { limit: 1, cursor: null },
          order: 'updated-at-desc-id-asc',
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv(),
    );
    if (!first) throw new Error('Expected audit route to handle list request.');
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toContain('no-store');
    const firstPage = (await first.json()) as {
      outcome: string;
      items: readonly { reference: { id: string } }[];
      nextCursor: string | null;
    };
    expect(firstPage.outcome).toBe('items');
    expect(firstPage.items[0]?.reference.id).toBe(batchA);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const second = await invoke(
      await auditRequest(
        {
          contractVersion: 1,
          academicYearId,
          collection: 'import-batches',
          filters: {},
          page: { limit: 1, cursor: firstPage.nextCursor },
          order: 'updated-at-desc-id-asc',
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv(),
    );
    await expect(second.json()).resolves.toMatchObject({
      outcome: 'items',
      items: [{ reference: { id: batchB } }],
      nextCursor: null,
    });

    const filtered = await invoke(
      await auditRequest(
        {
          contractVersion: 1,
          academicYearId,
          collection: 'import-batches',
          filters: { importBatchStatuses: ['approved'] },
          page: { limit: 20, cursor: null },
          order: 'updated-at-desc-id-asc',
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv(),
    );
    await expect(filtered.json()).resolves.toMatchObject({
      outcome: 'items',
      items: [{ reference: { id: batchB }, status: 'approved' }],
    });
  });

  it('expõe detalhe e pendências sem oferecer operação de promoção', async () => {
    await seedAuditData();
    const response = await invoke(
      await auditRequest(
        {
          contractVersion: 1,
          academicYearId,
          reference: { kind: 'import-batch', id: batchA },
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv(),
    );
    await expect(response.json()).resolves.toMatchObject({
      outcome: 'detail',
      detail: {
        kind: 'import-batch',
        pendingItems: [
          { kind: 'import-file-review', importBatchId: batchA, importFileId: fileA },
          { kind: 'audit-occurrence', id: occurrenceId },
        ],
        promotionEligibility: {
          source: 'existing-import-change-plan',
          eligible: null,
          informationalOnly: true,
        },
      },
    });
  });

  it('resolve via CAS usando exclusivamente o oid e o relógio do servidor', async () => {
    const runtime = await seedAuditData();
    const response = await invoke(
      await auditRequest(
        {
          contractVersion: 1,
          academicYearId,
          occurrenceId,
          expectedVersion: 1,
          transition: {
            previousState: 'open',
            nextState: 'resolved',
            justification: 'Resolução sintética pelo bridge.',
          },
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv(),
    );
    await expect(response.json()).resolves.toEqual({
      contractVersion: 1,
      outcome: 'applied',
      reference: { kind: 'audit-occurrence', id: occurrenceId },
      version: 2,
      state: 'resolved',
    });

    const persisted = await runtime
      .persistenceUnitOfWork()
      .audit.getCurrent(context, { kind: 'occurrence', id: occurrenceId });
    if (!persisted || persisted.value.kind !== 'occurrence') throw new Error('Expected persisted occurrence.');
    const last = persisted.value.value.stateHistory.at(-1);
    expect(last).toMatchObject({ actorId: SESSION_OID, nextState: 'resolved' });
    expect(last?.occurredAt).toEqual(expect.any(String));
  });

  it('rejeita claims de ator, instante ou autorização do cliente antes do binding', async () => {
    const prepare = vi.fn(() => {
      throw new Error('synthetic-sensitive-binding');
    });
    const response = await invoke(
      await auditRequest(
        {
          contractVersion: 1,
          academicYearId,
          occurrenceId,
          expectedVersion: 1,
          authorized: true,
          actorId: 'actor:client',
          occurredAt: '2020-01-01T00:00:00.000Z',
          transition: { previousState: 'open', nextState: 'acknowledged' },
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv({ prepare, exec: vi.fn() }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      contractVersion: 1,
      outcome: 'invalid-request',
      currentVersion: null,
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('faz dispatch por Functions e rejeita métodos diferentes de POST', async () => {
    const response = await invoke(
      new Request(`${LOCAL_ORIGIN}${GRADEBOOK_AUDIT_WORKSPACE_ROUTE_V1}`, {
        method: 'GET',
        headers: await requestHeaders('ADMINISTRADOR'),
      }),
      localEnv(undefined),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
});
