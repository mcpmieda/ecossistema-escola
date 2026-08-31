import type { SourceFileManifestV1 } from '../../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceIdV1,
  SourceFileVersionV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
  type ImportReconciliationRepositoriesV1,
} from '../../../application/import/import-reconciliation-v1';

type D1ReadValue = string | number | null;
type D1Row = Record<string, unknown>;

export interface D1ReadResultV1<Row extends D1Row> {
  readonly results: readonly Row[];
}

export interface D1ReadStatementV1 {
  bind(...values: D1ReadValue[]): D1ReadStatementV1;
  first<Row extends D1Row>(): Promise<Row | null>;
  all<Row extends D1Row>(): Promise<D1ReadResultV1<Row>>;
}

export interface D1ReadDatabaseV1 {
  prepare(query: string): D1ReadStatementV1;
}

export type GradebookD1ReadErrorCodeV1 =
  'database-read-failed' | 'invalid-json' | 'incompatible-row' | 'broken-reference';

const ERROR_MESSAGES: Record<GradebookD1ReadErrorCodeV1, string> = {
  'database-read-failed': 'Não foi possível consultar os dados acadêmicos persistidos.',
  'invalid-json': 'Os dados acadêmicos persistidos não puderam ser reconstruídos.',
  'incompatible-row': 'O registro acadêmico persistido possui formato incompatível.',
  'broken-reference': 'Uma referência acadêmica persistida está inconsistente.',
};

export class GradebookD1ReadErrorV1 extends Error {
  readonly code: GradebookD1ReadErrorCodeV1;

  constructor(code: GradebookD1ReadErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1ReadErrorV1';
    this.code = code;
  }
}

