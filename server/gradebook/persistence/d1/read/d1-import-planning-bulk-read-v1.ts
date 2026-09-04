import type {
  AcademicEntityRecordV1,
  AcademicEntityReferenceV1,
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
} from '../../../application/import/import-reconciliation-v1';
import {
  GradebookD1ReadErrorV1,
  type D1ReadDatabaseV1,
} from './d1-read-adapter-v1';

type D1RowV1 = Record<string, unknown>;

type CurrentAcademicEntityV1 = VersionedRecordV1<AcademicEntityRecordV1> | null;
type CurrentAcademicRecordV1 = VersionedRecordV1<AcademicRecordV1> | null;
type CurrentAssociationV1 = VersionedRecordV1<LogicalSourceRecordAssociationV1> | null;

export interface GradebookD1ImportPlanningBulkReadAdapterV1 {
  readonly entities: {
    getMany(
      context: AcademicPersistenceContextV1,
      references: readonly AcademicEntityReferenceV1[],
    ): Promise<readonly CurrentAcademicEntityV1[]>;
  };
  readonly academicRecords: {
    getCurrentMany(
      context: AcademicPersistenceContextV1,
      streams: readonly AcademicRecordStreamV1[],
    ): Promise<readonly CurrentAcademicRecordV1[]>;
  };
  readonly logicalSourceRecords: {
    getCurrentMany(
      context: AcademicPersistenceContextV1,
      streams: readonly LogicalSourceRecordAssociationStreamV1[],
    ): Promise<readonly CurrentAssociationV1[]>;
  };
}

function fail(code: 'database-read-failed' | 'invalid-json' | 'incompatible-row' | 'broken-reference'): never {
  throw new GradebookD1ReadErrorV1(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return fail('incompatible-row');
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fail('incompatible-row');
  }
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return fail('incompatible-row');
  }
  return value;
}

function academicTerm(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) return fail('incompatible-row');
  return value;
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return fail('incompatible-row');
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : fail('incompatible-row');
  } catch (cause) {
    if (cause instanceof GradebookD1ReadErrorV1) throw cause;
    return fail('invalid-json');
  }
}

function serializeBulk(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' && serialized.length > 0
      ? serialized
      : fail('incompatible-row');
  } catch (cause) {
    if (cause instanceof GradebookD1ReadErrorV1) throw cause;
    return fail('incompatible-row');
  }
}

function requestIndex(row: D1RowV1, expected: number): void {
  if (nonNegativeInteger(row.request_index) !== expected) return fail('incompatible-row');
}

function validAssessmentMaximum(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  if (!isObject(value) || typeof value.state !== 'string') return false;
  if (value.state === 'not-defined') return Object.keys(value).length === 1;
  return (
    value.state === 'defined' &&
    Object.keys(value).length === 2 &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    value.value > 0
  );
}

function validApplicability(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  if (value.state === 'applicable') return true;
  if (value.state === 'not-applicable') {
    return value.reason === undefined || typeof value.reason === 'string';
  }
  return value.state === 'insufficient-data' && typeof value.reason === 'string' && value.reason.length > 0;
}

function assessmentComponentRecord(
  row: D1RowV1,
  context: AcademicPersistenceContextV1,
  expectedId: string,
): VersionedRecordV1<AcademicEntityRecordV1> {
  const currentVersion = positiveInteger(row.current_version);
  const persistedVersion = positiveInteger(row.persisted_version);
  if (currentVersion !== persistedVersion) return fail('broken-reference');
  if (
    requiredString(row.academic_year_id) !== context.academicYearId ||
    row.entity_kind !== 'assessment-component' ||
    requiredString(row.entity_id) !== expectedId
  ) {
    return fail('incompatible-row');
  }

  const parsed = parsePayload(row.payload_json);
  if (parsed.kind !== 'assessment-component' || !isObject(parsed.value)) {
    return fail('incompatible-row');
  }
  const value = parsed.value;
  if (
    value.id !== expectedId ||
    value.academicYearId !== context.academicYearId ||
    typeof value.teachingAssignmentId !== 'string' ||
    value.teachingAssignmentId.length === 0 ||
    (value.term !== 1 && value.term !== 2 && value.term !== 3) ||
    ![
      'written',
      'simulation',
      'quantitative-assessment',
      'qualitative-activity',
      'parallel-recovery',
    ].includes(String(value.type)) ||
    typeof value.name !== 'string' ||
    !validAssessmentMaximum(value.maximum) ||
    typeof value.order !== 'number' ||
    !Number.isInteger(value.order) ||
    value.order < 0 ||
    !validApplicability(value.applicability)
  ) {
    return fail('incompatible-row');
  }

  if (
    row.teacher_ref_kind !== null ||
    row.teacher_id !== null ||
    row.class_group_ref_kind !== null ||
    row.class_group_id !== null ||
    row.subject_ref_kind !== null ||
    row.subject_id !== null ||
    row.student_ref_kind !== null ||
    row.student_id !== null ||
    row.enrollment_ref_kind !== null ||
    row.enrollment_id !== null ||
    row.teaching_assignment_ref_kind !== 'teaching-assignment' ||
    row.teaching_assignment_id !== value.teachingAssignmentId ||
    row.term !== value.term ||
    row.display_code !== value.name ||
    row.lifecycle_state !== value.applicability.state
  ) {
    return fail('incompatible-row');
  }

  return {
    value: parsed as unknown as AcademicEntityRecordV1,
    version: persistedVersion,
    recordedAt: requiredString(row.recorded_at),
  };
}

