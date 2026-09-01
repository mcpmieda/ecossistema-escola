import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../../../src/gradebook-domain/context/academic-context-2026-v1';
import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  PersistenceUnitOfWorkV1,
  SourceFileVersionV1,
  VersionExpectationV1,
  VersionedWriteResultV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
} from '../../../application/import/import-reconciliation-v1';
import {
  createGradebookD1AcademicEntityReadAdapterV1,
  createGradebookD1ReadAdapterV1,
  type D1ReadDatabaseV1,
  type D1ReadResultV1,
  type D1ReadStatementV1,
} from '../read/d1-read-adapter-v1';

export type D1WriteValueV1 = string | number | null;
type D1WriteRowV1 = Record<string, unknown>;

export interface D1WriteRunResultV1 {
  readonly success?: boolean;
  readonly changes?: number;
  readonly meta?: {
    readonly changes?: number;
  };
}

export interface D1WriteStatementV1 extends D1ReadStatementV1 {
  bind(...values: D1WriteValueV1[]): D1WriteStatementV1;
  run(): Promise<D1WriteRunResultV1>;
}

export interface D1WriteDatabaseV1 extends D1ReadDatabaseV1 {
  prepare(query: string): D1WriteStatementV1;
  exec(query: string): Promise<unknown> | unknown;
}

export type GradebookD1WriteErrorCodeV1 =
  'database-write-failed' | 'incompatible-write' | 'unsupported-operation';

const ERROR_MESSAGES: Record<GradebookD1WriteErrorCodeV1, string> = {
  'database-write-failed': 'Não foi possível gravar os dados acadêmicos persistidos.',
  'incompatible-write': 'A escrita acadêmica recebida possui formato incompatível.',
  'unsupported-operation': 'A operação de persistência não está disponível neste adaptador local.',
};

export class GradebookD1WriteErrorV1 extends Error {
  readonly code: GradebookD1WriteErrorCodeV1;

  constructor(code: GradebookD1WriteErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1WriteErrorV1';
    this.code = code;
  }
}

export interface GradebookD1WriteAdapterOptionsV1 {
  readonly now?: () => string;
}

