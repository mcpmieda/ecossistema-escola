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
import type {
  AuditOccurrenceId,
  AuditOccurrenceV1,
  ReconciliationResultId,
  ReconciliationResultV1,
} from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { EnrollmentId, StudentId } from '../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AssessmentComponentId,
  ComparedGradeValueV1,
  GradeEntryId,
  GradeEntryV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import type { SourceCellEvidenceV1 } from '../../../shared/gradebook-contracts/source/source-contract-v1';
import { academicRecordStreamForV1 } from '../../../server/gradebook/application/import/import-reconciliation-v1';
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
const fileB = 'import-file:audit-http:b' as ImportFileId;
const occurrenceId = 'audit-occurrence:audit-http:a' as AuditOccurrenceId;
const reconciliationId = 'reconciliation-result:audit-http:a' as ReconciliationResultId;
const gradeEntryId = 'grade-entry:audit-http:a' as GradeEntryId;
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

function reviewBatch(): ImportBatchResultV1 {
  return {
    id: batchA,
    status: 'review-required',
    receivedAt: instant,
    updatedAt: '2026-09-01T18:00:00.000Z',
    files: [
      {
        id: fileA,
        sourceFile: {
          fileName: 'synthetic-audit-http-review.xlsx',
          extension: 'xlsx',
          reportedMimeType: null,
          sizeBytes: 96,
          lastModifiedAt: null,
        },
        manifest: null,
        status: 'review-required',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    summary: {
      totalFileCount: 1,
      processedFileCount: 1,
      approvedFileCount: 0,
      reviewRequiredFileCount: 1,
      rejectedFileCount: 0,
      failedFileCount: 0,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 0,
      criticalErrorCount: 0,
    },
  };
}

function approvedBatch(): ImportBatchResultV1 {
  return {
    id: batchB,
    status: 'approved',
    receivedAt: instant,
    updatedAt: '2026-09-01T17:00:00.000Z',
    files: [
      {
        id: fileB,
        sourceFile: {
          fileName: 'synthetic-audit-http-approved.xlsx',
          extension: 'xlsx',
          reportedMimeType: null,
          sizeBytes: 80,
          lastModifiedAt: null,
        },
        manifest: null,
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    summary: {
      totalFileCount: 1,
      processedFileCount: 1,
      approvedFileCount: 1,
      reviewRequiredFileCount: 0,
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

function sourceEvidence(): SourceCellEvidenceV1 {
  return {
    classification: 'manual-positive-number',
    rawValue: 7,
    provenance: {
      fileName: 'synthetic-audit-http.xlsx',
      fileSha256: 'b'.repeat(64),
      sheetName: '6A1º',
      cellAddress: 'R5',
    },
  };
}

function comparedValue(): ComparedGradeValueV1 {
  return {
    imported: { value: { state: 'numeric', value: 7 }, evidence: [sourceEvidence()] },
    calculated: { value: { state: 'numeric', value: 8 } },
  };
}

function gradeEntry(): GradeEntryV1 {
  return {
    id: gradeEntryId,
    academicYearId,
    studentId: 'student:audit-http:a' as StudentId,
    enrollmentId: 'enrollment:audit-http:a' as EnrollmentId,
    assessmentComponentId: 'assessment-component:audit-http:a' as AssessmentComponentId,
    value: comparedValue(),
    authorityMode: 'imported-source',
    ruleVersion: 'source-normalization:synthetic:v2',
    version: 1,
  };
}

function reconciliation(): ReconciliationResultV1 {
  return {
    id: reconciliationId,
    target: { kind: 'grade-entry', id: gradeEntryId },
    value: comparedValue(),
    ruleVersion: 'reconciliation:synthetic:v1',
    status: 'mismatch',
    difference: 1,
    tolerance: 0,
    explanation: 'Divergência sintética para investigação.',
  };
}

async function seedAuditData(): Promise<ReturnType<typeof createGradebookD1RuntimeV1>> {
  const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
  const runtime = createGradebookD1RuntimeV1(localEnv(), authorization, { now: () => instant });
  const unit = runtime.persistenceUnitOfWork();
  await unit.imports.appendImportBatchVersion(context, reviewBatch(), { expectedVersion: null });
  await unit.imports.appendImportBatchVersion(context, approvedBatch(), { expectedVersion: null });
  await unit.audit.appendVersion(
    context,
    { kind: 'occurrence', id: occurrenceId },
    { kind: 'occurrence', value: occurrence() },
    { expectedVersion: null },
  );
  return runtime;
}

async function seedReconciliationData(): Promise<ReturnType<typeof createGradebookD1RuntimeV1>> {
  const runtime = await seedAuditData();
  for (const [kind, id] of [
    ['student', gradeEntry().studentId],
    ['enrollment', gradeEntry().enrollmentId],
    ['assessment-component', gradeEntry().assessmentComponentId],
  ] as const) {
    database.raw
      .prepare(
        `INSERT INTO academic_entity_streams (
           academic_year_id, entity_kind, entity_id, current_version, created_at
         ) VALUES (?, ?, ?, 1, ?)`,
      )
      .run(academicYearId, kind, id, instant);
  }
  const unit = runtime.persistenceUnitOfWork();
  const grade = gradeEntry();
  await unit.academicRecords.appendVersion(
    context,
    academicRecordStreamForV1({ kind: 'grade-entry', value: grade }),
    { kind: 'grade-entry', value: grade },
    { expectedVersion: null },
  );
  await unit.audit.appendVersion(
    context,
    { kind: 'reconciliation', id: reconciliationId },
    { kind: 'reconciliation', value: reconciliation() },
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
    if (!persisted || persisted.value.kind !== 'occurrence')
      throw new Error('Expected persisted occurrence.');
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

  it('projeta investigação fail-closed no mesmo bridge sem divulgar prova ou evidência bruta', async () => {
    await seedReconciliationData();
    const inspected = await invoke(
      await auditRequest(
        {
          contractVersion: 2,
          operation: 'inspect-deterministic-correction',
          academicYearId,
          reconciliationId,
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv(),
    );
    expect(inspected.status).toBe(200);
    expect(inspected.headers.get('Cache-Control')).toContain('no-store');
    const payload = (await inspected.json()) as {
      outcome: string;
      case: {
        reference: string;
        version: number;
        automaticCorrection: { state: string; reason: string };
        pilotFlow: { state: string; authorityMode: string };
      };
    };
    expect(payload).toMatchObject({
      outcome: 'case',
      case: {
        version: 1,
        automaticCorrection: {
          state: 'not-eligible',
          reason: 'root-cause-not-identified',
        },
        pilotFlow: { state: 'stop', authorityMode: 'imported-source' },
      },
    });
    expect(JSON.stringify(payload)).not.toContain('officialEvidenceReferences');
    expect(JSON.stringify(payload)).not.toContain('proof');
    expect(JSON.stringify(payload)).not.toContain('reconciliationInput');

    const blocked = await invoke(
      await auditRequest(
        {
          contractVersion: 2,
          operation: 'execute-deterministic-correction',
          academicYearId,
          caseReference: payload.case.reference,
          expectedVersion: payload.case.version,
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv(),
    );
    await expect(blocked.json()).resolves.toMatchObject({
      outcome: 'not-eligible',
      case: { automaticCorrection: { reason: 'root-cause-not-identified' } },
    });
  });

  it('rejeita mutação, prova e identidade alegadas pelo cliente antes do binding', async () => {
    const prepare = vi.fn(() => {
      throw new Error('synthetic-sensitive-binding');
    });
    const response = await invoke(
      await auditRequest(
        {
          contractVersion: 2,
          operation: 'execute-deterministic-correction',
          academicYearId,
          caseReference: 'deterministic-correction:synthetic',
          expectedVersion: 1,
          proof: { state: 'eligible' },
          patch: { arbitrary: true },
          actorId: 'actor:client',
          occurredAt: '2020-01-01T00:00:00.000Z',
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv({ prepare, exec: vi.fn() }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      contractVersion: 2,
      outcome: 'invalid-request',
      case: null,
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
