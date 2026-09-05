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

interface GradebookImportStageChunkPreparerV1 {
  prepare(
    sessionId: string,
    chunkIndex: number,
    request: GradebookImportPersistenceRequestV6,
  ): Promise<GradebookImportStagePrepareResultV1>;
}

export type GradebookImportStagePrepareAllResultV1 =
  | {
      readonly state: 'prepared-all';
      readonly sessionId: string;
      readonly preparedCount: number;
      readonly expectedChunkCount: number;
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

function timingLog(
  state: string,
  expectedChunkCount: number,
  chunks: readonly { readonly index: number; readonly ms: number }[],
  startedAt: number,
): void {
  console.info(
    '[gradebook-import-timing]',
    JSON.stringify({
      event: 'prepare-all',
      state,
      expectedChunkCount,
      completedChunkCount: chunks.length,
      totalMs: Date.now() - startedAt,
      chunks,
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
  for (const descriptor of descriptors) {
    const chunkStartedAt = Date.now();
    const result = await preparer.prepare(
      sessionId,
      descriptor.index,
      chunkRequest(request, descriptor),
    );
    timings.push({ index: descriptor.index, ms: Date.now() - chunkStartedAt });
    if (
      result.state === 'conflict' ||
      result.state === 'invalid-session' ||
      result.state === 'expired' ||
      result.state === 'rejected'
    ) {
      timingLog(result.state, descriptors.length, timings, startedAt);
      return result;
    }
  }

  timingLog('prepared-all', descriptors.length, timings, startedAt);
  return {
    state: 'prepared-all',
    sessionId,
    preparedCount: descriptors.length,
    expectedChunkCount: descriptors.length,
  };
}