function fail(code: GradebookD1WriteErrorCodeV1): never {
  throw new GradebookD1WriteErrorV1(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validExpectation(expectation: VersionExpectationV1): boolean {
  return expectation.expectedVersion === null || positiveInteger(expectation.expectedVersion);
}

function serialize(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (!nonEmptyString(serialized)) return fail('incompatible-write');
    return serialized;
  } catch {
    return fail('incompatible-write');
  }
}

function changes(result: D1WriteRunResultV1): number {
  const value = result.meta?.changes ?? result.changes;
  if (!nonNegativeInteger(value)) return fail('database-write-failed');
  if (result.success === false) return fail('database-write-failed');
  return value;
}

function currentVersion(row: D1WriteRowV1 | null): number | null {
  if (!row) return null;
  return positiveInteger(row.current_version) ? row.current_version : fail('database-write-failed');
}

function unsupported(): never {
  return fail('unsupported-operation');
}

function validManifest(value: SourceFileVersionV1, context: AcademicPersistenceContextV1): boolean {
  const { manifest, logicalSource } = value;
  if (
    !nonEmptyString(context.academicYearId) ||
    !nonEmptyString(manifest.id) ||
    !nonEmptyString(manifest.fileName) ||
    (manifest.extension !== 'xlsb' &&
      manifest.extension !== 'xlsx' &&
      manifest.extension !== 'xls') ||
    (manifest.reportedMimeType !== null && typeof manifest.reportedMimeType !== 'string') ||
    !nonNegativeInteger(manifest.sizeBytes) ||
    (manifest.lastModifiedAt !== null && typeof manifest.lastModifiedAt !== 'string') ||
    !/^[0-9a-f]{64}$/u.test(manifest.sha256) ||
    !positiveInteger(manifest.sourceContractVersion) ||
    !nonEmptyString(manifest.parserVersion) ||
    !nonEmptyString(manifest.readAt) ||
    (manifest.suggestedAcademicYear !== undefined &&
      !Number.isInteger(manifest.suggestedAcademicYear)) ||
    (manifest.confirmedAcademicYearId !== undefined &&
      manifest.confirmedAcademicYearId !== context.academicYearId) ||
    (manifest.suggestedTeacherName !== undefined &&
      typeof manifest.suggestedTeacherName !== 'string') ||
    (manifest.confirmedTeacherId !== undefined && !nonEmptyString(manifest.confirmedTeacherId))
  ) {
    return false;
  }

  switch (logicalSource.state) {
    case 'unmatched':
      return true;
    case 'candidate':
      return (
        logicalSource.candidateLogicalSourceIds.length > 0 &&
        new Set(logicalSource.candidateLogicalSourceIds).size ===
          logicalSource.candidateLogicalSourceIds.length &&
        logicalSource.candidateLogicalSourceIds.every(nonEmptyString)
      );
    case 'confirmed':
      return nonEmptyString(logicalSource.logicalSourceId);
  }
}

function academicRecordMetadata(record: AcademicRecordV1): {
  readonly recordId: string;
  readonly authorityMode: 'imported-source' | 'native-engine';
  readonly ruleVersion: string;
} {
  if (
    !isObject(record.value) ||
    !nonEmptyString(record.value.id) ||
    (record.value.authorityMode !== 'imported-source' &&
      record.value.authorityMode !== 'native-engine') ||
    !nonEmptyString(record.value.ruleVersion)
  ) {
    return fail('incompatible-write');
  }

  return {
    recordId: record.value.id,
    authorityMode: record.value.authorityMode,
    ruleVersion: record.value.ruleVersion,
  };
}

function validAcademicRecord(
  context: AcademicPersistenceContextV1,
  stream: AcademicRecordStreamV1,
  record: AcademicRecordV1,
): boolean {
  if (
    !nonEmptyString(context.academicYearId) ||
    record.kind !== stream.kind ||
    record.value.academicYearId !== context.academicYearId
  ) {
    return false;
  }

  try {
    return (
      academicRecordStreamKeyV1(stream) ===
      academicRecordStreamKeyV1(academicRecordStreamForV1(record))
    );
  } catch {
    return false;
  }
}

function validAssociation(
  context: AcademicPersistenceContextV1,
  stream: LogicalSourceRecordAssociationStreamV1,
  association: LogicalSourceRecordAssociationV1,
): boolean {
  if (
    !nonEmptyString(context.academicYearId) ||
    !nonEmptyString(stream.logicalSourceId) ||
    !nonEmptyString(stream.stableKey) ||
    association.academicYearId !== context.academicYearId ||
    association.logicalSourceId !== stream.logicalSourceId ||
    association.stableKey !== stream.stableKey ||
    (association.state !== 'active' && association.state !== 'inactive') ||
    !nonEmptyString(association.sourceManifestId) ||
    !positiveInteger(association.sourceManifestVersion)
  ) {
    return false;
  }

  try {
    return (
      academicRecordStreamKeyV1(stream.academicRecordStream) === stream.stableKey &&
      academicRecordStreamKeyV1(association.academicRecordStream) === stream.stableKey
    );
  } catch {
    return false;
  }
}

function validAcademicYear(
  context: AcademicPersistenceContextV1,
  record: AcademicEntityRecordV1,
): record is Extract<AcademicEntityRecordV1, { readonly kind: 'academic-year' }> {
  if (record.kind !== 'academic-year') return false;
  const value = record.value;
  return (
    nonEmptyString(context.academicYearId) &&
    value.id === context.academicYearId &&
    nonEmptyString(value.id) &&
    nonEmptyString(value.schoolId) &&
    value.year === ACADEMIC_CONTEXT_2026_IDENTITY_V1.academicYear &&
    (value.status === 'planned' || value.status === 'active' || value.status === 'closed') &&
    (value.startsOn === undefined || nonEmptyString(value.startsOn)) &&
    (value.endsOn === undefined || nonEmptyString(value.endsOn)) &&
    value.activeEvaluationProfileId === ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId &&
    value.configurationVersion ===
      String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion)
  );
}

