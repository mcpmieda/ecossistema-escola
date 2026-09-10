import { describe, expect, it, vi } from 'vitest';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type { GradebookImportPersistenceBatchRequestV7 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v7';
import {
  createGradebookImportPersistenceBatchServiceV7,
  type GradebookImportPersistenceBatchExecutionV7,
} from '../../../server/gradebook/application/import/import-persistence-batch-service-v7';

const request = { transportVersion: 6 } as GradebookImportPersistenceRequestV6;
const batch = (count: number) =>
  ({
    transportVersion: 7,
    operation: 'persist-recognized-batch-v7',
    requests: Array.from({ length: count }, () => request),
  }) as GradebookImportPersistenceBatchRequestV7;

const summary = {
  assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
  assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
  academicRecords: {
    unchanged: 0,
    new: 0,
    changed: 0,
    missingFromNewSource: 0,
    blocked: 0,
  },
  plannedWrites: {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 1,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 1,
  },
  committedWrites: {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 1,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 1,
  },
} as const;

const noChanges = { transportVersion: 6, state: 'no-changes', summary } as const;
const applied = {
  transportVersion: 6,
  state: 'applied',
  summary: {
    ...summary,
    committedWrites: { ...summary.committedWrites, academicRecordVersions: 1, total: 2 },
  },
} as const;
const conflict = { transportVersion: 6, state: 'conflict' } as const;
const unavailable = { transportVersion: 6, state: 'unavailable' } as const;
const notAuthorized = { transportVersion: 6, state: 'not-authorized' } as const;

function execution(
  response: GradebookImportPersistenceBatchExecutionV7['response'],
  retryableOperational = false,
): GradebookImportPersistenceBatchExecutionV7 {
  return { response, retryableOperational };
}

describe('Gradebook import persistence batch service V7', () => {
  it('never retries CAS and retries only an observed transient operational failure', async () => {
    const responses = [
      execution(noChanges),
      execution(conflict),
      execution(unavailable, true),
      execution(applied),
    ];
    const execute = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async () => undefined);
    let clock = 0;
    const service = createGradebookImportPersistenceBatchServiceV7(
      () => ({ execute }),
      {
        nowMs: () => ++clock,
        sleep,
        random: () => 0.5,
      },
    );

    const result = await service.execute(batch(3));
    expect(execute).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledWith(300);
    expect(result.state).toBe('partial');
    if (result.state !== 'partial') throw new Error('unexpected-state');
    expect(result.items.map((item) => item.attempts)).toEqual([1, 1, 2]);
    expect(result.items.map((item) => item.response.state)).toEqual([
      'no-changes',
      'conflict',
      'applied',
    ]);
    expect(result.items.map((item) => item.failureCategory)).toEqual([
      'none',
      'cas-conflict',
      'none',
    ]);
  });

  it('does not retry a generic operational failure without transient evidence', async () => {
    const execute = vi.fn(async () => execution(unavailable, false));
    const sleep = vi.fn(async () => undefined);
    const service = createGradebookImportPersistenceBatchServiceV7(
      () => ({ execute }),
      { sleep },
    );

    const result = await service.execute(batch(1));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.state).toBe('partial');
    if (result.state !== 'partial') throw new Error('unexpected-state');
    expect(result.items[0]).toMatchObject({
      attempts: 1,
      failureCategory: 'operational',
      response: unavailable,
    });
  });

  it('stops immediately on authorization loss and leaves following items unexecuted', async () => {
    const responses = [execution(applied), execution(notAuthorized), execution(noChanges)];
    const execute = vi.fn(async () => responses.shift()!);
    const service = createGradebookImportPersistenceBatchServiceV7(
      () => ({ execute }),
      { sleep: async () => undefined },
    );

    const result = await service.execute(batch(3));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.state).toBe('not-authorized');
    if (result.state !== 'not-authorized') throw new Error('unexpected-state');
    expect(result.pendingFromIndex).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toMatchObject({
      index: 1,
      attempts: 1,
      failureCategory: 'authorization',
    });
  });
});
