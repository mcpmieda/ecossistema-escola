import type { AcademicYearId } from '../../../../../shared/gradebook-contracts/entities';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';

export type GradebookImportStageSessionStateV1 = 'preparing' | 'committed' | 'blocked';

export interface GradebookImportStageSessionV1 {
  readonly sessionId: string;
  readonly academicYearId: AcademicYearId;
  readonly sourceSha256: string;
  readonly expectedChunkCount: number;
  readonly state: GradebookImportStageSessionStateV1;
  readonly metadataJson: string;
  readonly metaWriteJson: string | null;
  readonly resultJson: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly committedAt: string | null;
}

export interface GradebookImportStageChunkV1 {
  readonly sessionId: string;
  readonly chunkIndex: number;
  readonly chunkHash: string;
  readonly payloadJson: string;
  readonly incomingKeysJson: string;
  readonly entityWriteCount: number;
  readonly academicRecordWriteCount: number;
  readonly associationWriteCount: number;
  readonly createdAt: string;
}

type Row = Record<string, unknown>;

function stringValue(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('stage-row-invalid');
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return stringValue(value);
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('stage-row-invalid');
  }
  return value;
}

function session(row: Row): GradebookImportStageSessionV1 {
  const state = row.state;
  if (state !== 'preparing' && state !== 'committed' && state !== 'blocked') {
    throw new Error('stage-row-invalid');
  }
  return {
    sessionId: stringValue(row.session_id),
    academicYearId: stringValue(row.academic_year_id) as AcademicYearId,
    sourceSha256: stringValue(row.source_sha256),
    expectedChunkCount: integer(row.expected_chunk_count),
    state,
    metadataJson: stringValue(row.metadata_json),
    metaWriteJson: nullableString(row.meta_write_json),
    resultJson: nullableString(row.result_json),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
    expiresAt: stringValue(row.expires_at),
    committedAt: nullableString(row.committed_at),
  };
}

export class GradebookD1ImportStagingRepositoryV1 {
  constructor(private readonly database: D1WriteDatabaseV1) {}

  async begin(input: {
    readonly sessionId: string;
    readonly academicYearId: AcademicYearId;
    readonly sourceSha256: string;
    readonly expectedChunkCount: number;
    readonly metadataJson: string;
    readonly createdAt: string;
    readonly expiresAt: string;
  }): Promise<void> {
    const result = await this.database
      .prepare(
        `INSERT INTO gradebook_import_stage_sessions (
           session_id, academic_year_id, source_sha256, expected_chunk_count, state,
           metadata_json, meta_write_json, result_json, created_at, updated_at, expires_at, committed_at
         ) VALUES (?, ?, ?, ?, 'preparing', ?, NULL, NULL, ?, ?, ?, NULL)`,
      )
      .bind(
        input.sessionId,
        input.academicYearId,
        input.sourceSha256,
        input.expectedChunkCount,
        input.metadataJson,
        input.createdAt,
        input.createdAt,
        input.expiresAt,
      )
      .run();
    const changes = result.meta?.changes ?? result.changes;
    if (result.success === false || changes !== 1) throw new Error('stage-session-create-failed');
  }

  async getSession(sessionId: string): Promise<GradebookImportStageSessionV1 | null> {
    const row = await this.database
      .prepare(
        `SELECT session_id, academic_year_id, source_sha256, expected_chunk_count, state,
                metadata_json, meta_write_json, result_json, created_at, updated_at, expires_at,
                committed_at
         FROM gradebook_import_stage_sessions
         WHERE session_id = ?`,
      )
      .bind(sessionId)
      .first<Row>();
    return row ? session(row) : null;
  }

  async getChunk(sessionId: string, chunkIndex: number): Promise<GradebookImportStageChunkV1 | null> {
    const row = await this.database
      .prepare(
        `SELECT session_id, chunk_index, chunk_hash, payload_json, incoming_keys_json,
                entity_write_count, academic_record_write_count, association_write_count, created_at
         FROM gradebook_import_stage_chunks
         WHERE session_id = ? AND chunk_index = ?`,
      )
      .bind(sessionId, chunkIndex)
      .first<Row>();
    if (!row) return null;
    return {
      sessionId: stringValue(row.session_id),
      chunkIndex: integer(row.chunk_index),
      chunkHash: stringValue(row.chunk_hash),
      payloadJson: stringValue(row.payload_json),
      incomingKeysJson: stringValue(row.incoming_keys_json),
      entityWriteCount: integer(row.entity_write_count),
      academicRecordWriteCount: integer(row.academic_record_write_count),
      associationWriteCount: integer(row.association_write_count),
      createdAt: stringValue(row.created_at),
    };
  }

  async storeChunk(input: {
    readonly session: GradebookImportStageSessionV1;
    readonly chunkIndex: number;
    readonly chunkHash: string;
    readonly payloadJson: string;
    readonly incomingKeysJson: string;
    readonly metaWriteJson: string;
    readonly entityWriteCount: number;
    readonly academicRecordWriteCount: number;
    readonly associationWriteCount: number;
    readonly createdAt: string;
  }): Promise<'stored' | 'already-present' | 'conflict'> {
    if (
      input.session.state !== 'preparing' ||
      input.chunkIndex < 0 ||
      input.chunkIndex >= input.session.expectedChunkCount
    ) {
      return 'conflict';
    }
    if (input.session.metaWriteJson !== null && input.session.metaWriteJson !== input.metaWriteJson) {
      return 'conflict';
    }
    const known = await this.getChunk(input.session.sessionId, input.chunkIndex);
    if (known) return known.chunkHash === input.chunkHash ? 'already-present' : 'conflict';

    const result = await this.database
      .prepare(
        `INSERT INTO gradebook_import_stage_chunks (
           session_id, chunk_index, chunk_hash, payload_json, incoming_keys_json,
           entity_write_count, academic_record_write_count, association_write_count, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.session.sessionId,
        input.chunkIndex,
        input.chunkHash,
        input.payloadJson,
        input.incomingKeysJson,
        input.entityWriteCount,
        input.academicRecordWriteCount,
        input.associationWriteCount,
        input.createdAt,
      )
      .run();
    const changes = result.meta?.changes ?? result.changes;
    if (result.success === false || changes !== 1) throw new Error('stage-chunk-write-failed');

    const update = await this.database
      .prepare(
        `UPDATE gradebook_import_stage_sessions
         SET meta_write_json = COALESCE(meta_write_json, ?), updated_at = ?
         WHERE session_id = ? AND state = 'preparing'
           AND (meta_write_json IS NULL OR meta_write_json = ?)`,
      )
      .bind(
        input.metaWriteJson,
        input.createdAt,
        input.session.sessionId,
        input.metaWriteJson,
      )
      .run();
    const updateChanges = update.meta?.changes ?? update.changes;
    if (update.success === false || updateChanges !== 1) throw new Error('stage-session-meta-write-failed');
    return 'stored';
  }

  async preparedChunkCount(sessionId: string): Promise<number> {
    const row = await this.database
      .prepare('SELECT COUNT(*) AS count FROM gradebook_import_stage_chunks WHERE session_id = ?')
      .bind(sessionId)
      .first<Row>();
    return row ? integer(row.count) : 0;
  }
}
