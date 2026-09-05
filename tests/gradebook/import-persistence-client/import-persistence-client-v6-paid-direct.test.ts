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

  it('reports sanitized client/server wall timing from the existing direct endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(noChangesResponse()), {
        headers: {
          'Content-Type': 'application/json',
          'X-Gradebook-Server-Ms': '3210',
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
        }),
      );
      expect(timing).toHaveBeenCalledTimes(1);
      expect(timing.mock.calls[0]?.[0]).toMatchObject({
        version: 1,
        mode: 'paid-direct',
        serverMs: 3210,
        attempts: 1,
      });
      expect(timing.mock.calls[0]?.[0]).not.toHaveProperty('fileName');
      expect(timing.mock.calls[0]?.[0]).not.toHaveProperty('sha256');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
