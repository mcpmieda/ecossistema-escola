import type { SourceFileManifestV1 } from '../../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  AcademicPersistenceContextV1,
  SourceFileVersionV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  createGradebookD1ReadAdapterV1,
  GradebookD1ReadErrorV1,
  type D1ReadDatabaseV1,
  type D1ReadResultV1,
  type D1ReadStatementV1,
} from './d1-read-adapter-v1';

type Row = Record<string, unknown>;
type ReadValue = string | number | null;

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

class StaticStatement implements D1ReadStatementV1 {
  constructor(
    private readonly firstRow: Row | null,
    private readonly rows: readonly Row[],
  ) {}

  bind(..._values: ReadValue[]): D1ReadStatementV1 {
    return this;
  }

  async first<T extends Row>(): Promise<T | null> {
    return this.firstRow as T | null;
  }

  async all<T extends Row>(): Promise<D1ReadResultV1<T>> {
    return { results: this.rows as readonly T[] };
  }
}

class PreloadedSourceDatabase implements D1ReadDatabaseV1 {
  constructor(
    private readonly sourceRow: Row,
    private readonly candidateRows: readonly Row[],
  ) {}

  prepare(query: string): D1ReadStatementV1 {
    if (query.includes('source_file_logical_source_candidates')) {
      return new StaticStatement(null, this.candidateRows);
    }
    if (query.includes('source_file_streams')) {
      return new StaticStatement(this.sourceRow, []);
    }
    throw new Error('unexpected-source-read-query');
  }
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

  private async sourceFile(
    context: AcademicPersistenceContextV1,
    where: 'hash' | 'manifest',
    value: string,
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null> {
    try {
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

      const sourceRow = result.results[0]!;
      if (result.results.some((row) => !sameSourceRow(sourceRow, row))) {
        throw new GradebookD1ReadErrorV1('broken-reference');
      }
      const candidateRows = result.results.flatMap<Row>((row) =>
        row.candidate_logical_source_id === null
          ? []
          : [{ logical_source_id: row.candidate_logical_source_id }],
      );
      const canonical = createGradebookD1ReadAdapterV1(
        new PreloadedSourceDatabase(sourceRow, candidateRows),
      );
      return where === 'hash'
        ? canonical.imports.findSourceFileByHash(context, value)
        : canonical.imports.getSourceFileVersion(context, value as SourceFileManifestV1['id']);
    } catch (cause) {
      if (cause instanceof GradebookD1ReadErrorV1) throw cause;
      throw new GradebookD1ReadErrorV1('database-read-failed');
    }
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
