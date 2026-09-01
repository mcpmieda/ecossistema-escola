import type {
  AcademicEntityKindV1,
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  CursorPageRequestV1,
  CursorPageV1,
  VersionExpectationV1,
  VersionedRecordV1,
  VersionedWriteResultV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { D1WriteDatabaseV1, D1WriteRunResultV1 } from '../write/d1-write-adapter-v1';

export const GRADEBOOK_D1_ACADEMIC_ENTITY_KINDS_V1 = [
  'teacher',
  'class-group',
  'subject',
  'teaching-assignment',
  'student',
  'enrollment',
  'student-status-event',
  'assessment-component',
] as const satisfies readonly AcademicEntityKindV1[];

export type GradebookD1AcademicEntityKindV1 =
  (typeof GRADEBOOK_D1_ACADEMIC_ENTITY_KINDS_V1)[number];

export const GRADEBOOK_D1_ACADEMIC_ENTITY_DEFAULT_MAXIMUM_PAGE_SIZE_V1 = 100;

export type GradebookD1AcademicEntityRepositoryErrorCodeV1 =
  | 'academic-year-owned-by-context-adapter'
  | 'invalid-options'
  | 'invalid-page-request'
  | 'invalid-cursor'
  | 'invalid-json'
  | 'incompatible-row'
  | 'broken-reference'
  | 'database-read-failed'
  | 'incompatible-write'
  | 'database-write-failed';

const ERROR_MESSAGES: Record<GradebookD1AcademicEntityRepositoryErrorCodeV1, string> = {
  'academic-year-owned-by-context-adapter':
    'O ano acadêmico pertence ao adaptador oficial de contexto.',
  'invalid-options': 'As opções do repositório acadêmico local são inválidas.',
  'invalid-page-request': 'A paginação acadêmica solicitada é inválida.',
  'invalid-cursor': 'O cursor acadêmico informado é inválido.',
  'invalid-json': 'Os dados da entidade acadêmica não puderam ser reconstruídos.',
  'incompatible-row': 'A entidade acadêmica persistida possui formato incompatível.',
  'broken-reference': 'Uma referência da entidade acadêmica persistida está inconsistente.',
  'database-read-failed': 'Não foi possível consultar as entidades acadêmicas persistidas.',
  'incompatible-write': 'A escrita da entidade acadêmica possui formato incompatível.',
  'database-write-failed': 'Não foi possível gravar a entidade acadêmica persistida.',
};

export class GradebookD1AcademicEntityRepositoryErrorV1 extends Error {
  readonly code: GradebookD1AcademicEntityRepositoryErrorCodeV1;

  constructor(code: GradebookD1AcademicEntityRepositoryErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1AcademicEntityRepositoryErrorV1';
    this.code = code;
  }
}

export interface GradebookD1AcademicEntityRepositoryOptionsV1 {
  readonly now?: () => string;
  readonly maximumPageSize?: number;
}

type D1RowV1 = Record<string, unknown>;

interface EntityColumnsV1 {
  readonly teacherRefKind: 'teacher' | null;
  readonly teacherId: string | null;
  readonly classGroupRefKind: 'class-group' | null;
  readonly classGroupId: string | null;
  readonly subjectRefKind: 'subject' | null;
  readonly subjectId: string | null;
  readonly studentRefKind: 'student' | null;
  readonly studentId: string | null;
  readonly enrollmentRefKind: 'enrollment' | null;
  readonly enrollmentId: string | null;
  readonly teachingAssignmentRefKind: 'teaching-assignment' | null;
  readonly teachingAssignmentId: string | null;
  readonly term: number | null;
  readonly displayCode: string | null;
  readonly lifecycleState: string | null;
}

const EMPTY_RELATIONS = {
  teacherRefKind: null,
  teacherId: null,
  classGroupRefKind: null,
  classGroupId: null,
  subjectRefKind: null,
  subjectId: null,
  studentRefKind: null,
  studentId: null,
  enrollmentRefKind: null,
  enrollmentId: null,
  teachingAssignmentRefKind: null,
  teachingAssignmentId: null,
  term: null,
} as const;

function fail(code: GradebookD1AcademicEntityRepositoryErrorCodeV1): never {
  throw new GradebookD1AcademicEntityRepositoryErrorV1(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isSupportedKind(value: unknown): value is GradebookD1AcademicEntityKindV1 {
  return GRADEBOOK_D1_ACADEMIC_ENTITY_KINDS_V1.some((kind) => kind === value);
}

function validEffectivePeriod(value: unknown): boolean {
  return isObject(value) && optionalString(value.startsOn) && optionalString(value.endsOn);
}

function validApplicability(value: unknown): boolean {
  if (!isObject(value)) return false;
  switch (value.state) {
    case 'applicable':
      return true;
    case 'not-applicable':
      return optionalString(value.reason);
    case 'insufficient-data':
      return nonEmptyString(value.reason);
    default:
      return false;
  }
}

function validEntityShape(record: AcademicEntityRecordV1): boolean {
  const value: unknown = record.value;
  if (!isObject(value) || !nonEmptyString(value.id)) return false;

  switch (record.kind) {
    case 'academic-year':
      return false;
    case 'teacher':
      return (
        typeof value.displayName === 'string' &&
        stringArray(value.sourceNames) &&
        (value.status === 'active' || value.status === 'inactive')
      );
    case 'class-group':
      return (
        nonEmptyString(value.academicYearId) &&
        typeof value.code === 'string' &&
        typeof value.grade === 'string' &&
        typeof value.section === 'string' &&
        optionalString(value.shift)
      );
    case 'subject':
      return (
        typeof value.code === 'string' &&
        typeof value.displayName === 'string' &&
        typeof value.shortName === 'string' &&
        (value.status === 'active' || value.status === 'inactive')
      );
    case 'teaching-assignment':
      return (
        nonEmptyString(value.academicYearId) &&
        nonEmptyString(value.teacherId) &&
        nonEmptyString(value.classGroupId) &&
        nonEmptyString(value.subjectId) &&
        optionalString(value.sourceDisciplineIndex) &&
        validEffectivePeriod(value.effectivePeriod) &&
        (value.confirmationOrigin === 'imported-source' ||
          value.confirmationOrigin === 'user-confirmed' ||
          value.confirmationOrigin === 'administrative')
      );
    case 'student':
      return (
        typeof value.displayName === 'string' &&
        stringArray(value.sourceNames) &&
        (value.sourceIdentityMarks === undefined || stringArray(value.sourceIdentityMarks))
      );
    case 'enrollment':
      return (
        nonEmptyString(value.academicYearId) &&
        nonEmptyString(value.studentId) &&
        nonEmptyString(value.classGroupId) &&
        validEffectivePeriod(value.effectivePeriod) &&
        (value.position === 'current' || value.position === 'historical') &&
        (value.sourcePosition === undefined || nonNegativeInteger(value.sourcePosition))
      );
    case 'student-status-event': {
      const transfer = value.transfer;
      const validTransfer =
        transfer === undefined ||
        (isObject(transfer) &&
          optionalString(transfer.originClassGroupCode) &&
          optionalString(transfer.destinationClassGroupCode));
      return (
        nonEmptyString(value.academicYearId) &&
        nonEmptyString(value.enrollmentId) &&
        (value.status === 'active' ||
          value.status === 'transferred' ||
          value.status === 'withdrawn' ||
          value.status === 'deceased' ||
          value.status === 'other') &&
        typeof value.sourceText === 'string' &&
        optionalString(value.occurredOn) &&
        optionalString(value.sourceReference) &&
        optionalString(value.importBatchId) &&
        validTransfer
      );
    }
    case 'assessment-component':
      return (
        nonEmptyString(value.academicYearId) &&
        nonEmptyString(value.teachingAssignmentId) &&
        (value.term === 1 || value.term === 2 || value.term === 3) &&
        (value.type === 'written' ||
          value.type === 'simulation' ||
          value.type === 'qualitative-activity' ||
          value.type === 'parallel-recovery') &&
        typeof value.name === 'string' &&
        finiteNonNegative(value.maximum) &&
        nonNegativeInteger(value.order) &&
        validApplicability(value.applicability)
      );
  }
}

function recordMatchesContext(
  context: AcademicPersistenceContextV1,
  record: AcademicEntityRecordV1,
): boolean {
  if (!nonEmptyString(context.academicYearId) || !validEntityShape(record)) return false;
  switch (record.kind) {
    case 'academic-year':
      return false;
    case 'class-group':
    case 'teaching-assignment':
    case 'enrollment':
    case 'student-status-event':
    case 'assessment-component':
      return record.value.academicYearId === context.academicYearId;
    case 'teacher':
    case 'subject':
    case 'student':
      return true;
  }
}

function entityColumns(record: AcademicEntityRecordV1): EntityColumnsV1 {
  switch (record.kind) {
    case 'academic-year':
      return fail('academic-year-owned-by-context-adapter');
    case 'teacher':
      return {
        ...EMPTY_RELATIONS,
        displayCode: record.value.displayName,
        lifecycleState: record.value.status,
      };
    case 'class-group':
      return {
        ...EMPTY_RELATIONS,
        displayCode: record.value.code,
        lifecycleState: null,
      };
    case 'subject':
      return {
        ...EMPTY_RELATIONS,
        displayCode: record.value.code,
        lifecycleState: record.value.status,
      };
    case 'teaching-assignment':
      return {
        ...EMPTY_RELATIONS,
        teacherRefKind: 'teacher',
        teacherId: record.value.teacherId,
        classGroupRefKind: 'class-group',
        classGroupId: record.value.classGroupId,
        subjectRefKind: 'subject',
        subjectId: record.value.subjectId,
        displayCode: record.value.sourceDisciplineIndex ?? null,
        lifecycleState: record.value.confirmationOrigin,
      };
    case 'student':
      return {
        ...EMPTY_RELATIONS,
        displayCode: record.value.displayName,
        lifecycleState: null,
      };
    case 'enrollment':
      return {
        ...EMPTY_RELATIONS,
        classGroupRefKind: 'class-group',
        classGroupId: record.value.classGroupId,
        studentRefKind: 'student',
        studentId: record.value.studentId,
        displayCode:
          record.value.sourcePosition === undefined ? null : String(record.value.sourcePosition),
        lifecycleState: record.value.position,
      };
    case 'student-status-event':
      return {
        ...EMPTY_RELATIONS,
        enrollmentRefKind: 'enrollment',
        enrollmentId: record.value.enrollmentId,
        displayCode: record.value.sourceReference ?? null,
        lifecycleState: record.value.status,
      };
    case 'assessment-component':
      return {
        ...EMPTY_RELATIONS,
        teachingAssignmentRefKind: 'teaching-assignment',
        teachingAssignmentId: record.value.teachingAssignmentId,
        term: record.value.term,
        displayCode: record.value.name,
        lifecycleState: record.value.applicability.state,
      };
  }
}

function serialize(record: AcademicEntityRecordV1): string {
  try {
    const value = JSON.stringify(record);
    return nonEmptyString(value) ? value : fail('incompatible-write');
  } catch {
    return fail('incompatible-write');
  }
}

function parseRecord(value: unknown): AcademicEntityRecordV1 {
  if (typeof value !== 'string') return fail('incompatible-row');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail('invalid-json');
  }
  if (!isObject(parsed) || !isSupportedKind(parsed.kind) || !isObject(parsed.value)) {
    return fail('incompatible-row');
  }
  const record = parsed as unknown as AcademicEntityRecordV1;
  return validEntityShape(record) ? record : fail('incompatible-row');
}

function rowString(value: unknown): string {
  return nonEmptyString(value) ? value : fail('incompatible-row');
}

function rowVersion(value: unknown): number {
  return positiveInteger(value) ? value : fail('incompatible-row');
}

function normalizedColumnsMatch(row: D1RowV1, columns: EntityColumnsV1): boolean {
  return (
    row.teacher_ref_kind === columns.teacherRefKind &&
    row.teacher_id === columns.teacherId &&
    row.class_group_ref_kind === columns.classGroupRefKind &&
    row.class_group_id === columns.classGroupId &&
    row.subject_ref_kind === columns.subjectRefKind &&
    row.subject_id === columns.subjectId &&
    row.student_ref_kind === columns.studentRefKind &&
    row.student_id === columns.studentId &&
    row.enrollment_ref_kind === columns.enrollmentRefKind &&
    row.enrollment_id === columns.enrollmentId &&
    row.teaching_assignment_ref_kind === columns.teachingAssignmentRefKind &&
    row.teaching_assignment_id === columns.teachingAssignmentId &&
    row.term === columns.term &&
    row.display_code === columns.displayCode &&
    row.lifecycle_state === columns.lifecycleState
  );
}

function mapRow(
  row: D1RowV1,
  context: AcademicPersistenceContextV1,
  expectedKind?: GradebookD1AcademicEntityKindV1,
  expectedId?: string,
): VersionedRecordV1<AcademicEntityRecordV1> {
  const academicYearId = rowString(row.academic_year_id);
  const entityKind = rowString(row.entity_kind);
  const entityId = rowString(row.entity_id);
  const currentVersion = rowVersion(row.current_version);
  const persistedVersion = rowVersion(row.persisted_version);
  if (currentVersion !== persistedVersion) return fail('broken-reference');
  if (
    academicYearId !== context.academicYearId ||
    !isSupportedKind(entityKind) ||
    (expectedKind !== undefined && entityKind !== expectedKind) ||
    (expectedId !== undefined && entityId !== expectedId)
  ) {
    return fail('incompatible-row');
  }

  const record = parseRecord(row.payload_json);
  if (
    record.kind !== entityKind ||
    record.value.id !== entityId ||
    !recordMatchesContext(context, record) ||
    !normalizedColumnsMatch(row, entityColumns(record))
  ) {
    return fail('incompatible-row');
  }

  return {
    value: record,
    version: persistedVersion,
    recordedAt: rowString(row.recorded_at),
  };
}

function changes(result: D1WriteRunResultV1): number {
  const value = result.meta?.changes ?? result.changes;
  if (result.success === false || !nonNegativeInteger(value)) {
    return fail('database-write-failed');
  }
  return value;
}

function encodeCursor(
  context: AcademicPersistenceContextV1,
  kind: GradebookD1AcademicEntityKindV1,
  entityId: string,
): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify([1, context.academicYearId, kind, entityId]),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeCursor(
  cursor: string,
  context: AcademicPersistenceContextV1,
  kind: GradebookD1AcademicEntityKindV1,
): string {
  try {
    if (cursor.length === 0 || cursor.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(cursor)) {
      return fail('invalid-cursor');
    }
    const bytes = new Uint8Array(cursor.length / 2);
    for (let index = 0; index < cursor.length; index += 2) {
      bytes[index / 2] = Number.parseInt(cursor.slice(index, index + 2), 16);
    }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 4 ||
      parsed[0] !== 1 ||
      parsed[1] !== context.academicYearId ||
      parsed[2] !== kind ||
      !nonEmptyString(parsed[3])
    ) {
      return fail('invalid-cursor');
    }
    return parsed[3];
  } catch (cause) {
    if (cause instanceof GradebookD1AcademicEntityRepositoryErrorV1) throw cause;
    return fail('invalid-cursor');
  }
}

const CURRENT_ENTITY_SELECT = `SELECT
  s.academic_year_id,
  s.entity_kind,
  s.entity_id,
  s.current_version,
  v.version AS persisted_version,
  v.teacher_ref_kind,
  v.teacher_id,
  v.class_group_ref_kind,
  v.class_group_id,
  v.subject_ref_kind,
  v.subject_id,
  v.student_ref_kind,
  v.student_id,
  v.enrollment_ref_kind,
  v.enrollment_id,
  v.teaching_assignment_ref_kind,
  v.teaching_assignment_id,
  v.term,
  v.display_code,
  v.lifecycle_state,
  v.payload_json,
  v.recorded_at
FROM academic_entity_streams s
LEFT JOIN academic_entity_versions v
  ON v.academic_year_id = s.academic_year_id
 AND v.entity_kind = s.entity_kind
 AND v.entity_id = s.entity_id
 AND v.version = s.current_version`;

class GradebookD1AcademicEntityRepositoryV1 implements AcademicEntityRepositoryV1 {
  private savepointSequence = 0;

  constructor(
    private readonly database: D1WriteDatabaseV1,
    private readonly now: () => string,
    private readonly maximumPageSize: number,
  ) {}

  private async safelyRead<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1AcademicEntityRepositoryErrorV1) throw cause;
      throw new GradebookD1AcademicEntityRepositoryErrorV1('database-read-failed');
    }
  }

  private async safelyWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1AcademicEntityRepositoryErrorV1) throw cause;
      throw new GradebookD1AcademicEntityRepositoryErrorV1('database-write-failed');
    }
  }

  private async inSavepoint<T>(operation: () => Promise<T>): Promise<T> {
    const name = `gradebook_entities_${String(++this.savepointSequence)}`;
    return this.safelyWrite(async () => {
      await this.database.exec(`SAVEPOINT ${name}`);
      try {
        const result = await operation();
        await this.database.exec(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (cause) {
        try {
          await this.database.exec(`ROLLBACK TO SAVEPOINT ${name}`);
          await this.database.exec(`RELEASE SAVEPOINT ${name}`);
        } catch {
          throw new GradebookD1AcademicEntityRepositoryErrorV1('database-write-failed');
        }
        throw cause;
      }
    });
  }

  private async readCurrentVersion(
    context: AcademicPersistenceContextV1,
    kind: GradebookD1AcademicEntityKindV1,
    entityId: string,
  ): Promise<number | null> {
    const row = await this.database
      .prepare(
        `SELECT current_version FROM academic_entity_streams
         WHERE academic_year_id = ? AND entity_kind = ? AND entity_id = ?`,
      )
      .bind(context.academicYearId, kind, entityId)
      .first<D1RowV1>();
    if (!row) return null;
    return positiveInteger(row.current_version)
      ? row.current_version
      : fail('database-write-failed');
  }

  private recordedAt(): string {
    try {
      const value = this.now();
      return nonEmptyString(value) ? value : fail('incompatible-write');
    } catch (cause) {
      if (cause instanceof GradebookD1AcademicEntityRepositoryErrorV1) throw cause;
      return fail('incompatible-write');
    }
  }

  get(
    context: AcademicPersistenceContextV1,
    reference: AcademicEntityReferenceV1,
  ): Promise<VersionedRecordV1<AcademicEntityRecordV1> | null> {
    if (reference.kind === 'academic-year') {
      return Promise.reject(
        new GradebookD1AcademicEntityRepositoryErrorV1('academic-year-owned-by-context-adapter'),
      );
    }
    if (
      !nonEmptyString(context.academicYearId) ||
      !isSupportedKind(reference.kind) ||
      !nonEmptyString(reference.id)
    ) {
      return Promise.reject(new GradebookD1AcademicEntityRepositoryErrorV1('incompatible-row'));
    }

    return this.safelyRead(async () => {
      const row = await this.database
        .prepare(
          `${CURRENT_ENTITY_SELECT}
           WHERE s.academic_year_id = ? AND s.entity_kind = ? AND s.entity_id = ?`,
        )
        .bind(context.academicYearId, reference.kind, reference.id)
        .first<D1RowV1>();
      if (!row) return null;
      if (row.persisted_version === null) return fail('broken-reference');
      return mapRow(row, context, reference.kind, reference.id);
    });
  }

  async list(
    context: AcademicPersistenceContextV1,
    kind: AcademicEntityKindV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<AcademicEntityRecordV1>>> {
    if (kind === 'academic-year') {
      return Promise.reject(
        new GradebookD1AcademicEntityRepositoryErrorV1('academic-year-owned-by-context-adapter'),
      );
    }
    if (!isSupportedKind(kind)) {
      return Promise.reject(new GradebookD1AcademicEntityRepositoryErrorV1('incompatible-row'));
    }
    if (
      !nonEmptyString(context.academicYearId) ||
      !Number.isInteger(page.limit) ||
      page.limit < 1 ||
      page.limit > this.maximumPageSize
    ) {
      return Promise.reject(new GradebookD1AcademicEntityRepositoryErrorV1('invalid-page-request'));
    }

    let afterEntityId = '';
    if (page.cursor !== undefined && page.cursor !== null) {
      if (typeof page.cursor !== 'string') {
        return Promise.reject(new GradebookD1AcademicEntityRepositoryErrorV1('invalid-cursor'));
      }
      afterEntityId = decodeCursor(page.cursor, context, kind);
    }

    return this.safelyRead(async () => {
      const rows = await this.database
        .prepare(
          `${CURRENT_ENTITY_SELECT}
           WHERE s.academic_year_id = ? AND s.entity_kind = ? AND s.entity_id > ?
           ORDER BY s.entity_id
           LIMIT ?`,
        )
        .bind(context.academicYearId, kind, afterEntityId, page.limit + 1)
        .all<D1RowV1>();
      const selectedRows = rows.results.slice(0, page.limit);
      const items = selectedRows.map((row) => mapRow(row, context, kind));
      const lastRow = selectedRows.at(-1);
      return {
        items,
        nextCursor:
          rows.results.length > page.limit && lastRow
            ? encodeCursor(context, kind, rowString(lastRow.entity_id))
            : null,
      };
    });
  }

  appendVersion(
    context: AcademicPersistenceContextV1,
    record: AcademicEntityRecordV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<AcademicEntityRecordV1>> {
    if (record.kind === 'academic-year') {
      return Promise.reject(
        new GradebookD1AcademicEntityRepositoryErrorV1('academic-year-owned-by-context-adapter'),
      );
    }
    if (
      !isSupportedKind(record.kind) ||
      !recordMatchesContext(context, record) ||
      (expectation.expectedVersion !== null && !positiveInteger(expectation.expectedVersion))
    ) {
      return Promise.reject(new GradebookD1AcademicEntityRepositoryErrorV1('incompatible-write'));
    }

    const payloadJson = serialize(record);
    const columns = entityColumns(record);
    const entityId = record.value.id;
    const recordedAt = this.recordedAt();

    return this.inSavepoint(async () => {
      let rootChanges: number;
      if (expectation.expectedVersion === null) {
        rootChanges = changes(
          await this.database
            .prepare(
              `INSERT INTO academic_entity_streams (
                 academic_year_id, entity_kind, entity_id, current_version, created_at
               ) VALUES (?, ?, ?, 1, ?)
               ON CONFLICT (academic_year_id, entity_kind, entity_id) DO NOTHING`,
            )
            .bind(context.academicYearId, record.kind, entityId, recordedAt)
            .run(),
        );
      } else {
        rootChanges = changes(
          await this.database
            .prepare(
              `UPDATE academic_entity_streams
               SET current_version = ?
               WHERE academic_year_id = ? AND entity_kind = ?
                 AND entity_id = ? AND current_version = ?`,
            )
            .bind(
              expectation.expectedVersion + 1,
              context.academicYearId,
              record.kind,
              entityId,
              expectation.expectedVersion,
            )
            .run(),
        );
      }

      if (rootChanges !== 1) {
        const currentVersion = await this.readCurrentVersion(context, record.kind, entityId);
        return { status: 'version-conflict', currentVersion };
      }

      const version = (expectation.expectedVersion ?? 0) + 1;
      const historyChanges = changes(
        await this.database
          .prepare(
            `INSERT INTO academic_entity_versions (
               academic_year_id, entity_kind, entity_id, version, previous_version,
               teacher_ref_kind, teacher_id, class_group_ref_kind, class_group_id,
               subject_ref_kind, subject_id, student_ref_kind, student_id,
               enrollment_ref_kind, enrollment_id,
               teaching_assignment_ref_kind, teaching_assignment_id,
               term, display_code, lifecycle_state, payload_json, recorded_at
             ) VALUES (
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             )`,
          )
          .bind(
            context.academicYearId,
            record.kind,
            entityId,
            version,
            expectation.expectedVersion,
            columns.teacherRefKind,
            columns.teacherId,
            columns.classGroupRefKind,
            columns.classGroupId,
            columns.subjectRefKind,
            columns.subjectId,
            columns.studentRefKind,
            columns.studentId,
            columns.enrollmentRefKind,
            columns.enrollmentId,
            columns.teachingAssignmentRefKind,
            columns.teachingAssignmentId,
            columns.term,
            columns.displayCode,
            columns.lifecycleState,
            payloadJson,
            recordedAt,
          )
          .run(),
      );
      if (historyChanges !== 1) return fail('database-write-failed');

      return {
        status: 'written',
        record: { value: record, version, recordedAt },
      };
    });
  }
}

export function createGradebookD1AcademicEntityRepositoryV1(
  database: D1WriteDatabaseV1,
  options: GradebookD1AcademicEntityRepositoryOptionsV1 = {},
): AcademicEntityRepositoryV1 {
  const maximumPageSize =
    options.maximumPageSize ?? GRADEBOOK_D1_ACADEMIC_ENTITY_DEFAULT_MAXIMUM_PAGE_SIZE_V1;
  if (
    !positiveInteger(maximumPageSize) ||
    maximumPageSize > GRADEBOOK_D1_ACADEMIC_ENTITY_DEFAULT_MAXIMUM_PAGE_SIZE_V1 ||
    (options.now !== undefined && typeof options.now !== 'function')
  ) {
    return fail('invalid-options');
  }
  return new GradebookD1AcademicEntityRepositoryV1(
    database,
    options.now ?? (() => new Date().toISOString()),
    maximumPageSize,
  );
}