function fail(code: GradebookD1ReadErrorCodeV1): never {
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

function academicTerm(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) return fail('incompatible-row');
  return value;
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return fail('incompatible-row');

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isObject(parsed)) return fail('incompatible-row');
    return parsed;
  } catch (cause) {
    if (cause instanceof GradebookD1ReadErrorV1) throw cause;
    return fail('invalid-json');
  }
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function validateManifest(value: unknown): SourceFileManifestV1 {
  if (!isObject(value)) return fail('incompatible-row');

  requiredString(value.id);
  requiredString(value.fileName);
  if (value.extension !== 'xlsb' && value.extension !== 'xlsx' && value.extension !== 'xls') {
    return fail('incompatible-row');
  }
  if (value.reportedMimeType !== null && typeof value.reportedMimeType !== 'string') {
    return fail('incompatible-row');
  }
  if (
    typeof value.sizeBytes !== 'number' ||
    !Number.isInteger(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    return fail('incompatible-row');
  }
  if (value.lastModifiedAt !== null && typeof value.lastModifiedAt !== 'string') {
    return fail('incompatible-row');
  }
  requiredString(value.sha256);
  positiveInteger(value.sourceContractVersion);
  requiredString(value.parserVersion);
  requiredString(value.readAt);
  if (
    value.suggestedAcademicYear !== undefined &&
    typeof value.suggestedAcademicYear !== 'number'
  ) {
    return fail('incompatible-row');
  }
  if (
    value.confirmedAcademicYearId !== undefined &&
    typeof value.confirmedAcademicYearId !== 'string'
  ) {
    return fail('incompatible-row');
  }
  if (value.suggestedTeacherName !== undefined && typeof value.suggestedTeacherName !== 'string') {
    return fail('incompatible-row');
  }
  if (value.confirmedTeacherId !== undefined && typeof value.confirmedTeacherId !== 'string') {
    return fail('incompatible-row');
  }

  return value as unknown as SourceFileManifestV1;
}

function mapSourceFileVersion(
  row: D1Row,
  context: AcademicPersistenceContextV1,
  candidateIds: readonly string[],
): VersionedRecordV1<SourceFileVersionV1> {
  const persistedVersion = positiveInteger(row.persisted_version);
  if (positiveInteger(row.current_version) !== persistedVersion) return fail('broken-reference');

  const payload = parsePayload(row.payload_json);
  const manifest = validateManifest(payload.manifest);
  if (manifest.id !== requiredString(row.stream_manifest_id)) return fail('incompatible-row');
  if (manifest.sha256 !== requiredString(row.current_sha256)) return fail('incompatible-row');
  if (
    manifest.confirmedAcademicYearId !== undefined &&
    manifest.confirmedAcademicYearId !== context.academicYearId
  ) {
    return fail('incompatible-row');
  }

  const logicalSource = payload.logicalSource;
  if (!isObject(logicalSource) || logicalSource.state !== row.logical_source_state) {
    return fail('incompatible-row');
  }

  switch (logicalSource.state) {
    case 'unmatched':
      if (candidateIds.length > 0 || row.confirmed_logical_source_id !== null) {
        return fail('incompatible-row');
      }
      break;
    case 'candidate': {
      if (!Array.isArray(logicalSource.candidateLogicalSourceIds)) {
        return fail('incompatible-row');
      }
      const payloadCandidates = logicalSource.candidateLogicalSourceIds.map(requiredString);
      if (JSON.stringify(sorted(payloadCandidates)) !== JSON.stringify(sorted(candidateIds))) {
        return fail('incompatible-row');
      }
      if (row.confirmed_logical_source_id !== null) return fail('incompatible-row');
      break;
    }
    case 'confirmed':
      if (requiredString(logicalSource.logicalSourceId) !== row.confirmed_logical_source_id) {
        return fail('incompatible-row');
      }
      if (candidateIds.length > 0) return fail('incompatible-row');
      break;
    default:
      return fail('incompatible-row');
  }

  return {
    value: { manifest, logicalSource } as SourceFileVersionV1,
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

function mapAcademicRecord(
  row: D1Row,
  context: AcademicPersistenceContextV1,
  requestedStream: AcademicRecordStreamV1,
): VersionedRecordV1<AcademicRecordV1> {
  const persistedVersion = positiveInteger(row.persisted_version);
  if (positiveInteger(row.current_version) !== persistedVersion) return fail('broken-reference');

  const record = validateAcademicRecordShape(parsePayload(row.payload_json));
  if (record.kind !== row.persisted_record_kind || record.kind !== requestedStream.kind) {
    return fail('incompatible-row');
  }
  if (record.value.academicYearId !== context.academicYearId) return fail('incompatible-row');
  if (record.value.id !== requiredString(row.record_id)) return fail('incompatible-row');
  if (record.value.authorityMode !== row.authority_mode) return fail('incompatible-row');
  if (record.value.ruleVersion !== row.rule_version) return fail('incompatible-row');

  const persistedStream = academicRecordStreamForV1(record);
  const persistedKey = academicRecordStreamKeyV1(persistedStream);
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

function mapCatalogStream(row: D1Row): AcademicRecordStreamV1 {
  if (
    row.linked_record_kind === null ||
    row.linked_stream_key === null ||
    row.linked_record_kind !== row.association_record_kind ||
    row.linked_stream_key !== row.association_stream_key
  ) {
    return fail('broken-reference');
  }

  const studentId = requiredString(row.student_id);
  const enrollmentId = requiredString(row.enrollment_id);
  let stream: AcademicRecordStreamV1;

  switch (row.linked_record_kind) {
    case 'grade-entry':
      stream = {
        kind: 'grade-entry',
        studentId,
        enrollmentId,
        assessmentComponentId: requiredString(row.assessment_component_id),
      } as AcademicRecordStreamV1;
      break;
    case 'term-result':
      stream = {
        kind: 'term-result',
        studentId,
        enrollmentId,
        teachingAssignmentId: requiredString(row.teaching_assignment_id),
        term: academicTerm(row.term),
      } as AcademicRecordStreamV1;
      break;
    case 'final-recovery':
      stream = {
        kind: 'final-recovery',
        studentId,
        enrollmentId,
        teachingAssignmentId: requiredString(row.teaching_assignment_id),
        recoveredTerm: academicTerm(row.term),
      } as AcademicRecordStreamV1;
      break;
    case 'annual-result':
      if (row.term !== null) return fail('incompatible-row');
      stream = {
        kind: 'annual-result',
        studentId,
        enrollmentId,
        teachingAssignmentId: requiredString(row.teaching_assignment_id),
      } as AcademicRecordStreamV1;
      break;
    default:
      return fail('incompatible-row');
  }

  if (academicRecordStreamKeyV1(stream) !== row.association_stream_key) {
    return fail('incompatible-row');
  }
  return stream;
}

class GradebookD1ReaderV1 {
  constructor(private readonly database: D1ReadDatabaseV1) {}

  private async safely<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1ReadErrorV1) throw cause;
      throw new GradebookD1ReadErrorV1('database-read-failed');
    }
  }

  private async sourceFile(
    context: AcademicPersistenceContextV1,
    where: 'hash' | 'manifest',
    value: string,
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> {
    return this.safely(async () => {
      const predicate = where === 'hash' ? 's.current_sha256 = ?' : 's.manifest_id = ?';
      const row = await this.database
        .prepare(
          `SELECT
             s.manifest_id AS stream_manifest_id,
             s.current_version,
             s.current_sha256,
             v.version AS persisted_version,
             v.logical_source_state,
             v.confirmed_logical_source_id,
             v.payload_json,
             v.recorded_at
           FROM source_file_streams s
           LEFT JOIN source_file_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.manifest_id = s.manifest_id
            AND v.version = s.current_version
           WHERE s.academic_year_id = ? AND ${predicate}`,
        )
        .bind(context.academicYearId, value)
        .first<D1Row>();
      if (!row) return null;
      if (row.persisted_version === null) return fail('broken-reference');

      const candidates = await this.database
        .prepare(
          `SELECT logical_source_id
           FROM source_file_logical_source_candidates
           WHERE academic_year_id = ? AND manifest_id = ? AND source_file_version = ?
           ORDER BY logical_source_id`,
        )
        .bind(
          context.academicYearId,
          requiredString(row.stream_manifest_id),
          positiveInteger(row.persisted_version),
        )
        .all<D1Row>();
      return mapSourceFileVersion(
        row,
        context,
        candidates.results.map(({ logical_source_id }) => requiredString(logical_source_id)),
      );
    });
  }

  findSourceFileByHash(
    context: AcademicPersistenceContextV1,
    sha256: string,
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> {
    return this.sourceFile(context, 'hash', sha256);
  }

  getSourceFileVersion(
    context: AcademicPersistenceContextV1,
    manifestId: SourceFileManifestV1['id'],
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> {
    return this.sourceFile(context, 'manifest', manifestId);
  }

  getCurrent(
    context: AcademicPersistenceContextV1,
    stream: AcademicRecordStreamV1,
  ): Promise<VersionedRecordV1<AcademicRecordV1> | null> {
    return this.safely(async () => {
      const streamKey = academicRecordStreamKeyV1(stream);
      const row = await this.database
        .prepare(
          `SELECT
             s.current_version,
             s.stream_key,
             v.record_kind AS persisted_record_kind,
             v.version AS persisted_version,
             v.record_id,
             v.authority_mode,
             v.rule_version,
             v.payload_json,
             v.recorded_at
           FROM academic_record_streams s
           LEFT JOIN academic_record_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.record_kind = s.record_kind
            AND v.stream_key = s.stream_key
            AND v.version = s.current_version
           WHERE s.academic_year_id = ? AND s.record_kind = ? AND s.stream_key = ?`,
        )
        .bind(context.academicYearId, stream.kind, streamKey)
        .first<D1Row>();
      if (!row) return null;
      if (row.persisted_version === null) return fail('broken-reference');
      return mapAcademicRecord(row, context, stream);
    });
  }

  listCurrentStreams(
    context: AcademicPersistenceContextV1,
    logicalSourceId: LogicalSourceIdV1,
  ): Promise<readonly AcademicRecordStreamV1[]> {
    return this.safely(async () => {
      const rows = await this.database
        .prepare(
          `SELECT
             c.record_kind AS association_record_kind,
             c.stream_key AS association_stream_key,
             r.record_kind AS linked_record_kind,
             r.stream_key AS linked_stream_key,
             r.student_id,
             r.enrollment_id,
             r.assessment_component_id,
             r.teaching_assignment_id,
             r.term
           FROM logical_source_record_streams c
           LEFT JOIN academic_record_streams r
             ON r.academic_year_id = c.academic_year_id
            AND r.record_kind = c.record_kind
            AND r.stream_key = c.stream_key
           WHERE c.academic_year_id = ?
             AND c.logical_source_id = ?
             AND c.current_state = 'active'
           ORDER BY c.record_kind, c.stream_key`,
        )
        .bind(context.academicYearId, logicalSourceId)
        .all<D1Row>();
      return rows.results.map(mapCatalogStream);
    });
  }
}

export function createGradebookD1ReadAdapterV1(
  database: D1ReadDatabaseV1,
): ImportReconciliationRepositoriesV1 {
  const reader = new GradebookD1ReaderV1(database);
  return {
    imports: {
      findSourceFileByHash: (context, sha256) => reader.findSourceFileByHash(context, sha256),
      getSourceFileVersion: (context, manifestId) =>
        reader.getSourceFileVersion(context, manifestId),
    },
    academicRecords: {
      getCurrent: (context, stream) => reader.getCurrent(context, stream),
    },
    logicalSourceRecords: {
      listCurrentStreams: (context, logicalSourceId) =>
        reader.listCurrentStreams(context, logicalSourceId),
    },
  };
}