function validateAcademicRecordShape(value: Record<string, unknown>): AcademicRecordV1 {
  if (!isObject(value.value)) return fail('incompatible-row');
  const record = value.value;
  requiredString(record.id);
  requiredString(record.academicYearId);
  requiredString(record.studentId);
  requiredString(record.enrollmentId);
  requiredString(record.authorityMode);
  requiredString(record.ruleVersion);

  switch (value.kind) {
    case 'grade-entry':
      requiredString(record.assessmentComponentId);
      break;
    case 'term-result':
      requiredString(record.teachingAssignmentId);
      academicTerm(record.term);
      break;
    case 'final-recovery':
      requiredString(record.teachingAssignmentId);
      academicTerm(record.recoveredTerm);
      break;
    case 'annual-result':
      requiredString(record.teachingAssignmentId);
      break;
    default:
      return fail('incompatible-row');
  }
  return value as unknown as AcademicRecordV1;
}

function academicRecord(
  row: D1RowV1,
  context: AcademicPersistenceContextV1,
  requestedStream: AcademicRecordStreamV1,
): VersionedRecordV1<AcademicRecordV1> {
  const currentVersion = positiveInteger(row.current_version);
  const persistedVersion = positiveInteger(row.persisted_version);
  if (currentVersion !== persistedVersion) return fail('broken-reference');

  const record = validateAcademicRecordShape(parsePayload(row.payload_json));
  if (record.kind !== row.persisted_record_kind || record.kind !== requestedStream.kind) {
    return fail('incompatible-row');
  }
  if (
    record.value.academicYearId !== context.academicYearId ||
    record.value.id !== requiredString(row.record_id) ||
    record.value.authorityMode !== row.authority_mode ||
    record.value.ruleVersion !== row.rule_version
  ) {
    return fail('incompatible-row');
  }

  const persistedKey = academicRecordStreamKeyV1(academicRecordStreamForV1(record));
  if (
    persistedKey !== requiredString(row.stream_key) ||
    persistedKey !== academicRecordStreamKeyV1(requestedStream)
  ) {
    return fail('incompatible-row');
  }

  return {
    value: record,
    version: persistedVersion,
    recordedAt: requiredString(row.recorded_at),
  };
}

function associationState(value: unknown): LogicalSourceRecordAssociationV1['state'] {
  if (value !== 'active' && value !== 'inactive') return fail('incompatible-row');
  return value;
}

function catalogStream(row: D1RowV1): AcademicRecordStreamV1 {
  if (
    row.linked_record_kind === null ||
    row.linked_stream_key === null ||
    row.linked_record_kind !== row.association_record_kind ||
    row.linked_stream_key !== row.association_stream_key
  ) {
    return fail('broken-reference');
  }
  const studentId = requiredString(row.student_id) as AcademicRecordStreamV1['studentId'];
  const enrollmentId = requiredString(row.enrollment_id) as AcademicRecordStreamV1['enrollmentId'];
  let stream: AcademicRecordStreamV1;
  switch (row.linked_record_kind) {
    case 'grade-entry':
      stream = {
        kind: 'grade-entry',
        studentId,
        enrollmentId,
        assessmentComponentId: requiredString(
          row.assessment_component_id,
        ) as Extract<AcademicRecordStreamV1, { readonly kind: 'grade-entry' }>['assessmentComponentId'],
      };
      break;
    case 'term-result':
      stream = {
        kind: 'term-result',
        studentId,
        enrollmentId,
        teachingAssignmentId: requiredString(
          row.teaching_assignment_id,
        ) as Extract<AcademicRecordStreamV1, { readonly kind: 'term-result' }>['teachingAssignmentId'],
        term: academicTerm(row.term),
      };
      break;
    case 'final-recovery':
      stream = {
        kind: 'final-recovery',
        studentId,
        enrollmentId,
        teachingAssignmentId: requiredString(
          row.teaching_assignment_id,
        ) as Extract<AcademicRecordStreamV1, { readonly kind: 'final-recovery' }>['teachingAssignmentId'],
        recoveredTerm: academicTerm(row.term),
      };
      break;
    case 'annual-result':
      if (row.term !== null) return fail('incompatible-row');
      stream = {
        kind: 'annual-result',
        studentId,
        enrollmentId,
        teachingAssignmentId: requiredString(
          row.teaching_assignment_id,
        ) as Extract<AcademicRecordStreamV1, { readonly kind: 'annual-result' }>['teachingAssignmentId'],
      };
      break;
    default:
      return fail('incompatible-row');
  }
  if (academicRecordStreamKeyV1(stream) !== row.association_stream_key) {
    return fail('incompatible-row');
  }
  return stream;
}

