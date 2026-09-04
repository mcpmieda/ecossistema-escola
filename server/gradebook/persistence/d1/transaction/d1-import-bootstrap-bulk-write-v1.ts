import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  VersionExpectationV1,
  VersionedWriteResultV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
} from '../../../application/import/import-reconciliation-v1';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';
import {
  GradebookD1AtomicBatchRecorderV1,
  GradebookD1TransactionErrorV1,
} from './d1-batch-promotion-transaction-v1';

const MAX_BULK_JSON_BYTES_V1 = 1_750_000;

type EntityKindV1 = Exclude<AcademicEntityRecordV1['kind'], 'academic-year'>;

type EntityWriteRowV1 = {
  readonly academicYearId: string;
  readonly entityKind: EntityKindV1;
  readonly entityId: string;
  readonly expectedVersion: number | null;
  readonly nextVersion: number;
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
  readonly payloadJson: string;
  readonly recordedAt: string;
};

type AcademicRecordWriteRowV1 = {
  readonly academicYearId: string;
  readonly recordKind: AcademicRecordV1['kind'];
  readonly streamKey: string;
  readonly expectedVersion: number | null;
  readonly nextVersion: number;
  readonly studentId: string;
  readonly enrollmentId: string;
  readonly assessmentComponentRefKind: 'assessment-component' | null;
  readonly assessmentComponentId: string | null;
  readonly teachingAssignmentRefKind: 'teaching-assignment' | null;
  readonly teachingAssignmentId: string | null;
  readonly term: number | null;
  readonly recordId: string;
  readonly authorityMode: 'imported-source' | 'native-engine';
  readonly ruleVersion: string;
  readonly payloadJson: string;
  readonly recordedAt: string;
};

type AssociationWriteRowV1 = {
  readonly academicYearId: string;
  readonly logicalSourceId: string;
  readonly recordKind: AcademicRecordV1['kind'];
  readonly streamKey: string;
  readonly expectedVersion: number | null;
  readonly nextVersion: number;
  readonly state: 'active' | 'inactive';
  readonly sourceManifestId: string;
  readonly sourceManifestVersion: number;
  readonly recordedAt: string;
};