function streamColumns(stream: AcademicRecordStreamV1): {
  readonly studentId: string;
  readonly enrollmentId: string;
  readonly assessmentComponentKind: 'assessment-component' | null;
  readonly assessmentComponentId: string | null;
  readonly teachingAssignmentKind: 'teaching-assignment' | null;
  readonly teachingAssignmentId: string | null;
  readonly term: number | null;
} {
  switch (stream.kind) {
    case 'grade-entry':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentKind: 'assessment-component',
        assessmentComponentId: stream.assessmentComponentId,
        teachingAssignmentKind: null,
        teachingAssignmentId: null,
        term: null,
      };
    case 'term-result':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentKind: null,
        assessmentComponentId: null,
        teachingAssignmentKind: 'teaching-assignment',
        teachingAssignmentId: stream.teachingAssignmentId,
        term: stream.term,
      };
    case 'final-recovery':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentKind: null,
        assessmentComponentId: null,
        teachingAssignmentKind: 'teaching-assignment',
        teachingAssignmentId: stream.teachingAssignmentId,
        term: stream.recoveredTerm,
      };
    case 'annual-result':
      return {
        studentId: stream.studentId,
        enrollmentId: stream.enrollmentId,
        assessmentComponentKind: null,
        assessmentComponentId: null,
        teachingAssignmentKind: 'teaching-assignment',
        teachingAssignmentId: stream.teachingAssignmentId,
        term: null,
      };
  }
}

class GradebookD1WriterV1 {
  private savepointSequence = 0;

  constructor(
    private readonly database: D1WriteDatabaseV1,
    private readonly now: () => string,
  ) {}