function association(
  row: D1RowV1,
  context: AcademicPersistenceContextV1,
  requestedStream: LogicalSourceRecordAssociationStreamV1,
): VersionedRecordV1<LogicalSourceRecordAssociationV1> {
  const currentVersion = positiveInteger(row.current_version);
  const persistedVersion = positiveInteger(row.persisted_version);
  if (currentVersion !== persistedVersion) return fail('broken-reference');
  const persistedState = associationState(row.association_state);
  if (associationState(row.current_state) !== persistedState) return fail('broken-reference');

  const logicalSourceId = requiredString(row.logical_source_id) as LogicalSourceIdV1;
  const academicRecordStream = catalogStream(row);
  const stableKey = academicRecordStreamKeyV1(academicRecordStream);
  if (
    logicalSourceId !== requestedStream.logicalSourceId ||
    stableKey !== requestedStream.stableKey ||
    academicRecordStreamKeyV1(requestedStream.academicRecordStream) !== stableKey
  ) {
    return fail('incompatible-row');
  }

  return {
    value: {
      academicYearId: context.academicYearId,
      logicalSourceId,
      academicRecordStream,
      stableKey,
      state: persistedState,
      sourceManifestId: requiredString(
        row.source_manifest_id,
      ) as LogicalSourceRecordAssociationV1['sourceManifestId'],
      sourceManifestVersion: positiveInteger(row.source_manifest_version),
    },
    version: persistedVersion,
    recordedAt: requiredString(row.recorded_at),
  };
}

class GradebookD1ImportPlanningBulkReaderV1 {
  constructor(private readonly database: D1ReadDatabaseV1) {}

