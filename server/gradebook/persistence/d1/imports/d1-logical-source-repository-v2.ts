import type {
  AcademicPersistenceContextV1,
  CursorPageRequestV1,
  CursorPageV1,
  LogicalSourceIdV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
  type LogicalSourceInitialWriteResultV2,
  type LogicalSourceRepositoryV2,
  type LogicalSourceV2,
  type TeacherYearGradebookLogicalSourceContextV2,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';

type LogicalSourceRowV2 = {
  readonly academic_year_id: unknown;
  readonly logical_source_id: unknown;
  readonly teacher_id: unknown;
  readonly source_context: unknown;
  readonly created_at: unknown;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function rowValue(row: LogicalSourceRowV2): LogicalSourceV2 | null {
  if (
    !nonEmpty(row.academic_year_id) ||
    !nonEmpty(row.logical_source_id) ||
    !nonEmpty(row.teacher_id) ||
    row.source_context !== TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2 ||
    !nonEmpty(row.created_at) ||
    Number.isNaN(Date.parse(row.created_at))
  )
    return null;
  return {
    id: row.logical_source_id as LogicalSourceIdV1,
    academicYearId: row.academic_year_id as LogicalSourceV2['academicYearId'],
    teacherId: row.teacher_id as LogicalSourceV2['teacherId'],
    sourceContext: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
    createdAt: row.created_at,
  };
}

function sameSource(left: LogicalSourceV2, right: LogicalSourceV2): boolean {
  return (
    left.id === right.id &&
    left.academicYearId === right.academicYearId &&
    left.teacherId === right.teacherId &&
    left.sourceContext === right.sourceContext
  );
}

export class GradebookD1LogicalSourceRepositoryV2 implements LogicalSourceRepositoryV2 {
  constructor(private readonly database: D1WriteDatabaseV1) {}

  async get(context: AcademicPersistenceContextV1, logicalSourceId: LogicalSourceIdV1) {
    const row = await this.database
      .prepare(
        `SELECT academic_year_id, logical_source_id, teacher_id, source_context, created_at
       FROM logical_sources WHERE academic_year_id = ? AND logical_source_id = ?`,
      )
      .bind(context.academicYearId, logicalSourceId)
      .first<LogicalSourceRowV2>();
    return row ? rowValue(row) : null;
  }

  async listByContext(
    context: AcademicPersistenceContextV1,
    sourceContext: TeacherYearGradebookLogicalSourceContextV2,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<LogicalSourceV2>> {
    if (
      sourceContext.academicYearId !== context.academicYearId ||
      sourceContext.kind !== TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2 ||
      !Number.isInteger(page.limit) ||
      page.limit < 1 ||
      page.limit > 2 ||
      (page.cursor !== undefined && page.cursor !== null)
    )
      throw new TypeError('invalid-logical-source-page');
    const result = await this.database
      .prepare(
        `SELECT academic_year_id, logical_source_id, teacher_id, source_context, created_at
       FROM logical_sources
       WHERE academic_year_id = ? AND teacher_id = ? AND source_context = ?
         AND class_group_id IS NULL AND subject_id IS NULL
       ORDER BY logical_source_id LIMIT ?`,
      )
      .bind(context.academicYearId, sourceContext.teacherId, sourceContext.kind, page.limit + 1)
      .all<LogicalSourceRowV2>();
    const values = result.results.map(rowValue);
    if (values.some((value) => value === null)) throw new TypeError('invalid-logical-source-row');
    return {
      items: values.slice(0, page.limit) as LogicalSourceV2[],
      nextCursor: values.length > page.limit ? 'more' : null,
    };
  }

  async createInitial(
    context: AcademicPersistenceContextV1,
    source: LogicalSourceV2,
  ): Promise<LogicalSourceInitialWriteResultV2> {
    if (
      source.academicYearId !== context.academicYearId ||
      source.sourceContext !== TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2
    ) {
      return { status: 'resolution-conflict', reason: 'incompatible-context' };
    }
    const sameId = await this.get(context, source.id);
    if (sameId)
      return sameSource(sameId, source)
        ? { status: 'already-present', value: sameId }
        : { status: 'resolution-conflict', reason: 'logical-source-id-collision' };
    const compatible = await this.listByContext(
      context,
      {
        kind: source.sourceContext,
        academicYearId: source.academicYearId,
        teacherId: source.teacherId,
      },
      { limit: 1 },
    );
    if (compatible.items.length > 0 || compatible.nextCursor !== null) {
      return { status: 'resolution-conflict', reason: 'compatible-source-created-concurrently' };
    }
    const result = await this.database
      .prepare(
        `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, teacher_ref_kind, teacher_id,
         class_group_ref_kind, class_group_id, subject_ref_kind, subject_id,
         source_context, created_at
       )
       SELECT ?, ?, 'teacher', ?, NULL, NULL, NULL, NULL, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM logical_sources
         WHERE academic_year_id = ? AND teacher_id = ? AND source_context = ?
           AND class_group_id IS NULL AND subject_id IS NULL
       )
       ON CONFLICT (academic_year_id, logical_source_id) DO NOTHING`,
      )
      .bind(
        source.academicYearId,
        source.id,
        source.teacherId,
        source.sourceContext,
        source.createdAt,
        source.academicYearId,
        source.teacherId,
        source.sourceContext,
      )
      .run();
    return result.success === false || result.meta?.changes !== 1
      ? { status: 'resolution-conflict', reason: 'compatible-source-created-concurrently' }
      : { status: 'created', value: source };
  }
}

export function createGradebookD1LogicalSourceRepositoryV2(
  database: D1WriteDatabaseV1,
): LogicalSourceRepositoryV2 {
  return new GradebookD1LogicalSourceRepositoryV2(database);
}
