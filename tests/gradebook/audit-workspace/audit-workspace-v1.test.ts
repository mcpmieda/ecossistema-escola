import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUDIT_WORKSPACE_AUTHORIZATION_POLICY_V1,
  AUDIT_WORKSPACE_PROMOTION_POLICY_V1,
  type AuditWorkspaceListRequestV1,
} from '../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import type {
  AuditOccurrenceId,
  AuditOccurrenceV1,
} from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import {
  createAuditWorkspaceV1,
  type AuditWorkspaceDependenciesV1,
} from '../../../server/gradebook/application/audit-workspace/audit-workspace-v1';
import {
  AuditWorkspaceSourceErrorV1,
  type AuditWorkspaceSourceV1,
} from '../../../server/gradebook/application/audit-workspace/audit-workspace-source-v1';
import type { ImportChangePlanV1 } from '../../../server/gradebook/application/import/import-reconciliation-v1';
import { createGradebookD1AuditRepositoryV1 } from '../../../server/gradebook/persistence/d1/audit/d1-audit-repository-v1';
import type {
  AuditPersistenceRepositoryV1,
  ImportPersistenceRepositoryV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  instant,
  openMigratedDatabase,
  seedContext,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const academicYearId = 'academic-year:d1-write:2026' as AcademicYearId;
const batchId = 'import-batch:audit-workspace:detail' as ImportBatchId;
const reviewFileId = 'import-file:audit-workspace:review' as ImportFileId;
const occurrenceId = 'audit-occurrence:audit-workspace:resolution' as AuditOccurrenceId;
const serverActorId = 'actor:audit-workspace:server';
const serverOccurredAt = '2026-09-01T03:00:00.000Z';

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  seedContext(database);
});

afterEach(() => database.raw.close());