  private async safely<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1ReadErrorV1) throw cause;
      throw new GradebookD1ReadErrorV1('database-read-failed');
    }
  }

  getAssessmentComponents(
    context: AcademicPersistenceContextV1,
    references: readonly AcademicEntityReferenceV1[],
  ): Promise<readonly CurrentAcademicEntityV1[]> {
    if (references.some((reference) => reference.kind !== 'assessment-component')) {
      return Promise.reject(new GradebookD1ReadErrorV1('incompatible-row'));
    }
    if (references.length === 0) return Promise.resolve([]);
    const payload = serializeBulk(references.map((reference) => ({ entityId: reference.id })));
    return this.safely(async () => {
      const rows = await this.database
        .prepare(
          `WITH requested AS (
             SELECT CAST(key AS INTEGER) AS request_index,
                    json_extract(value, '$.entityId') AS entity_id
             FROM json_each(?)
           )
           SELECT
             requested.request_index,
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
           FROM requested
           LEFT JOIN academic_entity_streams s
             ON s.academic_year_id = ?
            AND s.entity_kind = 'assessment-component'
            AND s.entity_id = requested.entity_id
           LEFT JOIN academic_entity_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.entity_kind = s.entity_kind
            AND v.entity_id = s.entity_id
            AND v.version = s.current_version
           ORDER BY requested.request_index`,
        )
        .bind(payload, context.academicYearId)
        .all<D1RowV1>();
      if (rows.results.length !== references.length) return fail('incompatible-row');
      return rows.results.map((row, index) => {
        requestIndex(row, index);
        if (row.current_version === null) return null;
        if (row.persisted_version === null) return fail('broken-reference');
        const reference = references[index]!;
        return assessmentComponentRecord(row, context, reference.id);
      });
    });
  }

  getAcademicRecords(
    context: AcademicPersistenceContextV1,
    streams: readonly AcademicRecordStreamV1[],
  ): Promise<readonly CurrentAcademicRecordV1[]> {
    if (streams.length === 0) return Promise.resolve([]);
    const payload = serializeBulk(
      streams.map((stream) => ({ kind: stream.kind, streamKey: academicRecordStreamKeyV1(stream) })),
    );
    return this.safely(async () => {
      const rows = await this.database
        .prepare(
          `WITH requested AS (
             SELECT CAST(key AS INTEGER) AS request_index,
                    json_extract(value, '$.kind') AS record_kind,
                    json_extract(value, '$.streamKey') AS stream_key
             FROM json_each(?)
           )
           SELECT
             requested.request_index,
             s.current_version,
             s.stream_key,
             v.record_kind AS persisted_record_kind,
             v.version AS persisted_version,
             v.record_id,
             v.authority_mode,
             v.rule_version,
             v.payload_json,
             v.recorded_at
           FROM requested
           LEFT JOIN academic_record_streams s
             ON s.academic_year_id = ?
            AND s.record_kind = requested.record_kind
            AND s.stream_key = requested.stream_key
           LEFT JOIN academic_record_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.record_kind = s.record_kind
            AND v.stream_key = s.stream_key
            AND v.version = s.current_version
           ORDER BY requested.request_index`,
        )
        .bind(payload, context.academicYearId)
        .all<D1RowV1>();
      if (rows.results.length !== streams.length) return fail('incompatible-row');
      return rows.results.map((row, index) => {
        requestIndex(row, index);
        if (row.current_version === null) return null;
        if (row.persisted_version === null) return fail('broken-reference');
        return academicRecord(row, context, streams[index]!);
      });
    });
  }

  getAssociations(
    context: AcademicPersistenceContextV1,
    streams: readonly LogicalSourceRecordAssociationStreamV1[],
  ): Promise<readonly CurrentAssociationV1[]> {
    if (streams.length === 0) return Promise.resolve([]);
    const payload = serializeBulk(
      streams.map((stream) => ({
        logicalSourceId: stream.logicalSourceId,
        kind: stream.academicRecordStream.kind,
        stableKey: stream.stableKey,
      })),
    );
    return this.safely(async () => {
      const rows = await this.database
        .prepare(
          `WITH requested AS (
             SELECT CAST(key AS INTEGER) AS request_index,
                    json_extract(value, '$.logicalSourceId') AS logical_source_id,
                    json_extract(value, '$.kind') AS record_kind,
                    json_extract(value, '$.stableKey') AS stream_key
             FROM json_each(?)
           )
           SELECT
             requested.request_index,
             c.logical_source_id,
             c.record_kind AS association_record_kind,
             c.stream_key AS association_stream_key,
             c.current_version,
             c.current_state,
             v.version AS persisted_version,
             v.association_state,
             v.source_manifest_id,
             v.source_manifest_version,
             v.recorded_at,
             r.record_kind AS linked_record_kind,
             r.stream_key AS linked_stream_key,
             r.student_id,
             r.enrollment_id,
             r.assessment_component_id,
             r.teaching_assignment_id,
             r.term
           FROM requested
           LEFT JOIN logical_source_record_streams c
             ON c.academic_year_id = ?
            AND c.logical_source_id = requested.logical_source_id
            AND c.record_kind = requested.record_kind
            AND c.stream_key = requested.stream_key
           LEFT JOIN logical_source_record_versions v
             ON v.academic_year_id = c.academic_year_id
            AND v.logical_source_id = c.logical_source_id
            AND v.record_kind = c.record_kind
            AND v.stream_key = c.stream_key
            AND v.version = c.current_version
           LEFT JOIN academic_record_streams r
             ON r.academic_year_id = c.academic_year_id
            AND r.record_kind = c.record_kind
            AND r.stream_key = c.stream_key
           ORDER BY requested.request_index`,
        )
        .bind(payload, context.academicYearId)
        .all<D1RowV1>();
      if (rows.results.length !== streams.length) return fail('incompatible-row');
      return rows.results.map((row, index) => {
        requestIndex(row, index);
        if (row.current_version === null) return null;
        if (row.persisted_version === null) return fail('broken-reference');
        return association(row, context, streams[index]!);
      });
    });
  }
}

export function createGradebookD1ImportPlanningBulkReadAdapterV1(
  database: D1ReadDatabaseV1,
): GradebookD1ImportPlanningBulkReadAdapterV1 {
  const reader = new GradebookD1ImportPlanningBulkReaderV1(database);
  return {
    entities: {
      getMany: (context, references) => reader.getAssessmentComponents(context, references),
    },
    academicRecords: {
      getCurrentMany: (context, streams) => reader.getAcademicRecords(context, streams),
    },
    logicalSourceRecords: {
      getCurrentMany: (context, streams) => reader.getAssociations(context, streams),
    },
  };
}