const EMPTY_ENTITY_RELATIONS = {
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

function fail(): never {
  throw new GradebookD1TransactionErrorV1('transaction-failed');
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validExpectation(expectation: VersionExpectationV1): boolean {
  return expectation.expectedVersion === null || positiveInteger(expectation.expectedVersion);
}

function json(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return nonEmpty(serialized) ? serialized : fail();
  } catch (cause) {
    if (cause instanceof GradebookD1TransactionErrorV1) throw cause;
    return fail();
  }
}

function recordedAt(now: () => string): string {
  const value = now();
  return nonEmpty(value) ? value : fail();
}

function chunkRows<T>(rows: readonly T[]): readonly { readonly rows: readonly T[]; readonly json: string }[] {
  if (rows.length === 0) return [];
  const encoder = new TextEncoder();
  const result: { rows: T[]; json: string }[] = [];
  let values: T[] = [];
  let encoded: string[] = [];
  let bytes = 2;

  const flush = () => {
    if (values.length === 0) return;
    result.push({ rows: values, json: `[${encoded.join(',')}]` });
    values = [];
    encoded = [];
    bytes = 2;
  };

  for (const row of rows) {
    const serialized = json(row);
    const rowBytes = encoder.encode(serialized).byteLength;
    if (rowBytes + 2 > MAX_BULK_JSON_BYTES_V1) return fail();
    const separatorBytes = values.length === 0 ? 0 : 1;
    if (bytes + separatorBytes + rowBytes > MAX_BULK_JSON_BYTES_V1) flush();
    values.push(row);
    encoded.push(serialized);
    bytes += (values.length === 1 ? 0 : 1) + rowBytes;
  }
  flush();
  return result;
}

function entityColumns(record: Exclude<AcademicEntityRecordV1, { readonly kind: 'academic-year' }>) {
  switch (record.kind) {
    case 'teacher':
      return {
        ...EMPTY_ENTITY_RELATIONS,
        displayCode: record.value.displayName,
        lifecycleState: record.value.status,
      };
    case 'class-group':
      return { ...EMPTY_ENTITY_RELATIONS, displayCode: record.value.code, lifecycleState: null };
    case 'subject':
      return {
        ...EMPTY_ENTITY_RELATIONS,
        displayCode: record.value.code,
        lifecycleState: record.value.status,
      };
    case 'teaching-assignment':
      return {
        ...EMPTY_ENTITY_RELATIONS,
        teacherRefKind: 'teacher' as const,
        teacherId: record.value.teacherId,
        classGroupRefKind: 'class-group' as const,
        classGroupId: record.value.classGroupId,
        subjectRefKind: 'subject' as const,
        subjectId: record.value.subjectId,
        displayCode: record.value.sourceDisciplineIndex ?? null,
        lifecycleState: record.value.confirmationOrigin,
      };
    case 'student':
      return {
        ...EMPTY_ENTITY_RELATIONS,
        displayCode: record.value.displayName,
        lifecycleState: null,
      };
    case 'enrollment':
      return {
        ...EMPTY_ENTITY_RELATIONS,
        classGroupRefKind: 'class-group' as const,
        classGroupId: record.value.classGroupId,
        studentRefKind: 'student' as const,
        studentId: record.value.studentId,
        displayCode:
          record.value.sourcePosition === undefined ? null : String(record.value.sourcePosition),
        lifecycleState: record.value.position,
      };
    case 'student-status-event':
      return {
        ...EMPTY_ENTITY_RELATIONS,
        enrollmentRefKind: 'enrollment' as const,
        enrollmentId: record.value.enrollmentId,
        displayCode: record.value.sourceReference ?? null,
        lifecycleState: record.value.status,
      };
    case 'assessment-component':
      return {
        ...EMPTY_ENTITY_RELATIONS,
        teachingAssignmentRefKind: 'teaching-assignment' as const,
        teachingAssignmentId: record.value.teachingAssignmentId,
        term: record.value.term,
        displayCode: record.value.name,
        lifecycleState: record.value.applicability.state,
      };
  }
}

function entityWriteRow(
  context: AcademicPersistenceContextV1,
  record: AcademicEntityRecordV1,
  expectation: VersionExpectationV1,
  now: () => string,
): EntityWriteRowV1 {
  if (record.kind === 'academic-year' || !validExpectation(expectation) || !nonEmpty(record.value.id)) {
    return fail();
  }
  switch (record.kind) {
    case 'class-group':
    case 'teaching-assignment':
    case 'enrollment':
    case 'student-status-event':
    case 'assessment-component':
      if (record.value.academicYearId !== context.academicYearId) return fail();
      break;
    case 'teacher':
    case 'subject':
    case 'student':
      break;
  }
  const columns = entityColumns(record);
  return {
    academicYearId: context.academicYearId,
    entityKind: record.kind,
    entityId: record.value.id,
    expectedVersion: expectation.expectedVersion,
    nextVersion: (expectation.expectedVersion ?? 0) + 1,
    ...columns,
    payloadJson: json(record),
    recordedAt: recordedAt(now),
  };
}

function recordStreamColumns(stream: AcademicRecordStreamV1) {
  switch (stream.kind) {
    case 'grade-entry':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentRefKind: 'assessment-component' as const,
        assessmentComponentId: stream.assessmentComponentId,
        teachingAssignmentRefKind: null,
        teachingAssignmentId: null,
        term: null,
      };
    case 'term-result':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentRefKind: null,
        assessmentComponentId: null,
        teachingAssignmentRefKind: 'teaching-assignment' as const,
        teachingAssignmentId: stream.teachingAssignmentId,
        term: stream.term,
      };
    case 'final-recovery':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentRefKind: null,
        assessmentComponentId: null,
        teachingAssignmentRefKind: 'teaching-assignment' as const,
        teachingAssignmentId: stream.teachingAssignmentId,
        term: stream.recoveredTerm,
      };
    case 'annual-result':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentRefKind: null,
        assessmentComponentId: null,
        teachingAssignmentRefKind: 'teaching-assignment' as const,
        teachingAssignmentId: stream.teachingAssignmentId,
        term: null,
      };
  }
}

