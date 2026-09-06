import { describe, expect, it, vi } from 'vitest';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import { persistCompactGradebookFileV6 } from '../../../src/features/gradebook/import/import-persistence-client-v6';

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

const breakdown = [
  { category: 'catalog', calls: 1, wallMs: 300.1, sqlMs: 2.5 },
  { category: 'annual-results', calls: 1, wallMs: 280.2, sqlMs: 1.1 },
  { category: 'student-status', calls: 1, wallMs: 250.3, sqlMs: 1 },
  { category: 'assessment-components', calls: 1, wallMs: 310.4, sqlMs: 2 },
  { category: 'academic-records', calls: 4, wallMs: 700.5, sqlMs: 8.2 },
  { category: 'associations', calls: 3, wallMs: 450.6, sqlMs: 6.3 },
  { category: 'source', calls: 3, wallMs: 300.7, sqlMs: 4.4 },
  { category: 'academic-entities', calls: 2, wallMs: 150.8, sqlMs: null },
  { category: 'commit', calls: 1, wallMs: 100.9, sqlMs: 10.7 },
  { category: 'other', calls: 1, wallMs: 31, sqlMs: null },
] as const;

describe('Gradebook V6 direct persistence and explicit benchmark', () => {
  it('uses the direct endpoint without benchmark instrumentation in the official path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(noChangesResponse()), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    try {
      await expect(
        persistCompactGradebookFileV6({ transportVersion: 6 } as GradebookImportPersistenceRequestV6),
      ).resolves.toMatchObject({ transportVersion: 6, state: 'no-changes' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0]?.[1];
      const headers = new Headers(init?.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Gradebook-Benchmark')).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reports sanitized client/server and D1 timing when benchmark is explicitly requested', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(noChangesResponse()), {
        headers: {
          'Content-Type': 'application/json',
          'X-Gradebook-Pre-Service-Ms': '900',
          'X-Gradebook-Auth-Ms': '200',
          'X-Gradebook-Body-Ms': '650',
          'X-Gradebook-Inspect-Ms': '50',
          'X-Gradebook-Server-Ms': '3210',
          'X-Gradebook-D1-Calls': '18',
          'X-Gradebook-D1-First-Calls': '7',
          'X-Gradebook-D1-All-Calls': '10',
          'X-Gradebook-D1-Run-Calls': '0',
          'X-Gradebook-D1-Batch-Calls': '1',
          'X-Gradebook-D1-Exec-Calls': '0',
          'X-Gradebook-D1-Catalog-Snapshot-Calls': '1',
          'X-Gradebook-D1-Wall-Ms': '2875.4',
          'X-Gradebook-D1-Max-Ms': '412.8',
          'X-Gradebook-D1-Sql-Ms': '36.2',
          'X-Gradebook-D1-Breakdown': JSON.stringify(breakdown),
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
        stringifyMs: expect.any(Number),
        requestMs: expect.any(Number),
        responseJsonMs: expect.any(Number),
        serverPreServiceMs: 900,
        serverAuthMs: 200,
        serverBodyMs: 650,
        serverInspectMs: 50,
        serverMs: 3210,
        attempts: 1,
        serverD1Calls: 18,
        serverD1FirstCalls: 7,
        serverD1AllCalls: 10,
        serverD1RunCalls: 0,
        serverD1BatchCalls: 1,
        serverD1ExecCalls: 0,
        serverCatalogSnapshotCalls: 1,
        serverD1WallMs: 2875.4,
        serverD1MaxMs: 412.8,
        serverSqlMs: 36.2,
        serverD1Breakdown: breakdown,
      });
      expect(timing.mock.calls[0]?.[0]).not.toHaveProperty('fileName');
      expect(timing.mock.calls[0]?.[0]).not.toHaveProperty('sha256');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('drops an invalid breakdown instead of logging the raw header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(noChangesResponse()), {
        headers: {
          'Content-Type': 'application/json',
          'X-Gradebook-D1-Calls': '2',
          'X-Gradebook-D1-Breakdown': JSON.stringify([
            { category: 'source', calls: 1, wallMs: 10, sqlMs: 1, query: 'SELECT secret' },
          ]),
        },
      }),
    );
    const timing = vi.fn();
    try {
      await persistCompactGradebookFileV6(
        { transportVersion: 6 } as GradebookImportPersistenceRequestV6,
        undefined,
        timing,
      );
      expect(timing.mock.calls[0]?.[0]).toMatchObject({
        serverD1Calls: 2,
        serverD1Breakdown: null,
      });
      expect(JSON.stringify(timing.mock.calls[0]?.[0])).not.toContain('SELECT secret');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
