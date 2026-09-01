import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationError } from '../../../../server/auth/roles';
import type { RuntimeEnv } from '../../../../server/env';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  createGradebookD1RuntimeV1,
  GradebookD1RuntimeErrorV1,
} from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import type {
  AuditOccurrenceId,
  AuditOccurrenceV1,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import {
  academicYearId,
  context,
  instant,
  openMigratedDatabase,
  seedContext,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const batchId = 'import-batch:wave-14:audit' as ImportBatchId;
const fileId = 'import-file:wave-14:audit' as ImportFileId;
const occurrenceId = 'audit-occurrence:wave-14:audit' as AuditOccurrenceId;
const actorId = 'actor:wave-14:server';
const resolutionInstant = '2026-09-01T19:40:00.000Z';

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
      id: fileId,
      sourceFile: {
        fileName: 'synthetic-wave-14.xlsx',
        extension: 'xlsx',
        reportedMimeType: null,
        sizeBytes: 128,
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
    importBatchId: batchId,
    severity: 'warning',
    category: 'synthetic-wave-14',
    message: 'Ocorrência sintética da composição da onda 14.',
    createdAt: instant,
    state: 'open',
    stateHistory: [],
  };
}

describe('composição do Audit Workspace no runtime D1 V1', () => {
  it('reutiliza a mesma UoW e o read-source D1 após autorização opaca', async () => {
    const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
    const runtime = createGradebookD1RuntimeV1(
      { RUNTIME_ENVIRONMENT: 'preview', GRADEBOOK_D1: database } as RuntimeEnv,
      authorization,
      { now: () => instant },
    );
    const unit = runtime.persistenceUnitOfWork();

    await unit.imports.appendImportBatchVersion(context, batch, { expectedVersion: null });
    await unit.audit.appendVersion(
      context,
      { kind: 'occurrence', id: occurrenceId },
      { kind: 'occurrence', value: occurrence() },
      { expectedVersion: null },
    );

    const workspace = runtime.auditWorkspace({
      resolutionIdentity: () => ({ actorId, occurredAt: resolutionInstant }),
    });

    await expect(
      workspace.list({
        contractVersion: 1,
        academicYearId,
        collection: 'import-batches',
        filters: {},
        page: { limit: 10, cursor: null },
        order: 'updated-at-desc-id-asc',
      }),
    ).resolves.toMatchObject({
      outcome: 'items',
      academicYearId,
      collection: 'import-batches',
      items: [{ reference: { kind: 'import-batch', id: batchId } }],
    });

    await expect(
      workspace.list({
        contractVersion: 1,
        academicYearId,
        collection: 'audit-occurrences',
        filters: { importBatchId: batchId },
        page: { limit: 10, cursor: null },
        order: 'created-at-desc-id-asc',
      }),
    ).resolves.toMatchObject({
      outcome: 'items',
      collection: 'audit-occurrences',
      items: [{ reference: { kind: 'audit-occurrence', id: occurrenceId } }],
    });

    await expect(
      workspace.resolve({
        contractVersion: 1,
        academicYearId,
        occurrenceId,
        expectedVersion: 1,
        transition: {
          previousState: 'open',
          nextState: 'acknowledged',
          note: 'Conferência sintética da integração.',
        },
      }),
    ).resolves.toEqual({
      contractVersion: 1,
      outcome: 'applied',
      reference: { kind: 'audit-occurrence', id: occurrenceId },
      version: 2,
      state: 'acknowledged',
    });

    await expect(
      unit.audit.getCurrent(context, { kind: 'occurrence', id: occurrenceId }),
    ).resolves.toMatchObject({
      version: 2,
      value: {
        value: {
          state: 'acknowledged',
          stateHistory: [{ actorId, occurredAt: resolutionInstant }],
        },
      },
    });
  });

  it('mantém não autorização e produção bloqueadas antes de inspecionar o binding', () => {
    const unauthorizedPrepare = vi.fn();
    expect(() =>
      createGradebookD1RuntimeV1(
        {
          RUNTIME_ENVIRONMENT: 'preview',
          GRADEBOOK_D1: { prepare: unauthorizedPrepare, exec: vi.fn() },
        } as unknown as RuntimeEnv,
        {} as never,
      ),
    ).toThrow(AuthorizationError);
    expect(unauthorizedPrepare).not.toHaveBeenCalled();

    const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
    const productionPrepare = vi.fn();
    expect(() =>
      createGradebookD1RuntimeV1(
        {
          RUNTIME_ENVIRONMENT: 'production',
          GRADEBOOK_D1: { prepare: productionPrepare, exec: vi.fn() },
        } as unknown as RuntimeEnv,
        authorization,
      ),
    ).toThrow(GradebookD1RuntimeErrorV1);
    expect(productionPrepare).not.toHaveBeenCalled();
  });
});