  private async safely<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1WriteErrorV1) throw cause;
      throw new GradebookD1WriteErrorV1('database-write-failed');
    }
  }

  private async inSavepoint<T>(operation: () => Promise<T>): Promise<T> {
    const name = `gradebook_write_${String(++this.savepointSequence)}`;
    return this.safely(async () => {
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
          throw new GradebookD1WriteErrorV1('database-write-failed');
        }
        throw cause;
      }
    });
  }

  private async readCurrentVersion(
    table:
      | 'academic_years'
      | 'source_file_streams'
      | 'academic_record_streams'
      | 'logical_source_record_streams',
    predicate: string,
    values: readonly D1WriteValueV1[],
  ): Promise<number | null> {
    const row = await this.database
      .prepare(`SELECT current_version FROM ${table} WHERE ${predicate}`)
      .bind(...values)
      .first<D1WriteRowV1>();
    return currentVersion(row);
  }

  async appendAcademicYearVersion(
    context: AcademicPersistenceContextV1,
    record: AcademicEntityRecordV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<AcademicEntityRecordV1>> {
    if (!validExpectation(expectation) || !validAcademicYear(context, record)) {
      return fail('incompatible-write');
    }

    const value = record.value;
    const payloadJson = serialize(value);
    const configurationPayloadJson = serialize({});
    const recordedAt = this.now();
    if (!nonEmptyString(recordedAt)) return fail('incompatible-write');

    return this.inSavepoint(async () => {
      let rootChanges: number;
      if (expectation.expectedVersion === null) {
        rootChanges = changes(
          await this.database
            .prepare(
              `INSERT INTO academic_years (
                 academic_year_id, school_id, year, current_version, created_at
               ) VALUES (?, ?, ?, 1, ?)
               ON CONFLICT DO NOTHING`,
            )
            .bind(value.id, value.schoolId, value.year, recordedAt)
            .run(),
        );
      } else {
        rootChanges = changes(
          await this.database
            .prepare(
              `UPDATE academic_years
               SET current_version = ?
               WHERE academic_year_id = ?
                 AND school_id = ?
                 AND year = ?
                 AND current_version = ?`,
            )
            .bind(
              expectation.expectedVersion + 1,
              value.id,
              value.schoolId,
              value.year,
              expectation.expectedVersion,
            )
            .run(),
        );
      }

      if (rootChanges !== 1) {
        const persisted = await this.readCurrentVersion(
          'academic_years',
          'academic_year_id = ?',
          [value.id],
        );
        return { status: 'version-conflict', currentVersion: persisted };
      }

      changes(
        await this.database
          .prepare(
            `INSERT INTO academic_year_configuration_versions (
               academic_year_id, configuration_id, version, previous_version,
               evaluation_profile_id, payload_json, recorded_at
             ) VALUES (?, ?, ?, NULL, ?, ?, ?)
             ON CONFLICT (academic_year_id, configuration_id, version) DO NOTHING`,
          )
          .bind(
            value.id,
            ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationId,
            ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion,
            ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
            configurationPayloadJson,
            recordedAt,
          )
          .run(),
      );

      const configuration = await this.database
        .prepare(
          `SELECT evaluation_profile_id
           FROM academic_year_configuration_versions
           WHERE academic_year_id = ? AND configuration_id = ? AND version = ?`,
        )
        .bind(
          value.id,
          ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationId,
          ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion,
        )
        .first<D1WriteRowV1>();
      if (
        !configuration ||
        configuration.evaluation_profile_id !==
          ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId
      ) {
        return fail('incompatible-write');
      }

      const version = (expectation.expectedVersion ?? 0) + 1;
      changes(
        await this.database
          .prepare(
            `INSERT INTO academic_year_versions (
               academic_year_id, version, previous_version, status, starts_on, ends_on,
               active_evaluation_profile_id, configuration_id, configuration_version,
               payload_json, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            value.id,
            version,
            expectation.expectedVersion,
            value.status,
            value.startsOn ?? null,
            value.endsOn ?? null,
            value.activeEvaluationProfileId,
            ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationId,
            ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion,
            payloadJson,
            recordedAt,
          )
          .run(),
      );

      return {
        status: 'written',
        record: { value: record, version, recordedAt },
      };
    });
  }

  async appendSourceFileVersion(
    context: AcademicPersistenceContextV1,
    value: SourceFileVersionV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<SourceFileVersionV1>> {
    if (!validExpectation(expectation) || !validManifest(value, context)) {
      return fail('incompatible-write');
    }
    const payloadJson = serialize(value);
    const recordedAt = this.now();
    if (!nonEmptyString(recordedAt)) return fail('incompatible-write');
    const { manifest, logicalSource } = value;
    const confirmedLogicalSourceId =
      logicalSource.state === 'confirmed' ? logicalSource.logicalSourceId : null;

    return this.inSavepoint(async () => {
      let rootChanges: number;
      if (expectation.expectedVersion === null) {
        rootChanges = changes(
          await this.database
            .prepare(
              `INSERT INTO source_file_streams (
                 academic_year_id, manifest_id, current_version, current_sha256, created_at
               ) VALUES (?, ?, 1, ?, ?)
               ON CONFLICT (academic_year_id, manifest_id) DO NOTHING`,
            )
            .bind(context.academicYearId, manifest.id, manifest.sha256, recordedAt)
            .run(),
        );
      } else {
        rootChanges = changes(
          await this.database
            .prepare(
              `UPDATE source_file_streams
               SET current_version = ?, current_sha256 = ?
               WHERE academic_year_id = ? AND manifest_id = ? AND current_version = ?`,
            )
            .bind(
              expectation.expectedVersion + 1,
              manifest.sha256,
              context.academicYearId,
              manifest.id,
              expectation.expectedVersion,
            )
            .run(),
        );
      }

      if (rootChanges !== 1) {
        const persisted = await this.readCurrentVersion(
          'source_file_streams',
          'academic_year_id = ? AND manifest_id = ?',
          [context.academicYearId, manifest.id],
        );
        return { status: 'version-conflict', currentVersion: persisted };
      }

      const version = (expectation.expectedVersion ?? 0) + 1;
      changes(
        await this.database
          .prepare(
            `INSERT INTO source_file_versions (
               academic_year_id, manifest_id, version, previous_version,
               file_name, extension, reported_mime_type, size_bytes, last_modified_at,
               sha256, source_contract_version, parser_version, read_at,
               suggested_academic_year, confirmed_academic_year_id,
               suggested_teacher_name, confirmed_teacher_ref_kind, confirmed_teacher_id,
               logical_source_state, confirmed_logical_source_id, payload_json, recorded_at
             ) VALUES (
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             )`,
          )
          .bind(
            context.academicYearId,
            manifest.id,
            version,
            expectation.expectedVersion,
            manifest.fileName,
            manifest.extension,
            manifest.reportedMimeType,
            manifest.sizeBytes,
            manifest.lastModifiedAt,
            manifest.sha256,
            manifest.sourceContractVersion,
            manifest.parserVersion,
            manifest.readAt,
            manifest.suggestedAcademicYear ?? null,
            manifest.confirmedAcademicYearId ?? null,
            manifest.suggestedTeacherName ?? null,
            manifest.confirmedTeacherId ? 'teacher' : null,
            manifest.confirmedTeacherId ?? null,
            logicalSource.state,
            confirmedLogicalSourceId,
            payloadJson,
            recordedAt,
          )
          .run(),
      );

      if (logicalSource.state === 'candidate') {
        for (const logicalSourceId of [...logicalSource.candidateLogicalSourceIds].sort()) {
          changes(
            await this.database
              .prepare(
                `INSERT INTO source_file_logical_source_candidates (
                   academic_year_id, manifest_id, source_file_version, logical_source_id
                 ) VALUES (?, ?, ?, ?)`,
              )
              .bind(context.academicYearId, manifest.id, version, logicalSourceId)
              .run(),
          );
        }
      }

      return {
        status: 'written',
        record: { value, version, recordedAt },
      };
    });
  }

  async appendAcademicRecordVersion(
    context: AcademicPersistenceContextV1,
    stream: AcademicRecordStreamV1,
    record: AcademicRecordV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<AcademicRecordV1>> {
    if (!validExpectation(expectation) || !validAcademicRecord(context, stream, record)) {
      return fail('incompatible-write');
    }
    const payloadJson = serialize(record);
    const recordedAt = this.now();
    if (!nonEmptyString(recordedAt)) return fail('incompatible-write');
    const streamKey = academicRecordStreamKeyV1(stream);
    const columns = streamColumns(stream);
    const metadata = academicRecordMetadata(record);

    return this.inSavepoint(async () => {
      let rootChanges: number;
      if (expectation.expectedVersion === null) {
        rootChanges = changes(
          await this.database
            .prepare(
              `INSERT INTO academic_record_streams (
                 academic_year_id, record_kind, stream_key, current_version,
                 student_id, enrollment_id,
                 assessment_component_ref_kind, assessment_component_id,
                 teaching_assignment_ref_kind, teaching_assignment_id, term, created_at
               ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (academic_year_id, record_kind, stream_key) DO NOTHING`,
            )
            .bind(
              context.academicYearId,
              stream.kind,
              streamKey,
              columns.studentId,
              columns.enrollmentId,
              columns.assessmentComponentKind,
              columns.assessmentComponentId,
              columns.teachingAssignmentKind,
              columns.teachingAssignmentId,
              columns.term,
              recordedAt,
            )
            .run(),
        );
      } else {
        rootChanges = changes(
          await this.database
            .prepare(
              `UPDATE academic_record_streams
               SET current_version = ?
               WHERE academic_year_id = ? AND record_kind = ?
                 AND stream_key = ? AND current_version = ?`,
            )
            .bind(
              expectation.expectedVersion + 1,
              context.academicYearId,
              stream.kind,
              streamKey,
              expectation.expectedVersion,
            )
            .run(),
        );
      }

      if (rootChanges !== 1) {
        const persisted = await this.readCurrentVersion(
          'academic_record_streams',
          'academic_year_id = ? AND record_kind = ? AND stream_key = ?',
          [context.academicYearId, stream.kind, streamKey],
        );
        return { status: 'version-conflict', currentVersion: persisted };
      }

      const version = (expectation.expectedVersion ?? 0) + 1;
      changes(
        await this.database
          .prepare(
            `INSERT INTO academic_record_versions (
               academic_year_id, record_kind, stream_key, version, previous_version,
               record_id, authority_mode, rule_version, payload_json, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            context.academicYearId,
            stream.kind,
            streamKey,
            version,
            expectation.expectedVersion,
            metadata.recordId,
            metadata.authorityMode,
            metadata.ruleVersion,
            payloadJson,
            recordedAt,
          )
          .run(),
      );

      return {
        status: 'written',
        record: { value: record, version, recordedAt },
      };
    });
  }

  async appendAssociationVersion(
    context: AcademicPersistenceContextV1,
    stream: LogicalSourceRecordAssociationStreamV1,
    association: LogicalSourceRecordAssociationV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<LogicalSourceRecordAssociationV1>> {
    if (!validExpectation(expectation) || !validAssociation(context, stream, association)) {
      return fail('incompatible-write');
    }
    const recordedAt = this.now();
    if (!nonEmptyString(recordedAt)) return fail('incompatible-write');

    return this.inSavepoint(async () => {
      let rootChanges: number;
      if (expectation.expectedVersion === null) {
        rootChanges = changes(
          await this.database
            .prepare(
              `INSERT INTO logical_source_record_streams (
                 academic_year_id, logical_source_id, record_kind, stream_key,
                 current_version, current_state, created_at
               ) VALUES (?, ?, ?, ?, 1, ?, ?)
               ON CONFLICT (academic_year_id, logical_source_id, record_kind, stream_key)
               DO NOTHING`,
            )
            .bind(
              context.academicYearId,
              stream.logicalSourceId,
              stream.academicRecordStream.kind,
              stream.stableKey,
              association.state,
              recordedAt,
            )
            .run(),
        );
      } else {
        rootChanges = changes(
          await this.database
            .prepare(
              `UPDATE logical_source_record_streams
               SET current_version = ?, current_state = ?
               WHERE academic_year_id = ? AND logical_source_id = ?
                 AND record_kind = ? AND stream_key = ? AND current_version = ?`,
            )
            .bind(
              expectation.expectedVersion + 1,
              association.state,
              context.academicYearId,
              stream.logicalSourceId,
              stream.academicRecordStream.kind,
              stream.stableKey,
              expectation.expectedVersion,
            )
            .run(),
        );
      }

      if (rootChanges !== 1) {
        const persisted = await this.readCurrentVersion(
          'logical_source_record_streams',
          `academic_year_id = ? AND logical_source_id = ?
           AND record_kind = ? AND stream_key = ?`,
          [
            context.academicYearId,
            stream.logicalSourceId,
            stream.academicRecordStream.kind,
            stream.stableKey,
          ],
        );
        return { status: 'version-conflict', currentVersion: persisted };
      }

      const version = (expectation.expectedVersion ?? 0) + 1;
      changes(
        await this.database
          .prepare(
            `INSERT INTO logical_source_record_versions (
               academic_year_id, logical_source_id, record_kind, stream_key,
               version, previous_version, association_state,
               source_manifest_id, source_manifest_version, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            context.academicYearId,
            stream.logicalSourceId,
            stream.academicRecordStream.kind,
            stream.stableKey,
            version,
            expectation.expectedVersion,
            association.state,
            association.sourceManifestId,
            association.sourceManifestVersion,
            recordedAt,
          )
          .run(),
      );

      return {
        status: 'written',
        record: { value: association, version, recordedAt },
      };
    });
  }
}

export function createGradebookD1WriteUnitOfWorkV1(
  database: D1WriteDatabaseV1,
  options: GradebookD1WriteAdapterOptionsV1 = {},
): PersistenceUnitOfWorkV1 {
  const reads = createGradebookD1ReadAdapterV1(database);
  const entityReads = createGradebookD1AcademicEntityReadAdapterV1(database);
  const writer = new GradebookD1WriterV1(database, options.now ?? (() => new Date().toISOString()));

  return {
    entities: {
      get: async (context, reference) =>
        reference.kind === 'academic-year' ? entityReads.get(context, reference) : unsupported(),
      list: async (context, kind, page) =>
        kind === 'academic-year' ? entityReads.list(context, kind, page) : unsupported(),
      appendVersion: async (context, record, expectation) =>
        record.kind === 'academic-year'
          ? writer.appendAcademicYearVersion(context, record, expectation)
          : unsupported(),
    },
    imports: {
      findSourceFileByHash: reads.imports.findSourceFileByHash,
      getSourceFileVersion: reads.imports.getSourceFileVersion,
      listLogicalSourceVersions: async () => unsupported(),
      appendSourceFileVersion: (context, value, expectation) =>
        writer.appendSourceFileVersion(context, value, expectation),
      getImportBatch: async () => unsupported(),
      appendImportBatchVersion: async () => unsupported(),
    },
    academicRecords: {
      getCurrent: reads.academicRecords.getCurrent,
      listVersions: async () => unsupported(),
      appendVersion: (context, stream, record, expectation) =>
        writer.appendAcademicRecordVersion(context, stream, record, expectation),
    },
    logicalSourceRecords: {
      getCurrent: reads.logicalSourceRecords.getCurrent,
      listCurrentStreams: reads.logicalSourceRecords.listCurrentStreams,
      listVersions: async () => unsupported(),
      appendVersion: (context, stream, association, expectation) =>
        writer.appendAssociationVersion(context, stream, association, expectation),
    },
    audit: {
      getCurrent: async () => unsupported(),
      listVersions: async () => unsupported(),
      appendVersion: async () => unsupported(),
    },
  };
}

export type { D1ReadResultV1 };
