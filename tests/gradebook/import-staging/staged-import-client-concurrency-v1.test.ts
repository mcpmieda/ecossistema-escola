import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

const academicYearId = 'academic-year:staged-client-concurrency:2026' as AcademicYearId;

function request(courseCount = 7): GradebookImportPersistenceRequestV6 {
  const term = (courseIndex: number, value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `7A${value}ºD${courseIndex + 1}`,
    assessmentDefinitions: [
      ['R', 10] as const,
      ['S', 10] as const,
    ],
    rows: [
      [
        1,
        {
          R: 5,
          S: 5,
          T: 10,
          AK: value === 3 ? 15 : 10,
          AM: value === 3 ? 25 : 20,
          ...(value === 3 ? { AN: 65 } : {}),
        },
      ] as const,
    ],
  });

  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-client-concurrency.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 1024,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-client-concurrency-v1',
      readAt: '2026-09-05T13:30:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético Concorrência' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [
      {
        classGroupLabel: '7A',
        students: [[1, 'Estudante Sintético Concorrência', 'ATIVO']],
      },
    ],
    courses: Array.from({ length: courseCount }, (_, courseIndex) => ({
      classGroupLabel: '7A',
      subjectLabel: `Componente Sintético ${courseIndex + 1}`,
      disciplineIndex: `D${courseIndex + 1}` as `D${number}`,
      terms: [term(courseIndex, 1), term(courseIndex, 2), term(courseIndex, 3)],
      recovery: null,
    })),
    diagnostics: [],
  };
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('staged import client prepare concurrency', () => {
  it('runs at most three prepares concurrently, reports monotonic progress and finalizes once', async () => {
    let active = 0;
    let maxActive = 0;
    let prepareCalls = 0;
    let finalizeCalls = 0;
    const progress: number[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'https://admin.escolaieda.com');
        const action = url.searchParams.get('action');
        if (action === 'initialize') return response({ state: 'ready', schemaVersion: 6 });
        if (action === 'begin') {
          return response({ state: 'ready', sessionId: 'session:concurrency', chunkCount: 7 });
        }
        if (action === 'prepare') {
          prepareCalls += 1;
          active += 1;
          maxActive = Math.max(maxActive, active);
          const index = Number(url.searchParams.get('chunk'));
          await new Promise((resolve) => setTimeout(resolve, 5 + (2 - (index % 3)) * 5));
          active -= 1;
          return response({ state: 'prepared' });
        }
        if (action === 'finalize') {
          finalizeCalls += 1;
          return response({ transportVersion: 6, state: 'unavailable' });
        }
        throw new Error(`unexpected action: ${String(action)}`);
      }),
    );

    const { persistCompactGradebookFileStagedV1 } = await import(
      '../../../src/features/gradebook/import/import-staging-client-v1'
    );
    const result = await persistCompactGradebookFileStagedV1(request(), (value) => {
      progress.push(value.prepared);
    });

    expect(result).toEqual({ transportVersion: 6, state: 'unavailable' });
    expect(prepareCalls).toBe(7);
    expect(maxActive).toBe(3);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(finalizeCalls).toBe(1);
  });

  it('does not finalize when any prepare in a concurrent batch fails', async () => {
    let prepareCalls = 0;
    let finalizeCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'https://admin.escolaieda.com');
        const action = url.searchParams.get('action');
        if (action === 'initialize') return response({ state: 'ready', schemaVersion: 6 });
        if (action === 'begin') {
          return response({ state: 'ready', sessionId: 'session:failure', chunkCount: 7 });
        }
        if (action === 'prepare') {
          prepareCalls += 1;
          const index = Number(url.searchParams.get('chunk'));
          if (index === 1) return response({ state: 'unavailable' }, 503);
          await new Promise((resolve) => setTimeout(resolve, 5));
          return response({ state: 'prepared' });
        }
        if (action === 'finalize') {
          finalizeCalls += 1;
          return response({ transportVersion: 6, state: 'unavailable' });
        }
        throw new Error(`unexpected action: ${String(action)}`);
      }),
    );

    const { persistCompactGradebookFileStagedV1 } = await import(
      '../../../src/features/gradebook/import/import-staging-client-v1'
    );

    await expect(persistCompactGradebookFileStagedV1(request())).rejects.toThrow(
      'Não foi possível preparar o fragmento 2 de 7.',
    );
    expect(prepareCalls).toBe(3);
    expect(finalizeCalls).toBe(0);
  });
});