function academicRecordWriteRow(
  context: AcademicPersistenceContextV1,
  stream: AcademicRecordStreamV1,
  record: AcademicRecordV1,
  expectation: VersionExpectationV1,
  now: () => string,
): AcademicRecordWriteRowV1 {
  if (
    !validExpectation(expectation) ||
    record.kind !== stream.kind ||
    record.value.academicYearId !== context.academicYearId ||
    !nonEmpty(record.value.id) ||
    (record.value.authorityMode !== 'imported-source' && record.value.authorityMode !== 'native-engine') ||
    !nonEmpty(record.value.ruleVersion)
  ) {
    return fail();
  }
  let streamKey: string;
  try {
    streamKey = academicRecordStreamKeyV1(stream);
    if (academicRecordStreamKeyV1(academicRecordStreamForV1(record)) !== streamKey) return fail();
  } catch {
    return fail();
  }
  return {
    academicYearId: context.academicYearId,
    recordKind: stream.kind,
    streamKey,
    expectedVersion: expectation.expectedVersion,
    nextVersion: (expectation.expectedVersion ?? 0) + 1,
    ...recordStreamColumns(stream),
    recordId: record.value.id,
    authorityMode: record.value.authorityMode,
    ruleVersion: record.value.ruleVersion,
    payloadJson: json(record),
    recordedAt: recordedAt(now),
  };
}

function associationWriteRow(
  context: AcademicPersistenceContextV1,
  stream: LogicalSourceRecordAssociationStreamV1,
  value: LogicalSourceRecordAssociationV1,
  expectation: VersionExpectationV1,
  now: () => string,
): AssociationWriteRowV1 {
  if (
    !validExpectation(expectation) ||
    value.academicYearId !== context.academicYearId ||
    value.logicalSourceId !== stream.logicalSourceId ||
    value.stableKey !== stream.stableKey ||
    (value.state !== 'active' && value.state !== 'inactive') ||
    !nonEmpty(value.sourceManifestId) ||
    !positiveInteger(value.sourceManifestVersion)
  ) {
    return fail();
  }
  try {
    if (
      academicRecordStreamKeyV1(stream.academicRecordStream) !== stream.stableKey ||
      academicRecordStreamKeyV1(value.academicRecordStream) !== stream.stableKey
    ) {
      return fail();
    }
  } catch {
    return fail();
  }
  return {
    academicYearId: context.academicYearId,
    logicalSourceId: stream.logicalSourceId,
    recordKind: stream.academicRecordStream.kind,
    streamKey: stream.stableKey,
    expectedVersion: expectation.expectedVersion,
    nextVersion: (expectation.expectedVersion ?? 0) + 1,
    state: value.state,
    sourceManifestId: value.sourceManifestId,
    sourceManifestVersion: value.sourceManifestVersion,
    recordedAt: recordedAt(now),
  };
}

function written<T>(
  value: T,
  expectation: VersionExpectationV1,
  at: string,
): VersionedWriteResultV1<T> {
  return {
    status: 'written',
    record: {
      value,
      version: (expectation.expectedVersion ?? 0) + 1,
      recordedAt: at,
    },
  };
}

const ENTITY_STREAM_INSERT = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.entityKind') AS entity_kind,
    json_extract(value, '$.entityId') AS entity_id,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS next_version,
    json_extract(value, '$.recordedAt') AS recorded_at
  FROM json_each(?)
)
INSERT INTO academic_entity_streams (
  academic_year_id, entity_kind, entity_id, current_version, created_at
)
SELECT academic_year_id, entity_kind, entity_id, next_version, recorded_at FROM requested`;

const ENTITY_STREAM_UPDATE = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.entityKind') AS entity_kind,
    json_extract(value, '$.entityId') AS entity_id,
    CAST(json_extract(value, '$.expectedVersion') AS INTEGER) AS expected_version,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS next_version
  FROM json_each(?)
)
UPDATE academic_entity_streams
SET current_version = (
  SELECT requested.next_version FROM requested
  WHERE requested.academic_year_id = academic_entity_streams.academic_year_id
    AND requested.entity_kind = academic_entity_streams.entity_kind
    AND requested.entity_id = academic_entity_streams.entity_id
)
WHERE EXISTS (
  SELECT 1 FROM requested
  WHERE requested.academic_year_id = academic_entity_streams.academic_year_id
    AND requested.entity_kind = academic_entity_streams.entity_kind
    AND requested.entity_id = academic_entity_streams.entity_id
    AND requested.expected_version = academic_entity_streams.current_version
)`;

