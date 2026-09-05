import type { SourceFileManifestV1 } from '../../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  AcademicPersistenceContextV1,
  SourceFileVersionV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  GradebookD1ReadErrorV1,
  type D1ReadDatabaseV1,
} from './d1-read-adapter-v1';

type Row = Record<string, unknown>;

export interface GradebookD1SourceFileReadV2 {
  findSourceFileByHash(
    context: AcademicPersistenceContextV1,
    sha256: string,
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null>;
  getSourceFileVersion(
    context: AcademicPersistenceContextV1,
    manifestId: SourceFileManifestV1['id'],
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null>;
}

function fail(
  code: 'database-read-failed' | 'invalid-json' | 'incompatible-row' | 'broken-reference',
): never {
  throw new GradebookD1ReadErrorV1(code);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : fail('incompatible-row');
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fail('incompatible-row');
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return fail('incompatible-row');
  try {
    const parsed: unknown = JSON.parse(value);
    return object(parsed) ? parsed : fail('incompatible-row');
  } catch (cause) {
    if (cause instanceof GradebookD1ReadErrorV1) throw cause;
    return fail('invalid-json');
  }
}

function validateManifest(value: unknown): SourceFileManifestV1 {
  if (!object(value)) return fail('incompatible-row');
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

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function mapSourceFileVersion(
  row: Row,
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
  if (!object(logicalSource) || logicalSource.state !== row.logical_source_state) {
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

function sameSourceRow(left: Row, right: Row): boolean {
  return [
    'stream_manifest_id',
    'current_version',
    'current_sha256',
    'persisted_version',
    'logical_source_state',
    'confirmed_logical_source_id',
    'payload_json',
    'recorded_at',
  ].every((field) => left[field] === right[field]);
}

class GradebookD1SourceFileReaderV2 implements GradebookD1SourceFileReadV2 {
  constructor(private readonly database: D1ReadDatabaseV1) {}

  private async safely<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1ReadErrorV1) throw cause;
      throw new GradebookD1ReadErrorV1('database-read-failed');
    }
  }

  private sourceFile(
    context: AcademicPersistenceContextV1,
    where: 'hash' | 'manifest',
    value: string,
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> {
    return this.safely(async () => {
      const predicate = where === 'hash' ? 'current_sha256 = ?' : 'manifest_id = ?';
      const result = await this.database
        .prepare(
          `WITH selected AS (
             SELECT manifest_id AS stream_manifest_id, current_version, current_sha256
             FROM source_file_streams
             WHERE academic_year_id = ? AND ${predicate}
             LIMIT 1
           )
           SELECT
             selected.stream_manifest_id,
             selected.current_version,
             selected.current_sha256,
             v.version AS persisted_version,
             v.logical_source_state,
             v.confirmed_logical_source_id,
             v.payload_json,
             v.recorded_at,
             c.logical_source_id AS candidate_logical_source_id
           FROM selected
           LEFT JOIN source_file_versions v
             ON v.academic_year_id = ?
            AND v.manifest_id = selected.stream_manifest_id
            AND v.version = selected.current_version
           LEFT JOIN source_file_logical_source_candidates c
             ON c.academic_year_id = ?
            AND c.manifest_id = selected.stream_manifest_id
            AND c.source_file_version = selected.current_version
           ORDER BY c.logical_source_id`,
        )
        .bind(context.academicYearId, value, context.academicYearId, context.academicYearId)
        .all<Row>();
      if (result.results.length === 0) return null;
      const first = result.results[0]!;
      if (first.persisted_version === null) return fail('broken-reference');
      if (result.results.some((row) => !sameSourceRow(first, row))) {
        return fail('broken-reference');
      }
      const candidateIds = result.results.flatMap((row) =>
        row.candidate_logical_source_id === null
          ? []
          : [requiredString(row.candidate_logical_source_id)],
      );
      return mapSourceFileVersion(first, context, candidateIds);
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
}

export function createGradebookD1SourceFileReadV2(
  database: D1ReadDatabaseV1,
): GradebookD1SourceFileReadV2 {
  return new GradebookD1SourceFileReaderV2(database);
}
