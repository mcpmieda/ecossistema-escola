import { describe, expect, it, vi } from 'vitest';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type { GradebookImportPersistenceBatchRequestV7 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v7';
import { createGradebookImportPersistenceBatchServiceV7 } from '../../../server/gradebook/application/import/import-persistence-batch-service-v7';

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

describe('Gradebook import persistence batch service V7', () => {
  it('replans one fast CAS conflict and one fast operational failure', async () => {
    const responses = [noChanges, conflict, noChanges, unavailable, applied];
    const execute = vi.fn(async () => responses.shift()!);
    let clock = 0;
    const service = createGradebookImportPersistenceBatchServiceV7(
      () => ({ execute }),
      {
        nowMs: () => ++clock,
        sleep: async () => undefined,
      },
    );

    const result = await service.execute(batch(3));
    expect(execute).toHaveBeenCalledTimes(5);
    expect(result.state).toBe('completed');
    if (result.state !== 'completed') throw new Error('unexpected-state');
    expect(result.items.map((item) => item.attempts)).toEqual([1, 2, 2]);
    expect(result.items.map((item) => item.response.state)).toEqual([
      'no-changes',
      'no-changes',
      'applied',
    ]);
    expect(result.items.every((item) => item.failureCategory === 'none')).toBe(true);
  });

  it('stops immediately on authorization loss and leaves following items unexecuted', async () => {
    const responses = [applied, notAuthorized, noChanges];
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

  it('does not retry a slow conflict, avoiding another long blocked request', async () => {
    const execute = vi.fn(async () => conflict);
    const times = [0, 0, 0, 13_001, 13_001, 13_001];
    const service = createGradebookImportPersistenceBatchServiceV7(
      () => ({ execute }),
      {
        nowMs: () => times.shift() ?? 13_001,
        sleep: async () => undefined,
      },
    );

    const result = await service.execute(batch(1));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.state).toBe('partial');
    if (result.state !== 'partial') throw new Error('unexpected-state');
    expect(result.items[0]).toMatchObject({ attempts: 1, failureCategory: 'cas-conflict' });
  });
});