const ENTITY_VERSION_INSERT = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.entityKind') AS entity_kind,
    json_extract(value, '$.entityId') AS entity_id,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS version,
    CAST(json_extract(value, '$.expectedVersion') AS INTEGER) AS previous_version,
    json_extract(value, '$.teacherRefKind') AS teacher_ref_kind,
    json_extract(value, '$.teacherId') AS teacher_id,
    json_extract(value, '$.classGroupRefKind') AS class_group_ref_kind,
    json_extract(value, '$.classGroupId') AS class_group_id,
    json_extract(value, '$.subjectRefKind') AS subject_ref_kind,
    json_extract(value, '$.subjectId') AS subject_id,
    json_extract(value, '$.studentRefKind') AS student_ref_kind,
    json_extract(value, '$.studentId') AS student_id,
    json_extract(value, '$.enrollmentRefKind') AS enrollment_ref_kind,
    json_extract(value, '$.enrollmentId') AS enrollment_id,
    json_extract(value, '$.teachingAssignmentRefKind') AS teaching_assignment_ref_kind,
    json_extract(value, '$.teachingAssignmentId') AS teaching_assignment_id,
    CAST(json_extract(value, '$.term') AS INTEGER) AS term,
    json_extract(value, '$.displayCode') AS display_code,
    json_extract(value, '$.lifecycleState') AS lifecycle_state,
    json_extract(value, '$.payloadJson') AS payload_json,
    json_extract(value, '$.recordedAt') AS recorded_at
  FROM json_each(?)
)
INSERT INTO academic_entity_versions (
  academic_year_id, entity_kind, entity_id, version, previous_version,
  teacher_ref_kind, teacher_id, class_group_ref_kind, class_group_id,
  subject_ref_kind, subject_id, student_ref_kind, student_id,
  enrollment_ref_kind, enrollment_id, teaching_assignment_ref_kind, teaching_assignment_id,
  term, display_code, lifecycle_state, payload_json, recorded_at
)
SELECT academic_year_id, entity_kind, entity_id, version, previous_version,
  teacher_ref_kind, teacher_id, class_group_ref_kind, class_group_id,
  subject_ref_kind, subject_id, student_ref_kind, student_id,
  enrollment_ref_kind, enrollment_id, teaching_assignment_ref_kind, teaching_assignment_id,
  term, display_code, lifecycle_state, payload_json, recorded_at
FROM requested`;

const RECORD_STREAM_INSERT = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.recordKind') AS record_kind,
    json_extract(value, '$.streamKey') AS stream_key,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS next_version,
    json_extract(value, '$.studentId') AS student_id,
    json_extract(value, '$.enrollmentId') AS enrollment_id,
    json_extract(value, '$.assessmentComponentRefKind') AS assessment_component_ref_kind,
    json_extract(value, '$.assessmentComponentId') AS assessment_component_id,
    json_extract(value, '$.teachingAssignmentRefKind') AS teaching_assignment_ref_kind,
    json_extract(value, '$.teachingAssignmentId') AS teaching_assignment_id,
    CAST(json_extract(value, '$.term') AS INTEGER) AS term,
    json_extract(value, '$.recordedAt') AS recorded_at
  FROM json_each(?)
)
INSERT INTO academic_record_streams (
  academic_year_id, record_kind, stream_key, current_version,
  student_id, enrollment_id, assessment_component_ref_kind, assessment_component_id,
  teaching_assignment_ref_kind, teaching_assignment_id, term, created_at
)
SELECT academic_year_id, record_kind, stream_key, next_version,
  student_id, enrollment_id, assessment_component_ref_kind, assessment_component_id,
  teaching_assignment_ref_kind, teaching_assignment_id, term, recorded_at
FROM requested`;

