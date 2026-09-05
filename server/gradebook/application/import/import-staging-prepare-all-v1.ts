import type {
  GradebookImportCourseV6,
  GradebookImportPersistenceRequestV6,
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
  | Exclude<GradebookImportStagePrepareResultV1, { readonly state: 'prepared' | 'already-prepared' }>;

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

  for (const descriptor of descriptors) {
    const result = await preparer.prepare(
      sessionId,
      descriptor.index,
      chunkRequest(request, descriptor),
    );
    if (result.state !== 'prepared' && result.state !== 'already-prepared') return result;
  }

  return {
    state: 'prepared-all',
    sessionId,
    preparedCount: descriptors.length,
    expectedChunkCount: descriptors.length,
  };
}
