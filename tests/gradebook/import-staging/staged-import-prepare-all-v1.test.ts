import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import { prepareAllGradebookImportStageChunksV1 } from '../../../server/gradebook/application/import/import-staging-prepare-all-v1';

const academicYearId = 'academic-year:staged-prepare-all:2026' as AcademicYearId;

function request(courseCount = 7, students = 1): GradebookImportPersistenceRequestV6 {
  const term = (courseIndex: number, value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `7A${value}ºD${courseIndex + 1}`,
    assessmentDefinitions: [
      ['R', 10] as const,
      ['S', 10] as const,
    ],
    rows: Array.from({ length: students }, (_, index) => [
      index + 1,
      {
        R: 5,
        S: 5,
        T: 10,
        AK: value === 3 ? 15 : 10,
        AM: value === 3 ? 25 : 20,
        ...(value === 3 ? { AN: 65 } : {}),
      },
    ] as const),
  });

  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-prepare-all.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 1024,
      lastModifiedAt: null,
      sha256: 'b'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-prepare-all-v1',
      readAt: '2026-09-05T14:00:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético Prepare All' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [
      {
        classGroupLabel: '7A',
        students: Array.from({ length: students }, (_, index) => [
          index + 1,
          `Estudante Sintético ${index + 1}`,
          'ATIVO',
        ] as const),
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

describe('staged import prepare-all', () => {
  it('prepares every internal chunk inside one aggregate operation', async () => {
    const indexes: number[] = [];
    const courseLabels: string[] = [];
    const preparer = {
      async prepare(_sessionId: string, chunkIndex: number, chunk: GradebookImportPersistenceRequestV6) {
        indexes.push(chunkIndex);
        expect(chunk.rosters).toHaveLength(1);
        expect(chunk.courses).toHaveLength(1);
        courseLabels.push(chunk.courses[0]!.subjectLabel);
        return {
          state: 'prepared' as const,
          sessionId: 'session:prepare-all',
          chunkIndex,
          preparedCount: indexes.length,
          expectedChunkCount: 7,
        };
      },
    };

    const result = await prepareAllGradebookImportStageChunksV1(
      preparer,
      'session:prepare-all',
      request(),
      7,
    );

    expect(result).toEqual({
      state: 'prepared-all',
      sessionId: 'session:prepare-all',
      preparedCount: 7,
      expectedChunkCount: 7,
    });
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(courseLabels).toEqual(Array.from({ length: 7 }, (_, index) => `Componente Sintético ${index + 1}`));
  });

  it('preserves the 40-position internal bound while aggregating a 41-student course', async () => {
    const rowCounts: number[] = [];
    const preparer = {
      async prepare(_sessionId: string, chunkIndex: number, chunk: GradebookImportPersistenceRequestV6) {
        rowCounts.push(chunk.courses[0]!.terms[0].rows.length);
        return {
          state: chunkIndex === 0 ? 'already-prepared' as const : 'prepared' as const,
          sessionId: 'session:41',
          chunkIndex,
          preparedCount: chunkIndex + 1,
          expectedChunkCount: 2,
        };
      },
    };

    const result = await prepareAllGradebookImportStageChunksV1(preparer, 'session:41', request(1, 41), 2);
    expect(result.state).toBe('prepared-all');
    expect(rowCounts).toEqual([40, 1]);
  });

  it('stops immediately when one internal chunk conflicts', async () => {
    const indexes: number[] = [];
    const preparer = {
      async prepare(_sessionId: string, chunkIndex: number) {
        indexes.push(chunkIndex);
        if (chunkIndex === 1) return { state: 'conflict' as const };
        return {
          state: 'prepared' as const,
          sessionId: 'session:conflict',
          chunkIndex,
          preparedCount: indexes.length,
          expectedChunkCount: 7,
        };
      },
    };

    await expect(
      prepareAllGradebookImportStageChunksV1(preparer, 'session:conflict', request(), 7),
    ).resolves.toEqual({ state: 'conflict' });
    expect(indexes).toEqual([0, 1]);
  });

  it('fails closed when the session chunk count differs from the payload', async () => {
    let calls = 0;
    const preparer = {
      async prepare() {
        calls += 1;
        return { state: 'conflict' as const };
      },
    };

    await expect(
      prepareAllGradebookImportStageChunksV1(preparer, 'session:mismatch', request(), 6),
    ).resolves.toEqual({ state: 'conflict' });
    expect(calls).toBe(0);
  });
});
