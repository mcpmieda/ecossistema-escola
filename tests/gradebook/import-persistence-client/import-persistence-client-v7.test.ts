import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import {
  GradebookImportBatchTransportErrorV7,
  persistCompactGradebookBatchV7,
} from '../../../src/features/gradebook/import/import-persistence-client-v7';

function request(): GradebookImportPersistenceRequestV6 {
  const term = (value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `6A${value}ºD1`,
    assessmentDefinitions: [
      ['R', 10],
      ['S', 10],
    ] as const,
    rows: [[1, {}]] as const,
  });
  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-v7.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 100,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v7',
      readAt: '2026-09-06T00:00:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Professor Sintético' },
    confirmedContext: { academicYearId: 'academic-year:synthetic-2026' as AcademicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [{ classGroupLabel: '6A', students: [[1, 'Estudante Sintético']] }],
    courses: [
      {
        classGroupLabel: '6A',
        subjectLabel: 'Componente Sintético',
        disciplineIndex: 'D1',
        terms: [term(1), term(2), term(3)],
        recovery: null,
      },
    ],
    diagnostics: [],
  };
}

const noChanges = {
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
  },
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Gradebook import persistence client V7', () => {
  it('returns a valid batch response unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          transportVersion: 7,
          state: 'completed',
          items: [
            {
              index: 0,
              attempts: 1,
              totalMs: 5,
              failureCategory: 'none',
              response: noChanges,
            },
          ],
          pendingFromIndex: null,
          totalMs: 5,
        }),
      ),
    );

    await expect(persistCompactGradebookBatchV7([request()])).resolves.toMatchObject({
      transportVersion: 7,
      state: 'completed',
      totalMs: 5,
    });
  });

  it('reports only safe response metadata when infrastructure returns non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>edge failure</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html; charset=UTF-8' },
        }),
      ),
    );

    let caught: unknown;
    try {
      await persistCompactGradebookBatchV7([request()]);
    } catch (cause) {
      caught = cause;
    }

    expect(caught).toBeInstanceOf(GradebookImportBatchTransportErrorV7);
    expect(caught).toMatchObject({
      status: 502,
      contentKind: 'html',
    });
    expect((caught as Error).message).toContain('HTTP 502');
    expect((caught as Error).message).not.toContain('edge failure');
  });
});

describe('V7 bounded transport failure behavior (#551)', () => {
  it.each([401, 403])(
    'returns authorization state for HTTP %i without parsing HTML',
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(new Response('<html>synthetic</html>', { status }));
      vi.stubGlobal('fetch', fetch);
      await expect(persistCompactGradebookBatchV7([request()])).resolves.toMatchObject({
        state: 'not-authorized',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('does not automatically retry a lost response after a potentially successful commit', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('synthetic lost response'));
    vi.stubGlobal('fetch', fetch);
    await expect(persistCompactGradebookBatchV7([request()])).rejects.toThrow(
      'synthetic lost response',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects incomplete success instead of silently losing unconfirmed files', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            transportVersion: 7,
            state: 'completed',
            items: [],
            pendingFromIndex: null,
            totalMs: 1,
          }),
        ),
    );
    await expect(persistCompactGradebookBatchV7([request()])).rejects.toThrow();
  });

  it('bounds a hung request without replaying it and clears its timer', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('synthetic timeout', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const outcome = persistCompactGradebookBatchV7([request()]).catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not send a request when the caller has already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      persistCompactGradebookBatchV7([request()], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
