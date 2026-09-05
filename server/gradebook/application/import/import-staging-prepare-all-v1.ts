import type {
  GradebookImportCourseV6,
  GradebookImportPersistenceRequestV6,
  GradebookImportPersistenceResponseV6,
  GradebookImportTermV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import {
  deriveGradebookImportStageChunksV1,
  type GradebookImportStagePrepareResultV1,
} from './import-staging-service-v1';

export const GRADEBOOK_IMPORT_STAGE_PREPARE_ALL_CONCURRENCY_V1 = 5;

interface GradebookImportStageChunkPreparerV1 {
  prepare(
    sessionId: string,
    chunkIndex: number,
    request: GradebookImportPersistenceRequestV6,
  ): Promise<GradebookImportStagePrepareResultV1>;
}

export interface GradebookImportStagePrepareAllTimingV1 {
  readonly totalMs: number;
  readonly concurrency: number;
  readonly chunks: readonly { readonly index: number; readonly ms: number }[];
}

export type GradebookImportStagePrepareAllResultV1 =
  | {
      readonly state: 'prepared-all';
      readonly sessionId: string;
      readonly preparedCount: number;
      readonly expectedChunkCount: number;
      readonly timing: GradebookImportStagePrepareAllTimingV1;
    }
  | { readonly state: 'conflict' | 'invalid-session' | 'expired' }
  | { readonly state: 'rejected'; readonly response: GradebookImportPersistenceResponseV6 };

function classKey(value: string): string {
  return value.trim().toUpperCase();
}

function selectTerm(
  term: GradebookImportTermV6,
  selected: ReadonlySet<number>,
): GradebookImportTermV6 {
  return { ...term, rows: term.rows.filter((row) => selected.has(row[0])) };
}

function chunkRequest(
  request: GradebookImportPersistenceRequestV6,
  descriptor: ReturnType<typeof deriveGradebookImportStageChunksV1>[number],
): GradebookImportPersistenceRequestV6 {
  const sourceCourse = request.courses[descriptor.courseIndex];
  if (
    !sourceCourse ||
    sourceCourse.classGroupLabel !== descriptor.classGroupLabel ||
    sourceCourse.subjectLabel !== descriptor.subjectLabel ||
    sourceCourse.disciplineIndex !== descriptor.disciplineIndex
  ) {
    throw new TypeError('staged-import-prepare-all-course-mismatch');
  }
  const roster = request.rosters.find(
    (candidate) => classKey(candidate.classGroupLabel) === classKey(sourceCourse.classGroupLabel),
  );
  if (!roster) throw new TypeError('staged-import-prepare-all-roster-missing');

  const selected = new Set(descriptor.positions);
  const course: GradebookImportCourseV6 = {
    ...sourceCourse,
    terms: [
      selectTerm(sourceCourse.terms[0], selected),
      selectTerm(sourceCourse.terms[1], selected),
      selectTerm(sourceCourse.terms[2], selected),
    ],
    recovery: sourceCourse.recovery
      ? {
          ...sourceCourse.recovery,
          rows: sourceCourse.recovery.rows.filter((row) => selected.has(row[0])),
        }
      : null,
  };

  return {
    ...request,
    rosters: [roster],
    courses: [course],
  };
}

function terminal(result: GradebookImportStagePrepareResultV1): boolean {
  return (
    result.state === 'conflict' ||
    result.state === 'invalid-session' ||
    result.state === 'expired' ||
    result.state === 'rejected'
  );
}

function timingValue(
  startedAt: number,
  chunks: readonly { readonly index: number; readonly ms: number }[],
): GradebookImportStagePrepareAllTimingV1 {
  return {
    totalMs: Date.now() - startedAt,
    concurrency: GRADEBOOK_IMPORT_STAGE_PREPARE_ALL_CONCURRENCY_V1,
    chunks: [...chunks].sort((left, right) => left.index - right.index),
  };
}

function timingLog(
  state: string,
  expectedChunkCount: number,
  timing: GradebookImportStagePrepareAllTimingV1,
): void {
  console.info(
    '[gradebook-import-timing]',
    JSON.stringify({
      event: 'prepare-all',
      state,
      expectedChunkCount,
      completedChunkCount: timing.chunks.length,
      totalMs: timing.totalMs,
      concurrency: timing.concurrency,
      chunks: timing.chunks,
    }),
  );
}

export async function prepareAllGradebookImportStageChunksV1(
  preparer: GradebookImportStageChunkPreparerV1,
  sessionId: string,
  request: GradebookImportPersistenceRequestV6,
  expectedChunkCount?: number,
): Promise<GradebookImportStagePrepareAllResultV1> {
  const descriptors = deriveGradebookImportStageChunksV1(request);
  if (expectedChunkCount !== undefined && expectedChunkCount !== descriptors.length) {
    return { state: 'conflict' };
  }

  const startedAt = Date.now();
  const timings: { index: number; ms: number }[] = [];
  for (
    let offset = 0;
    offset < descriptors.length;
    offset += GRADEBOOK_IMPORT_STAGE_PREPARE_ALL_CONCURRENCY_V1
  ) {
    const batch = descriptors.slice(
      offset,
      offset + GRADEBOOK_IMPORT_STAGE_PREPARE_ALL_CONCURRENCY_V1,
    );
    const results = await Promise.all(
      batch.map(async (descriptor) => {
        const chunkStartedAt = Date.now();
        const result = await preparer.prepare(
          sessionId,
          descriptor.index,
          chunkRequest(request, descriptor),
        );
        return {
          result,
          timing: { index: descriptor.index, ms: Date.now() - chunkStartedAt },
        };
      }),
    );
    timings.push(...results.map((value) => value.timing));

    const failed = results.find((value) => terminal(value.result));
    if (failed) {
      const timing = timingValue(startedAt, timings);
      timingLog(failed.result.state, descriptors.length, timing);
      return failed.result;
    }
  }

  const timing = timingValue(startedAt, timings);
  timingLog('prepared-all', descriptors.length, timing);
  return {
    state: 'prepared-all',
    sessionId,
    preparedCount: descriptors.length,
    expectedChunkCount: descriptors.length,
    timing,
  };
}
