import { describe, expect, it, vi } from 'vitest';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import { persistCompactGradebookFileV6 } from '../../../src/features/gradebook/import/import-persistence-client-v6';
import { isGradebookPaidDirectBenchmarkHashV1 } from '../../../src/features/gradebook/import/use-import-batch';

function noChangesResponse() {
  const writes = {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 1,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 1,
  };
  return {
    transportVersion: 6,
    state: 'no-changes',
    summary: {
      assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
      assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
      academicRecords: {
        unchanged: 0,
        new: 0,
        changed: 0,
        missingFromNewSource: 0,
        blocked: 0,
      },
      plannedWrites: writes,
      committedWrites: writes,
    },
  } as const;
}

describe('Gradebook V6 Workers Paid direct benchmark', () => {
  it('requires the explicit hash opt-in flag', () => {
    expect(isGradebookPaidDirectBenchmarkHashV1('#/banco-de-notas')).toBe(false);
    expect(isGradebookPaidDirectBenchmarkHashV1('#/banco-de-notas?area=importacao')).toBe(false);
    expect(isGradebookPaidDirectBenchmarkHashV1('#/banco-de-notas?paidDirect=0')).toBe(false);
    expect(isGradebookPaidDirectBenchmarkHashV1('#/banco-de-notas?paidDirect=1')).toBe(true);
    expect(isGradebookPaidDirectBenchmarkHashV1('#/banco-de-notas?area=importacao&paidDirect=1')).toBe(true);
  });

  it('reports sanitized client/server and D1 timing from the existing direct endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(noChangesResponse()), {
        headers: {
          'Content-Type': 'application/json',
          'X-Gradebook-Server-Ms': '3210',
          'X-Gradebook-D1-Calls': '18',
          'X-Gradebook-D1-First-Calls': '7',
          'X-Gradebook-D1-All-Calls': '10',
          'X-Gradebook-D1-Run-Calls': '0',
          'X-Gradebook-D1-Batch-Calls': '1',
          'X-Gradebook-D1-Exec-Calls': '0',
          'X-Gradebook-D1-Wall-Ms': '2875.4',
          'X-Gradebook-D1-Max-Ms': '412.8',
          'X-Gradebook-D1-Sql-Ms': '36.2',
        },
      }),
    );
    const timing = vi.fn();
    const request = { transportVersion: 6 } as GradebookImportPersistenceRequestV6;

    try {
      await expect(persistCompactGradebookFileV6(request, undefined, timing)).resolves.toMatchObject({
        transportVersion: 6,
        state: 'no-changes',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/gradebook/import-persistence',
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Gradebook-Benchmark': 'paid-direct-v1',
          }),
        }),
      );
      expect(timing).toHaveBeenCalledTimes(1);
      expect(timing.mock.calls[0]?.[0]).toMatchObject({
        version: 1,
        mode: 'paid-direct',
        serverMs: 3210,
        attempts: 1,
        serverD1Calls: 18,
        serverD1FirstCalls: 7,
        serverD1AllCalls: 10,
        serverD1RunCalls: 0,
        serverD1BatchCalls: 1,
        serverD1ExecCalls: 0,
        serverD1WallMs: 2875.4,
        serverD1MaxMs: 412.8,
        serverSqlMs: 36.2,
      });
      expect(timing.mock.calls[0]?.[0]).not.toHaveProperty('fileName');
      expect(timing.mock.calls[0]?.[0]).not.toHaveProperty('sha256');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
