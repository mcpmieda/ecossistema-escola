import type {
  TeacherId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV2 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import type {
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  LogicalSourceIdV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
  type LogicalSourceRepositoryV2,
  type LogicalSourceV2,
  type TeacherYearGradebookLogicalSourceContextV2,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

export type LogicalSourceResolutionResultV2 =
  | {
      readonly status: 'new-source';
      readonly source: LogicalSourceV2;
      readonly context: TeacherYearGradebookLogicalSourceContextV2;
    }
  | {
      readonly status: 'existing-source';
      readonly source: LogicalSourceV2;
      readonly context: TeacherYearGradebookLogicalSourceContextV2;
    }
  | {
      readonly status: 'review-required';
      readonly reason:
        | 'missing-teaching-assignment'
        | 'incompatible-academic-year'
        | 'incompatible-teacher-context'
        | 'incompatible-logical-source-context'
        | 'ambiguous-logical-source';
    };

export interface LogicalSourceResolutionDependenciesV2 {
  readonly entities: Pick<AcademicEntityRepositoryV1, 'get'>;
  readonly logicalSources: Pick<LogicalSourceRepositoryV2, 'listByContext'>;
  /** Both values are produced by the authorized server, never copied from the request. */
  readonly createLogicalSourceId: () => LogicalSourceIdV1;
  readonly now: () => string;
}

function compatibleSource(
  source: LogicalSourceV2,
  context: TeacherYearGradebookLogicalSourceContextV2,
): boolean {
  return (
    source.academicYearId === context.academicYearId &&
    source.teacherId === context.teacherId &&
    source.sourceContext === context.kind
  );
}

export async function resolveLogicalSourceForImportV2(
  request: GradebookImportPersistenceRequestV2,
  dependencies: LogicalSourceResolutionDependenciesV2,
): Promise<LogicalSourceResolutionResultV2> {
  const persistenceContext = {
    academicYearId: request.confirmedContext.academicYearId,
  } satisfies AcademicPersistenceContextV1;
  const assignmentIds = [
    ...new Set(request.sheets.map((sheet) => sheet.teachingAssignmentId)),
  ].sort() as TeachingAssignmentId[];
  let teacherId: TeacherId | null = null;

  for (const assignmentId of assignmentIds) {
    const record = await dependencies.entities.get(persistenceContext, {
      kind: 'teaching-assignment',
      id: assignmentId,
    });
    if (!record || record.value.kind !== 'teaching-assignment') {
      return { status: 'review-required', reason: 'missing-teaching-assignment' };
    }
    const assignment = record.value.value;
    if (assignment.academicYearId !== request.confirmedContext.academicYearId) {
      return { status: 'review-required', reason: 'incompatible-academic-year' };
    }
    if (teacherId !== null && teacherId !== assignment.teacherId) {
      return { status: 'review-required', reason: 'incompatible-teacher-context' };
    }
    teacherId = assignment.teacherId;
  }

  if (teacherId === null) {
    return { status: 'review-required', reason: 'missing-teaching-assignment' };
  }
  const sourceContext = {
    kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
    academicYearId: request.confirmedContext.academicYearId,
    teacherId,
  } satisfies TeacherYearGradebookLogicalSourceContextV2;
  // Two rows are sufficient and bounded: 0=create, 1=reuse, 2=ambiguous.
  const candidates = await dependencies.logicalSources.listByContext(
    persistenceContext,
    sourceContext,
    { limit: 2 },
  );
  if (candidates.items.some((source) => !compatibleSource(source, sourceContext))) {
    return { status: 'review-required', reason: 'incompatible-logical-source-context' };
  }
  if (candidates.items.length > 1 || candidates.nextCursor !== null) {
    return { status: 'review-required', reason: 'ambiguous-logical-source' };
  }
  const existing = candidates.items[0];
  if (existing) {
    return { status: 'existing-source', source: existing, context: sourceContext };
  }

  const id = dependencies.createLogicalSourceId();
  const createdAt = dependencies.now();
  if (id.trim().length === 0 || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('invalid server-owned logical source identity');
  }
  return {
    status: 'new-source',
    context: sourceContext,
    source: {
      id,
      academicYearId: sourceContext.academicYearId,
      teacherId: sourceContext.teacherId,
      sourceContext: sourceContext.kind,
      createdAt,
    },
  };
}