const RECORD_STREAM_UPDATE = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.recordKind') AS record_kind,
    json_extract(value, '$.streamKey') AS stream_key,
    CAST(json_extract(value, '$.expectedVersion') AS INTEGER) AS expected_version,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS next_version
  FROM json_each(?)
)
UPDATE academic_record_streams
SET current_version = (
  SELECT requested.next_version FROM requested
  WHERE requested.academic_year_id = academic_record_streams.academic_year_id
    AND requested.record_kind = academic_record_streams.record_kind
    AND requested.stream_key = academic_record_streams.stream_key
)
WHERE EXISTS (
  SELECT 1 FROM requested
  WHERE requested.academic_year_id = academic_record_streams.academic_year_id
    AND requested.record_kind = academic_record_streams.record_kind
    AND requested.stream_key = academic_record_streams.stream_key
    AND requested.expected_version = academic_record_streams.current_version
)`;

const RECORD_VERSION_INSERT = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.recordKind') AS record_kind,
    json_extract(value, '$.streamKey') AS stream_key,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS version,
    CAST(json_extract(value, '$.expectedVersion') AS INTEGER) AS previous_version,
    json_extract(value, '$.recordId') AS record_id,
    json_extract(value, '$.authorityMode') AS authority_mode,
    json_extract(value, '$.ruleVersion') AS rule_version,
    json_extract(value, '$.payloadJson') AS payload_json,
    json_extract(value, '$.recordedAt') AS recorded_at
  FROM json_each(?)
)
INSERT INTO academic_record_versions (
  academic_year_id, record_kind, stream_key, version, previous_version,
  record_id, authority_mode, rule_version, payload_json, recorded_at
)
SELECT academic_year_id, record_kind, stream_key, version, previous_version,
  record_id, authority_mode, rule_version, payload_json, recorded_at
FROM requested`;

const ASSOCIATION_STREAM_INSERT = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.logicalSourceId') AS logical_source_id,
    json_extract(value, '$.recordKind') AS record_kind,
    json_extract(value, '$.streamKey') AS stream_key,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS next_version,
    json_extract(value, '$.state') AS current_state,
    json_extract(value, '$.recordedAt') AS recorded_at
  FROM json_each(?)
)
INSERT INTO logical_source_record_streams (
  academic_year_id, logical_source_id, record_kind, stream_key,
  current_version, current_state, created_at
)
SELECT academic_year_id, logical_source_id, record_kind, stream_key,
  next_version, current_state, recorded_at FROM requested`;

const ASSOCIATION_STREAM_UPDATE = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.logicalSourceId') AS logical_source_id,
    json_extract(value, '$.recordKind') AS record_kind,
    json_extract(value, '$.streamKey') AS stream_key,
    CAST(json_extract(value, '$.expectedVersion') AS INTEGER) AS expected_version,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS next_version,
    json_extract(value, '$.state') AS current_state
  FROM json_each(?)
)
UPDATE logical_source_record_streams
SET current_version = (
      SELECT requested.next_version FROM requested
      WHERE requested.academic_year_id = logical_source_record_streams.academic_year_id
        AND requested.logical_source_id = logical_source_record_streams.logical_source_id
        AND requested.record_kind = logical_source_record_streams.record_kind
        AND requested.stream_key = logical_source_record_streams.stream_key
    ),
    current_state = (
      SELECT requested.current_state FROM requested
      WHERE requested.academic_year_id = logical_source_record_streams.academic_year_id
        AND requested.logical_source_id = logical_source_record_streams.logical_source_id
        AND requested.record_kind = logical_source_record_streams.record_kind
        AND requested.stream_key = logical_source_record_streams.stream_key
    )
WHERE EXISTS (
  SELECT 1 FROM requested
  WHERE requested.academic_year_id = logical_source_record_streams.academic_year_id
    AND requested.logical_source_id = logical_source_record_streams.logical_source_id
    AND requested.record_kind = logical_source_record_streams.record_kind
    AND requested.stream_key = logical_source_record_streams.stream_key
    AND requested.expected_version = logical_source_record_streams.current_version
)`;

