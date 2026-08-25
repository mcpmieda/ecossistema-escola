import type {
  GradeEventCommit,
  GradeEventInput,
  GradeEventStore,
  GradeField,
  GradeSnapshot,
  GradeValue,
  StoredGradeEvent,
} from '../../shared/banco-notas-grade-events';
import { GradeEventConflictError, GradeEventForbiddenError } from './grade-events';

type Row = Record<string, string | number | null>;

function valueFromRow(row: Row): GradeValue {
  if (row.value_numeric !== null && row.value_numeric !== undefined) return Number(row.value_numeric);
  if (row.value_text !== null && row.value_text !== undefined) return String(row.value_text);
  return null;
}

function splitValue(value: GradeValue): { numeric: number | null; text: string | null } {
  if (typeof value === 'number') return { numeric: value, text: null };
  if (typeof value === 'string') return { numeric: null, text: value };
  return { numeric: null, text: null };
}

function storedEvent(row: Row): StoredGradeEvent {
  if (!row.teacher_model_id) throw new Error('grade_event_teacher_model_missing');
  return {
    eventId: String(row.id),
    correlationId: String(row.correlation_id),
    idempotencyKey: String(row.idempotency_key),
    payloadHash: String(row.payload_hash),
    eventType: row.event_type as StoredGradeEvent['eventType'],
    gradeKey: String(row.grade_key),
    field: row.field as GradeField,
    sourceId: String(row.source_id),
    teacherModelId: String(row.teacher_model_id),
    sequence: Number(row.sequence),
    valueAfter: valueFromRow(row),
    isAbsent: Boolean(row.is_absent),
    status: row.status as StoredGradeEvent['status'],
    clientSentAt: String(row.occurred_at),
    receivedAt: String(row.received_at),
  };
}

function snapshot(row: Row): GradeSnapshot {
  return {
    gradeKey: String(row.grade_key),
    field: row.field as GradeField,
    value: valueFromRow(row),
    isAbsent: Boolean(row.is_absent),
    sequence: Number(row.sequence),
    lastEventId: String(row.event_id),
    sourceId: String(row.source_id),
    updatedAt: String(row.updated_at),
  };
}

export class D1GradeEventStore implements GradeEventStore {
  constructor(private readonly db: D1Database) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredGradeEvent | null> {
    const row = await this.db
      .prepare('SELECT * FROM grade_events WHERE idempotency_key = ?')
      .bind(idempotencyKey)
      .first<Row>();
    return row ? storedEvent(row) : null;
  }

  async getSnapshot(gradeKey: string, field: GradeField): Promise<GradeSnapshot | null> {
    const row = await this.db
      .prepare('SELECT * FROM grade_snapshots WHERE grade_key = ? AND field = ?')
      .bind(gradeKey, field)
      .first<Row>();
    return row ? snapshot(row) : null;
  }