const batch: ImportBatchResultV1 = {
  id: batchId,
  status: 'review-required',
  receivedAt: instant,
  updatedAt: instant,
  files: [
    {
      id: reviewFileId,
      sourceFile: {
        fileName: 'synthetic-review.xlsx',
        extension: 'xlsx',
        reportedMimeType: null,
        sizeBytes: 64,
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

function occurrence(): AuditOccurrenceV1 {
  return {
    id: occurrenceId,
    severity: 'warning',
    category: 'synthetic-review',
    message: 'Ocorrência sintética para resolução.',
    createdAt: instant,
    state: 'open',
    stateHistory: [],
  };
}

function source(overrides: Partial<AuditWorkspaceSourceV1> = {}): AuditWorkspaceSourceV1 {
  return {
    async list(request) {
      if (request.collection === 'import-batches') {
        return {
          collection: 'import-batches',
          items: [
            {
              kind: 'import-batch',
              reference: { kind: 'import-batch', id: batchId },
              status: batch.status,
              receivedAt: batch.receivedAt,
              updatedAt: batch.updatedAt,
            },
          ],
          nextCursor: null,
        };
      }
      return { collection: request.collection, items: [], nextCursor: null };
    },
    async listPendingOccurrenceIdsForImportBatch() {
      return [occurrenceId];
    },
    ...overrides,
  } as AuditWorkspaceSourceV1;
}

function imports(
  record: ImportBatchResultV1 | null = batch,
): Pick<ImportPersistenceRepositoryV1, 'getImportBatch'> {
  return {
    async getImportBatch() {
      return record === null ? null : { value: record, version: 3, recordedAt: instant };
    },
  };
}

function unavailableAudit(): Pick<AuditPersistenceRepositoryV1, 'getCurrent' | 'appendVersion'> {
  return {
    async getCurrent() {
      return null;
    },
    async appendVersion() {
      throw new Error('unexpected synthetic append');
    },
  };
}

function dependencies(
  overrides: Partial<AuditWorkspaceDependenciesV1> = {},
): AuditWorkspaceDependenciesV1 {
  return {
    source: source(),
    imports: imports(),
    audit: unavailableAudit(),
    server: {
      isAuthorized: () => true,
      resolutionIdentity: () => ({ actorId: serverActorId, occurredAt: serverOccurredAt }),
    },
    ...overrides,
  };
}

function batchListRequest(): Extract<
  AuditWorkspaceListRequestV1,
  { readonly collection: 'import-batches' }
> {
  return {
    contractVersion: 1,
    academicYearId,
    collection: 'import-batches',
    filters: {},
    page: { limit: 10, cursor: null },
    order: 'updated-at-desc-id-asc',
  };
}

function existingPlan(eligible: boolean): ImportChangePlanV1 {
  return {
    importBatchId: batchId,
    academicYearId,
    expectedBatchVersion: 3,
    status: eligible ? 'ready-for-promotion' : 'review-required',
    files: [],
    items: [],
    counts: {} as ImportChangePlanV1['counts'],
    estimatedWrites: {} as ImportChangePlanV1['estimatedWrites'],
    promotionRequest: {
      importBatchId: batchId,
      approvedImportFileIds: eligible ? [reviewFileId] : [],
      expectedBatchVersion: 3,
    },
    reviewRequiredImportFileIds: eligible ? [] : [reviewFileId],
    blockedImportFileIds: [],
    planningEvidence: {
      writesPerformed: 0,
      repositoriesExposeReadOperationsOnly: true,
      deterministicWithoutClockNetworkOrGlobalEnvironment: true,
    },
  };
}

describe('workspace provider-independent de Auditoria V1', () => {
  it('expõe a política atual, lista sem detalhe implícito e rejeita alegações do cliente', async () => {
    const getImportBatch = vi.fn(imports().getImportBatch);
    const workspace = createAuditWorkspaceV1(dependencies({ imports: { getImportBatch } }));
    expect(workspace.authorizationPolicy).toBe(AUDIT_WORKSPACE_AUTHORIZATION_POLICY_V1);
    await expect(workspace.list(batchListRequest())).resolves.toMatchObject({
      outcome: 'items',
      collection: 'import-batches',
      items: [{ reference: { id: batchId } }],
    });
    await expect(
      workspace.list({
        contractVersion: 1,
        academicYearId,
        collection: 'audit-occurrences',
        filters: {},
        page: { limit: 10, cursor: null },
        order: 'created-at-desc-id-asc',
      }),
    ).resolves.toEqual({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null });
    expect(getImportBatch).not.toHaveBeenCalled();

    const clientClaim = { ...batchListRequest(), authorized: true } as AuditWorkspaceListRequestV1;
    await expect(workspace.list(clientClaim)).resolves.toEqual({
      contractVersion: 1,
      outcome: 'invalid-request',
      items: [],
      nextCursor: null,
    });
  });

  it('não divulga escopo em ausência, falta de autorização ou falha do read-source', async () => {
    const unauthorized = createAuditWorkspaceV1(
      dependencies({
        server: {
          isAuthorized: () => false,
          resolutionIdentity: () => ({ actorId: '', occurredAt: '' }),
        },
      }),
    );
    await expect(unauthorized.list(batchListRequest())).resolves.toEqual({
      contractVersion: 1,
      outcome: 'not-authorized',
      items: [],
      nextCursor: null,
    });
    await expect(
      unauthorized.detail({
        contractVersion: 1,
        academicYearId,
        reference: { kind: 'import-batch', id: batchId },
      }),
    ).resolves.toEqual({ contractVersion: 1, outcome: 'not-authorized', detail: null });

    const absent = createAuditWorkspaceV1(dependencies({ imports: imports(null) }));
    await expect(
      absent.detail({
        contractVersion: 1,
        academicYearId,
        reference: { kind: 'import-batch', id: batchId },
      }),
    ).resolves.toEqual({ contractVersion: 1, outcome: 'not-found', detail: null });

    const failed = createAuditWorkspaceV1(
      dependencies({
        source: source({
          async list() {
            throw new Error('sensitive database detail');
          },
        }),
      }),
    );
    await expect(failed.list(batchListRequest())).resolves.toEqual({
      contractVersion: 1,
      outcome: 'unavailable',
      items: [],
      nextCursor: null,
    });

    const invalidCursor = createAuditWorkspaceV1(
      dependencies({
        source: source({
          async list() {
            throw new AuditWorkspaceSourceErrorV1('invalid-cursor');
          },
        }),
      }),
    );
    await expect(invalidCursor.list(batchListRequest())).resolves.toEqual({
      contractVersion: 1,
      outcome: 'invalid-cursor',
      items: [],
      nextCursor: null,
    });
  });

  it('retorna detalhe explícito, pendências e elegibilidade nula sem plano produzido', async () => {
    const workspace = createAuditWorkspaceV1(dependencies());
    await expect(
      workspace.detail({
        contractVersion: 1,
        academicYearId,
        reference: { kind: 'import-batch', id: batchId },
      }),
    ).resolves.toMatchObject({
      outcome: 'detail',
      detail: {
        version: 3,
        pendingItems: [
          { kind: 'import-file-review', importBatchId: batchId, importFileId: reviewFileId },
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

  it('projeta somente o booleano de um plano existente e não oferece nem chama promoção', async () => {
    const getExistingImportChangePlan = vi.fn(async () => existingPlan(true));
    const forbiddenPlanner = vi.fn();
    const forbiddenExecutor = vi.fn();
    const workspace = createAuditWorkspaceV1(
      dependencies({ existingPlans: { getExistingImportChangePlan } }),
    );
    const result = await workspace.detail({
      contractVersion: 1,
      academicYearId,
      reference: { kind: 'import-batch', id: batchId },
    });

    expect(result).toMatchObject({
      outcome: 'detail',
      detail: { promotionEligibility: { eligible: true, informationalOnly: true } },
    });
    expect(getExistingImportChangePlan).toHaveBeenCalledWith(academicYearId, batchId);
    expect(forbiddenPlanner).not.toHaveBeenCalled();
    expect(forbiddenExecutor).not.toHaveBeenCalled();
    expect(workspace).not.toHaveProperty('promote');
    expect(AUDIT_WORKSPACE_PROMOTION_POLICY_V1).toMatchObject({
      planner: 'planImportReconciliation',
      executor: 'executeImportChangePlan',
      workspacePromotionOperation: 'forbidden',
    });
  });

  it('resolve pela escrita CAS existente usando ator e instante do servidor', async () => {
    const audit = createGradebookD1AuditRepositoryV1(database, { now: () => serverOccurredAt });
    await audit.appendVersion(
      { academicYearId },
      { kind: 'occurrence', id: occurrenceId },
      { kind: 'occurrence', value: occurrence() },
      { expectedVersion: null },
    );
    const workspace = createAuditWorkspaceV1(dependencies({ audit }));
    await expect(
      workspace.detail({
        contractVersion: 1,
        academicYearId,
        reference: { kind: 'audit-occurrence', id: occurrenceId },
      }),
    ).resolves.toMatchObject({
      outcome: 'detail',
      detail: {
        kind: 'audit-occurrence',
        version: 1,
        pendingItems: [{ kind: 'audit-occurrence', id: occurrenceId }],
      },
    });
    const applied = await workspace.resolve({
      contractVersion: 1,
      academicYearId,
      occurrenceId,
      expectedVersion: 1,
      transition: {
        previousState: 'open',
        nextState: 'acknowledged',
        note: 'Conferência sintética.',
      },
    });
    expect(applied).toEqual({
      contractVersion: 1,
      outcome: 'applied',
      reference: { kind: 'audit-occurrence', id: occurrenceId },
      version: 2,
      state: 'acknowledged',
    });
    await expect(
      audit.getCurrent({ academicYearId }, { kind: 'occurrence', id: occurrenceId }),
    ).resolves.toMatchObject({
      version: 2,
      value: {
        value: {
          state: 'acknowledged',
          stateHistory: [{ actorId: serverActorId, occurredAt: serverOccurredAt }],
        },
      },
    });
  });

  it('preserva o version-conflict produzido pelo CAS diante de uma corrida após a leitura', async () => {
    const audit = createGradebookD1AuditRepositoryV1(database, { now: () => serverOccurredAt });
    await audit.appendVersion(
      { academicYearId },
      { kind: 'occurrence', id: occurrenceId },
      { kind: 'occurrence', value: occurrence() },
      { expectedVersion: null },
    );
    let raced = false;
    const appendVersion: AuditPersistenceRepositoryV1['appendVersion'] = async (
      context,
      stream,
      record,
      expectation,
    ) => {
      if (!raced) {
        raced = true;
        const concurrentTransition = {
          previousState: 'open' as const,
          nextState: 'acknowledged' as const,
          actorId: 'actor:audit-workspace:concurrent',
          occurredAt: serverOccurredAt,
        };
        await audit.appendVersion(
          context,
          stream,
          {
            kind: 'occurrence',
            value: {
              ...occurrence(),
              state: 'acknowledged',
              stateHistory: [concurrentTransition],
            },
          },
          { expectedVersion: 1 },
        );
      }
      return audit.appendVersion(context, stream, record, expectation);
    };
    const workspace = createAuditWorkspaceV1(
      dependencies({ audit: { getCurrent: audit.getCurrent.bind(audit), appendVersion } }),
    );

    await expect(
      workspace.resolve({
        contractVersion: 1,
        academicYearId,
        occurrenceId,
        expectedVersion: 1,
        transition: {
          previousState: 'open',
          nextState: 'resolved',
          justification: 'Resolução sintética concorrente.',
        },
      }),
    ).resolves.toEqual({ contractVersion: 1, outcome: 'version-conflict', currentVersion: 2 });
  });

  it('retorna conflito de versão, transição inválida e rejeita ator/instante do cliente', async () => {
    const audit = createGradebookD1AuditRepositoryV1(database, { now: () => serverOccurredAt });
    await audit.appendVersion(
      { academicYearId },
      { kind: 'occurrence', id: occurrenceId },
      { kind: 'occurrence', value: occurrence() },
      { expectedVersion: null },
    );
    const appendVersion = vi.fn(audit.appendVersion.bind(audit));
    const workspace = createAuditWorkspaceV1(
      dependencies({ audit: { getCurrent: audit.getCurrent.bind(audit), appendVersion } }),
    );

    await expect(
      workspace.resolve({
        contractVersion: 1,
        academicYearId,
        occurrenceId,
        expectedVersion: 99,
        transition: {
          previousState: 'open',
          nextState: 'resolved',
          justification: 'Conferência sintética.',
        },
      }),
    ).resolves.toEqual({ contractVersion: 1, outcome: 'version-conflict', currentVersion: 1 });

    await expect(
      workspace.resolve({
        contractVersion: 1,
        academicYearId,
        occurrenceId,
        expectedVersion: 1,
        transition: {
          previousState: 'acknowledged',
          nextState: 'resolved',
          justification: 'Conferência sintética.',
        },
      }),
    ).resolves.toEqual({
      contractVersion: 1,
      outcome: 'invalid-transition',
      currentVersion: null,
    });

    const clientClaim = {
      contractVersion: 1,
      academicYearId,
      occurrenceId,
      expectedVersion: 1,
      actorId: 'actor:client',
      occurredAt: '2020-01-01T00:00:00.000Z',
      transition: {
        previousState: 'open',
        nextState: 'acknowledged',
      },
    } as never;
    await expect(workspace.resolve(clientClaim)).resolves.toEqual({
      contractVersion: 1,
      outcome: 'invalid-request',
      currentVersion: null,
    });
    expect(appendVersion).not.toHaveBeenCalled();
  });
});