const ASSOCIATION_VERSION_INSERT = `WITH requested AS (
  SELECT
    json_extract(value, '$.academicYearId') AS academic_year_id,
    json_extract(value, '$.logicalSourceId') AS logical_source_id,
    json_extract(value, '$.recordKind') AS record_kind,
    json_extract(value, '$.streamKey') AS stream_key,
    CAST(json_extract(value, '$.nextVersion') AS INTEGER) AS version,
    CAST(json_extract(value, '$.expectedVersion') AS INTEGER) AS previous_version,
    json_extract(value, '$.state') AS association_state,
    json_extract(value, '$.sourceManifestId') AS source_manifest_id,
    CAST(json_extract(value, '$.sourceManifestVersion') AS INTEGER) AS source_manifest_version,
    json_extract(value, '$.recordedAt') AS recorded_at
  FROM json_each(?)
)
INSERT INTO logical_source_record_versions (
  academic_year_id, logical_source_id, record_kind, stream_key,
  version, previous_version, association_state,
  source_manifest_id, source_manifest_version, recorded_at
)
SELECT academic_year_id, logical_source_id, record_kind, stream_key,
  version, previous_version, association_state,
  source_manifest_id, source_manifest_version, recorded_at
FROM requested`;

function recordRows<T extends { readonly expectedVersion: number | null }>(input: {
  readonly rows: readonly T[];
  readonly database: D1WriteDatabaseV1;
  readonly recorder: GradebookD1AtomicBatchRecorderV1;
  readonly insertStreamSql: string;
  readonly updateStreamSql: string;
  readonly insertVersionSql: string;
}): void {
  if (input.rows.length === 0) return;
  const newChunks = chunkRows(input.rows.filter((row) => row.expectedVersion === null));
  const changedChunks = chunkRows(input.rows.filter((row) => row.expectedVersion !== null));
  const versionChunks = chunkRows(input.rows);

  for (const chunk of newChunks) {
    input.recorder.recordMutation(
      input.database.prepare(input.insertStreamSql).bind(chunk.json),
      chunk.rows.length,
    );
  }
  for (const chunk of changedChunks) {
    input.recorder.recordMutation(
      input.database.prepare(input.updateStreamSql).bind(chunk.json),
      chunk.rows.length,
    );
  }
  for (const chunk of versionChunks) {
    input.recorder.recordMutation(
      input.database.prepare(input.insertVersionSql).bind(chunk.json),
      chunk.rows.length,
    );
  }
}

class GradebookD1ImportBootstrapBulkWriteV1 {
  private pendingEntities: EntityWriteRowV1[] = [];
  private pendingAcademicRecords: AcademicRecordWriteRowV1[] = [];
  private pendingAssociations: AssociationWriteRowV1[] = [];

  constructor(
    private readonly database: D1WriteDatabaseV1,
    private readonly recorder: GradebookD1AtomicBatchRecorderV1,
    private readonly now: () => string,
  ) {}

  appendEntity(
    context: AcademicPersistenceContextV1,
    record: AcademicEntityRecordV1,
    expectation: VersionExpectationV1,
  ): VersionedWriteResultV1<AcademicEntityRecordV1> {
    const row = entityWriteRow(context, record, expectation, this.now);
    this.pendingEntities.push(row);
    return written(record, expectation, row.recordedAt);
  }

  appendAcademicRecord(
    context: AcademicPersistenceContextV1,
    stream: AcademicRecordStreamV1,
    record: AcademicRecordV1,
    expectation: VersionExpectationV1,
  ): VersionedWriteResultV1<AcademicRecordV1> {
    const row = academicRecordWriteRow(context, stream, record, expectation, this.now);
    this.pendingAcademicRecords.push(row);
    return written(record, expectation, row.recordedAt);
  }