  async assertIngestionAllowed(input: GradeEventInput): Promise<void> {
    const context = await this.db
      .prepare(
        `SELECT
          ds.school_year_id AS source_year,
          ds.type AS source_type,
          ds.status AS source_status,
          ds.environment AS source_environment,
          tm.school_year_id AS model_year,
          tm.teacher_id AS model_teacher_id,
          tm.state AS model_state,
          tm.sync_enabled AS model_sync_enabled,
          tm.environment AS model_environment
        FROM data_sources ds
        JOIN teacher_models tm ON tm.id = ?
        WHERE ds.id = ?`,
      )
      .bind(input.teacherModelId, input.dataSourceId)
      .first<Row>();

    if (!context) throw new GradeEventForbiddenError('source_or_model_not_found');
    if (context.source_type !== 'linked_teacher_model' || context.source_status !== 'active') {
      throw new GradeEventForbiddenError('source_not_linked_or_active');
    }
    if (String(context.source_year) !== String(context.model_year)) {
      throw new GradeEventForbiddenError('source_model_year_mismatch');
    }
    if (context.model_state !== 'connected' || Number(context.model_sync_enabled) !== 1) {
      throw new GradeEventForbiddenError('teacher_model_sync_disabled');
    }
    if (String(context.source_environment) !== String(context.model_environment)) {
      throw new GradeEventForbiddenError('source_model_environment_mismatch');
    }

    const effectiveDate = input.clientSentAt.slice(0, 10);
    const authority = await this.db
      .prepare(
        `SELECT data_source_id, sync_enabled, scope
         FROM source_assignments
         WHERE school_year_id = ?
           AND status = 'active'
           AND authority = 'authoritative'
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to >= ?)
           AND (
             (scope = 'teacher_override' AND teacher_id = ?) OR
             (scope = 'school_year_default' AND teacher_id IS NULL)
           )
         ORDER BY CASE scope WHEN 'teacher_override' THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .bind(
        String(context.source_year),
        effectiveDate,
        effectiveDate,
        String(context.model_teacher_id),
      )
      .first<Row>();

    if (
      !authority ||
      String(authority.data_source_id) !== input.dataSourceId ||
      Number(authority.sync_enabled) !== 1
    ) {
      throw new GradeEventForbiddenError('source_not_authoritative_or_sync_disabled');
    }
  }

  async commit(command: GradeEventCommit, provenanceJson: string): Promise<GradeEventCommit> {
    const { event } = command;
    const value = splitValue(event.valueAfter);
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO grade_events
              (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
               source_id, teacher_model_id, sequence, value_numeric, value_text, is_absent,
               provenance_json, occurred_at, received_at)
             VALUES (?, ?, ?, ?, ?,
               CASE WHEN EXISTS (
                 SELECT 1 FROM grade_snapshots
                 WHERE grade_key = ? AND field = ? AND sequence >= ?
               ) THEN 'stale' ELSE 'applied' END,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            event.eventId,
            event.idempotencyKey,
            event.payloadHash,
            event.correlationId,
            event.eventType,
            event.gradeKey,
            event.field,
            event.sequence,
            event.gradeKey,
            event.field,
            event.sourceId,
            event.teacherModelId,
            event.sequence,
            value.numeric,
            value.text,
            event.isAbsent ? 1 : 0,
            provenanceJson,
            event.clientSentAt,
            event.receivedAt,
          ),
        this.db.prepare(
          `INSERT INTO grade_snapshots
             (grade_key, field, event_id, source_id, sequence, value_numeric, value_text, is_absent,
              ruleset_version_id, updated_at)
           SELECT grade_key, field, id, source_id, sequence, value_numeric, value_text, is_absent,
                  ruleset_version_id, received_at
           FROM grade_events
           WHERE id = ? AND status = 'applied'
           ON CONFLICT(grade_key, field) DO UPDATE SET
             event_id = excluded.event_id,
             source_id = excluded.source_id,
             sequence = excluded.sequence,
             value_numeric = excluded.value_numeric,
             value_text = excluded.value_text,
             is_absent = excluded.is_absent,
             ruleset_version_id = excluded.ruleset_version_id,
             updated_at = excluded.updated_at
           WHERE excluded.sequence > grade_snapshots.sequence`,
        ).bind(event.eventId),
      ]);
    } catch (error) {
      const existing = await this.findByIdempotencyKey(event.idempotencyKey);
      if (existing) {
        if (existing.payloadHash !== event.payloadHash) {
          throw new GradeEventConflictError('idempotency_payload_conflict');
        }
        return {
          event: existing,
          snapshot: await this.getSnapshot(existing.gradeKey, existing.field),
        };
      }
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new GradeEventConflictError('grade_event_identity_conflict');
      }
      throw error;
    }

    const committed = await this.findByIdempotencyKey(event.idempotencyKey);
    if (!committed) throw new Error('grade_event_commit_missing');
    return {
      event: committed,
      snapshot: await this.getSnapshot(committed.gradeKey, committed.field),
    };
  }
}