  appendAssociation(
    context: AcademicPersistenceContextV1,
    stream: LogicalSourceRecordAssociationStreamV1,
    value: LogicalSourceRecordAssociationV1,
    expectation: VersionExpectationV1,
  ): VersionedWriteResultV1<LogicalSourceRecordAssociationV1> {
    const row = associationWriteRow(context, stream, value, expectation, this.now);
    this.pendingAssociations.push(row);
    return written(value, expectation, row.recordedAt);
  }

  flushEntities(): void {
    if (this.pendingEntities.length === 0) return;
    const rows = this.pendingEntities;
    this.pendingEntities = [];
    recordRows({
      rows,
      database: this.database,
      recorder: this.recorder,
      insertStreamSql: ENTITY_STREAM_INSERT,
      updateStreamSql: ENTITY_STREAM_UPDATE,
      insertVersionSql: ENTITY_VERSION_INSERT,
    });
  }

  flushAcademicRecords(): void {
    if (this.pendingAcademicRecords.length === 0) return;
    const rows = this.pendingAcademicRecords;
    this.pendingAcademicRecords = [];
    recordRows({
      rows,
      database: this.database,
      recorder: this.recorder,
      insertStreamSql: RECORD_STREAM_INSERT,
      updateStreamSql: RECORD_STREAM_UPDATE,
      insertVersionSql: RECORD_VERSION_INSERT,
    });
  }

  flushAssociations(): void {
    if (this.pendingAssociations.length === 0) return;
    const rows = this.pendingAssociations;
    this.pendingAssociations = [];
    recordRows({
      rows,
      database: this.database,
      recorder: this.recorder,
      insertStreamSql: ASSOCIATION_STREAM_INSERT,
      updateStreamSql: ASSOCIATION_STREAM_UPDATE,
      insertVersionSql: ASSOCIATION_VERSION_INSERT,
    });
  }

  flushAll(): void {
    this.flushEntities();
    this.flushAcademicRecords();
    this.flushAssociations();
  }
}

export function createGradebookD1ImportBootstrapBulkUnitOfWorkV1(input: {
  readonly database: D1WriteDatabaseV1;
  readonly recorder: GradebookD1AtomicBatchRecorderV1;
  readonly baseUnitOfWork: PersistenceUnitOfWorkV2;
  readonly now: () => string;
}): { readonly unitOfWork: PersistenceUnitOfWorkV2; readonly flush: () => void } {
  const bulk = new GradebookD1ImportBootstrapBulkWriteV1(
    input.database,
    input.recorder,
    input.now,
  );
  const base = input.baseUnitOfWork;

  const unitOfWork: PersistenceUnitOfWorkV2 = {
    ...base,
    entities: {
      ...base.entities,
      appendVersion: async (context, record, expectation) =>
        bulk.appendEntity(context, record, expectation),
    },
    imports: {
      ...base.imports,
      appendSourceFileVersion: async (context, value, expectation) => {
        bulk.flushEntities();
        return base.imports.appendSourceFileVersion(context, value, expectation);
      },
      appendImportBatchVersion: async (context, value, expectation) => {
        bulk.flushEntities();
        return base.imports.appendImportBatchVersion(context, value, expectation);
      },
    },
    academicRecords: {
      ...base.academicRecords,
      appendVersion: async (context, stream, record, expectation) => {
        bulk.flushEntities();
        return bulk.appendAcademicRecord(context, stream, record, expectation);
      },
    },
    logicalSourceRecords: {
      ...base.logicalSourceRecords,
      appendVersion: async (context, stream, value, expectation) =>
        bulk.appendAssociation(context, stream, value, expectation),
    },
    logicalSources: {
      get: (context, id) => base.logicalSources.get(context, id),
      listByContext: (context, sourceContext, page) =>
        base.logicalSources.listByContext(context, sourceContext, page),
      createInitial: async (context, source) => {
        bulk.flushEntities();
        return base.logicalSources.createInitial(context, source);
      },
    },
  };

  return { unitOfWork, flush: () => bulk.flushAll() };
}
