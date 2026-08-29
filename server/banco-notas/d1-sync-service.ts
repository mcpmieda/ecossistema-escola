import type {
  SyncCommitRequest,
  SyncPreflightRequest,
  SyncResponse,
  SyncAttemptSummary,
  SyncReadinessReport,
} from '../../shared/banco-notas-sync';
import type { GradeValue } from '../../shared/banco-notas-grade-events';

type Row = Record<string, string | number | null>;
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function hash(value: unknown) {
  return hex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
  );
}
function split(v: GradeValue) {
  return typeof v === 'number'
    ? { n: v, t: null }
    : typeof v === 'string'
      ? { n: null, t: v }
      : { n: null, t: null };
}
function attemptFromRow(row: Row): SyncAttemptSummary {
  return {
    attemptId: String(row.attempt_id),
    requestId: String(row.request_id),
    teacherModelId: row.teacher_model_id ? String(row.teacher_model_id) : null,
    teacherModelVersionId: row.teacher_model_version_id
      ? String(row.teacher_model_version_id)
      : null,
    status: String(row.status) as SyncAttemptSummary['status'],
    changeCount: Number(row.change_count),
    conflictCount: Number(row.conflict_count),
    reasonCode: (row.reason_code
      ? String(row.reason_code)
      : null) as SyncAttemptSummary['reasonCode'],
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    createdAt: String(row.created_at),
    completedAt: String(row.completed_at),
  };
}

export class D1BancoNotasSyncService {
  constructor(private readonly db: D1Database) {}
  private async internalActorId(oid: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT id FROM teachers WHERE status='active' AND lower(entra_object_id)=lower(?)")
      .bind(oid)
      .first<Row>();
    return row ? String(row.id) : null;
  }
  private async recordDuplicate(requestId: string, actorId: string | null, durationMs: number) {
    await this.db
      .prepare(
        "INSERT INTO sync_attempt_invocations(id,request_id,actor_id,status,duration_ms) VALUES(?,?,?,'duplicate',?)",
      )
      .bind(crypto.randomUUID(), requestId, actorId, durationMs)
      .run();
  }
  private async recordAttempt(
    input: SyncCommitRequest,
    actorId: string | null,
    payloadHash: string,
    result: SyncResponse,
    modelId: string | null = null,
    versionId: string | null = null,
    durationMs: number | null = null,
  ) {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO sync_attempts(request_id,payload_hash,teacher_model_id,teacher_model_version_id,actor_id,status,change_count,conflict_count,reason_code,result_json,duration_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        input.requestId,
        payloadHash,
        modelId,
        versionId,
        actorId,
        result.status === 'conflict'
          ? 'conflict'
          : result.status === 'failed'
            ? 'failed'
            : 'rejected',
        result.changeCount,
        result.conflictCount,
        result.reasonCode ?? null,
        JSON.stringify(result),
        durationMs,
      )
      .run();
  }
  private async resolve(input: SyncPreflightRequest, oid: string) {
    const w = input.workbook;
    const model = await this.db
      .prepare(
        `SELECT model.id model_id,model.state,model.sync_enabled,model.teacher_id,model.environment model_environment,year.year school_year,version.id version_id,source.id source_id,source.environment source_environment,CASE WHEN version.version=(SELECT max(v.version) FROM teacher_model_versions v WHERE v.teacher_model_id=model.id) THEN 1 ELSE 0 END is_latest
      FROM teacher_model_versions version JOIN teacher_models model ON model.id=version.teacher_model_id
      JOIN teachers teacher ON teacher.id=model.teacher_id
      JOIN school_years year ON year.id=model.school_year_id
      LEFT JOIN source_assignments sa ON sa.school_year_id=model.school_year_id
        AND (sa.teacher_id=model.teacher_id OR (sa.teacher_id IS NULL AND NOT EXISTS(
          SELECT 1 FROM source_assignments teacher_override
          WHERE teacher_override.school_year_id=model.school_year_id
            AND teacher_override.teacher_id=model.teacher_id
            AND teacher_override.status='active' AND teacher_override.authority='authoritative'
            AND teacher_override.sync_enabled=1 AND teacher_override.effective_from<=date('now')
            AND (teacher_override.effective_to IS NULL OR teacher_override.effective_to>=date('now'))
        )))
        AND sa.status='active' AND sa.authority='authoritative' AND sa.sync_enabled=1
        AND sa.effective_from<=date('now') AND (sa.effective_to IS NULL OR sa.effective_to>=date('now'))
      LEFT JOIN data_sources source ON source.id=sa.data_source_id AND source.status='active' AND source.type='linked_teacher_model'
      WHERE version.mapping_version=? AND json_extract(version.provenance_json,'$.workbookModelId')=? AND json_extract(version.provenance_json,'$.sourceHash')=?
      AND json_extract(version.provenance_json,'$.relationshipSnapshotId')=? AND json_extract(version.provenance_json,'$.definitionVersion')=? AND json_extract(version.provenance_json,'$.layoutVersion')=? LIMIT 2`,
      )
      .bind(
        w.mappingVersion,
        w.workbookModelId,
        w.sourceHash,
        w.relationshipSnapshotId,
        w.definitionVersion,
        w.layoutVersion,
      )
      .all<Row>();
    if (model.results.length !== 1) return { reason: 'MODEL_MISSING' as const };
    const m = model.results[0]!;
    if (Number(m.school_year) !== w.schoolYear)
      return { reason: 'WORKBOOK_MISMATCH' as const, model: m };
    if (Number(m.is_latest) !== 1) return { reason: 'MODEL_VERSION_STALE' as const, model: m };
    const owner = await this.db
      .prepare(
        "SELECT 1 ok FROM teachers WHERE id=? AND status='active' AND lower(entra_object_id)=lower(?)",
      )
      .bind(m.teacher_id, oid)
      .first<Row>();
    if (!owner) return { reason: 'OWNERSHIP_DENIED' as const, model: m };
    if (m.state === 'suspended') return { reason: 'MODEL_SUSPENDED' as const, model: m };
    if (m.state !== 'connected' || Number(m.sync_enabled) !== 1)
      return { reason: 'SYNC_DISABLED' as const, model: m };
    if (!m.source_id || m.model_environment !== m.source_environment)
      return { reason: 'SOURCE_INVALID' as const, model: m };
    const cfg = await this.db
      .prepare("SELECT sync_enabled,commit_route_enabled FROM sync_configuration WHERE id='global'")
      .first<Row>();
    if (!cfg || Number(cfg.sync_enabled) !== 1 || Number(cfg.commit_route_enabled) !== 1)
      return { reason: 'SYNC_DISABLED' as const, model: m };
    const pilot = await this.db
      .prepare(
        'SELECT 1 ok FROM sync_pilot_eligibility WHERE teacher_model_id=? AND enabled=1 AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (expires_at IS NULL OR expires_at>=CURRENT_TIMESTAMP)',
      )
      .bind(m.model_id)
      .first<Row>();
    if (!pilot) return { reason: 'PILOT_NOT_ALLOWED' as const, model: m };
    if (input.changes.length === 0) return { reason: 'NO_CHANGES' as const, model: m };
    const resolved = [] as Array<{
      grade_key: string;
      event_id: string;
      sequence: number;
      input: SyncPreflightRequest['changes'][number];
    }>;
    const requestedJson = JSON.stringify(
      input.changes.map((change, index) => ({
        index,
        cellAddress: change.cellAddress,
        field: change.field,
      })),
    );
    const rows = await this.db
      .prepare(
        `WITH requested AS (SELECT CAST(key AS INTEGER) request_index,json_extract(value,'$.cellAddress') cell_address,json_extract(value,'$.field') field FROM json_each(?)) SELECT requested.request_index,cm.grade_key,s.event_id,s.sequence,CASE WHEN EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id=? AND ta.status='active' AND instr(cm.grade_key,'|'||ta.class_group_id||'|'||ta.component_id||'|')>0 AND ta.effective_from<=date('now') AND (ta.effective_to IS NULL OR ta.effective_to>=date('now'))) THEN 1 ELSE 0 END assignment_active FROM requested LEFT JOIN cell_mappings cm ON cm.teacher_model_version_id=? AND cm.sheet_key=? AND upper(cm.cell_address)=upper(requested.cell_address) AND cm.field=requested.field LEFT JOIN grade_snapshots s ON s.grade_key=cm.grade_key AND s.field=cm.field ORDER BY requested.request_index`,
      )
      .bind(requestedJson, m.teacher_id, m.version_id, w.sheetKey)
      .all<Row>();
    if (rows.results.length !== input.changes.length)
      return { reason: 'MAPPING_MISMATCH' as const, model: m };
    for (const x of rows.results) {
      const change = input.changes[Number(x.request_index)];
      if (!change || !x.grade_key) return { reason: 'MAPPING_MISMATCH' as const, model: m };
      if (Number(x.assignment_active) !== 1)
        return { reason: 'ASSIGNMENT_INACTIVE' as const, model: m };
      if (
        String(x.event_id) !== change.baselineEventId ||
        Number(x.sequence) !== change.baselineSequence
      )
        return { reason: 'BASELINE_STALE' as const, model: m };
      resolved.push({
        grade_key: String(x.grade_key),
        event_id: String(x.event_id),
        sequence: Number(x.sequence),
        input: change,
      });
    }
    return { model: m, resolved, cfg };
  }
  async preflight(input: SyncPreflightRequest, oid: string): Promise<SyncResponse> {
    const r = await this.resolve(input, oid);
    if ('reason' in r) {
      const result: SyncResponse = {
        schemaVersion: 1,
        requestId: input.requestId,
        status: r.reason === 'BASELINE_STALE' ? 'conflict' : 'blocked',
        reasonCode: r.reason,
        changeCount: input.changes.length,
        conflictCount: r.reason === 'BASELINE_STALE' ? 1 : 0,
      };
      return result;
    }
    return {
      schemaVersion: 1,
      requestId: input.requestId,
      status: 'ready',
      changeCount: input.changes.length,
      conflictCount: 0,
      preflightFingerprint: await hash({
        requestId: input.requestId,
        version: r.model.version_id,
        changes: input.changes,
      }),
    };
  }
  async outcome(requestId: string, oid: string): Promise<SyncResponse | null> {
    const actorId = await this.internalActorId(oid);
    if (!actorId) return null;
    const row = await this.db
      .prepare('SELECT result_json FROM sync_attempts WHERE request_id=? AND actor_id=?')
      .bind(requestId, actorId)
      .first<Row>();
    return row ? (JSON.parse(String(row.result_json)) as SyncResponse) : null;
  }
  async listAttempts(query: {
    status?: string;
    teacherModelId?: string;
    limit: number;
  }): Promise<SyncAttemptSummary[]> {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (query.status) {
      clauses.push('status=?');
      values.push(query.status);
    }
    if (query.teacherModelId) {
      clauses.push('teacher_model_id=?');
      values.push(query.teacherModelId);
    }
    values.push(query.limit);
    const rows = await this.db
      .prepare(
        `WITH visible_attempts AS (
          SELECT request_id attempt_id,request_id,teacher_model_id,teacher_model_version_id,status,change_count,conflict_count,reason_code,duration_ms,created_at,completed_at FROM sync_attempts
          UNION ALL
          SELECT invocation.id,invocation.request_id,attempt.teacher_model_id,attempt.teacher_model_version_id,'duplicate',attempt.change_count,0,'DUPLICATE_REQUEST',invocation.duration_ms,invocation.created_at,invocation.created_at
          FROM sync_attempt_invocations invocation JOIN sync_attempts attempt ON attempt.request_id=invocation.request_id
        ) SELECT attempt_id,request_id,teacher_model_id,teacher_model_version_id,status,change_count,conflict_count,reason_code,duration_ms,created_at,completed_at FROM visible_attempts ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at DESC,attempt_id LIMIT ?`,
      )
      .bind(...values)
      .all<Row>();
    return rows.results.map(attemptFromRow);
  }
  async attemptDetail(requestId: string): Promise<SyncAttemptSummary | null> {
    const row = await this.db
      .prepare(
        'SELECT request_id attempt_id,request_id,teacher_model_id,teacher_model_version_id,status,change_count,conflict_count,reason_code,duration_ms,created_at,completed_at FROM sync_attempts WHERE request_id=?',
      )
      .bind(requestId)
      .first<Row>();
    return row ? attemptFromRow(row) : null;
  }
  async readiness(): Promise<SyncReadinessReport> {
    const [configuration, models] = await Promise.all([
      this.db
        .prepare(
          "SELECT sync_enabled,commit_route_enabled FROM sync_configuration WHERE id='global'",
        )
        .first<Row>(),
      this.db
        .prepare(
          `SELECT model.id teacher_model_id,model.school_year_id,model.state,model.sync_enabled,
            teacher.status teacher_status,CASE WHEN teacher.entra_object_id IS NOT NULL THEN 1 ELSE 0 END has_identity,
            version.id version_id,
            (SELECT count(*) FROM cell_mappings mapping WHERE mapping.teacher_model_version_id=version.id) mapping_count,
            (SELECT count(*) FROM cell_mappings mapping JOIN grade_snapshots snapshot ON snapshot.grade_key=mapping.grade_key AND snapshot.field=mapping.field WHERE mapping.teacher_model_version_id=version.id) baseline_count,
            (SELECT count(*) FROM cell_mappings mapping WHERE mapping.teacher_model_version_id=version.id AND EXISTS(SELECT 1 FROM teacher_assignments assignment WHERE assignment.teacher_id=model.teacher_id AND assignment.school_year_id=model.school_year_id AND assignment.status='active' AND assignment.effective_from<=date('now') AND (assignment.effective_to IS NULL OR assignment.effective_to>=date('now')) AND instr(mapping.grade_key,'|'||assignment.class_group_id||'|'||assignment.component_id||'|')>0)) assignment_count,
            CASE WHEN EXISTS(SELECT 1 FROM source_assignments authority JOIN data_sources source ON source.id=authority.data_source_id WHERE authority.school_year_id=model.school_year_id AND (authority.teacher_id=model.teacher_id OR authority.teacher_id IS NULL) AND authority.status='active' AND authority.authority='authoritative' AND authority.sync_enabled=1 AND authority.effective_from<=date('now') AND (authority.effective_to IS NULL OR authority.effective_to>=date('now')) AND source.type='linked_teacher_model' AND source.status='active' AND source.environment=model.environment) THEN 1 ELSE 0 END source_ready,
            CASE WHEN EXISTS(SELECT 1 FROM sync_pilot_eligibility pilot WHERE pilot.teacher_model_id=model.id AND pilot.enabled=1 AND (pilot.starts_at IS NULL OR pilot.starts_at<=CURRENT_TIMESTAMP) AND (pilot.expires_at IS NULL OR pilot.expires_at>=CURRENT_TIMESTAMP)) THEN 1 ELSE 0 END pilot_eligible
          FROM teacher_models model JOIN teachers teacher ON teacher.id=model.teacher_id
          LEFT JOIN teacher_model_versions version ON version.id=(SELECT candidate.id FROM teacher_model_versions candidate WHERE candidate.teacher_model_id=model.id ORDER BY candidate.version DESC LIMIT 1)
          WHERE model.state<>'archived' ORDER BY model.school_year_id,model.id`,
        )
        .all<Row>(),
    ]);
    const items = models.results.map((row) => {
      const reasons: SyncReadinessReport['items'][number]['reasons'] = [];
      let blocked = false;
      if (row.teacher_status !== 'active' || Number(row.has_identity) !== 1) {
        reasons.push('OWNERSHIP_DENIED');
        blocked = true;
      }
      if (row.state === 'suspended') {
        reasons.push('MODEL_SUSPENDED');
        blocked = true;
      } else if (row.state !== 'connected' || Number(row.sync_enabled) !== 1) {
        reasons.push('SYNC_DISABLED');
      }
      if (!row.version_id) reasons.push('MODEL_MISSING');
      const mappingCount = Number(row.mapping_count ?? 0);
      if (mappingCount === 0) reasons.push('MAPPING_MISMATCH');
      if (mappingCount > 0 && Number(row.assignment_count ?? 0) !== mappingCount)
        reasons.push('ASSIGNMENT_INACTIVE');
      if (Number(row.source_ready) !== 1) reasons.push('SOURCE_INVALID');
      if (mappingCount > 0 && Number(row.baseline_count ?? 0) !== mappingCount)
        reasons.push('BASELINE_STALE');
      return {
        teacherModelId: String(row.teacher_model_id),
        schoolYearId: String(row.school_year_id),
        status: blocked
          ? ('blocked' as const)
          : reasons.length
            ? ('needs_attention' as const)
            : ('ready' as const),
        reasons,
        pilotEligible: Number(row.pilot_eligible) === 1,
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      globalSyncEnabled: Number(configuration?.sync_enabled ?? 0) === 1,
      commitRouteEnabled: Number(configuration?.commit_route_enabled ?? 0) === 1,
      counts: {
        ready: items.filter((item) => item.status === 'ready').length,
        blocked: items.filter((item) => item.status === 'blocked').length,
        needsAttention: items.filter((item) => item.status === 'needs_attention').length,
      },
      items,
    };
  }
  async commit(input: SyncCommitRequest, oid: string): Promise<SyncResponse> {
    const startedAt = Date.now();
    const actorId = await this.internalActorId(oid);
    const payloadHash = await hash(input);
    const prior = await this.db
      .prepare(
        'SELECT payload_hash,result_json FROM sync_attempts WHERE request_id=? AND actor_id=?',
      )
      .bind(input.requestId, actorId)
      .first<Row>();
    if (prior) {
      if (prior.payload_hash !== payloadHash)
        return {
          schemaVersion: 1,
          requestId: input.requestId,
          status: 'conflict',
          reasonCode: 'CONFLICT',
          changeCount: input.changes.length,
          conflictCount: 1,
        };
      const saved = JSON.parse(String(prior.result_json)) as SyncResponse;
      await this.recordDuplicate(input.requestId, actorId, Date.now() - startedAt);
      return { ...saved, status: 'duplicate', reasonCode: 'DUPLICATE_REQUEST' };
    }
    const r = await this.resolve(input, oid);
    if ('reason' in r) {
      const blockedModel = r.model;
      const result: SyncResponse = {
        schemaVersion: 1,
        requestId: input.requestId,
        status: r.reason === 'BASELINE_STALE' ? 'conflict' : 'blocked',
        reasonCode: r.reason,
        changeCount: input.changes.length,
        conflictCount: r.reason === 'BASELINE_STALE' ? 1 : 0,
      };
      await this.recordAttempt(
        input,
        actorId,
        payloadHash,
        result,
        blockedModel ? String(blockedModel.model_id) : null,
        blockedModel ? String(blockedModel.version_id) : null,
        Date.now() - startedAt,
      );
      return result;
    }
    const expected = await hash({
      requestId: input.requestId,
      version: r.model.version_id,
      changes: input.changes,
    });
    if (expected !== input.preflightFingerprint) {
      const result: SyncResponse = {
        schemaVersion: 1,
        requestId: input.requestId,
        status: 'conflict',
        reasonCode: 'MODEL_VERSION_STALE',
        changeCount: input.changes.length,
        conflictCount: 1,
      };
      await this.recordAttempt(
        input,
        actorId,
        payloadHash,
        result,
        String(r.model.model_id),
        String(r.model.version_id),
        Date.now() - startedAt,
      );
      return result;
    }
    const ids: string[] = [];
    const statements: D1PreparedStatement[] = [];
    for (const x of r.resolved) {
      const id = crypto.randomUUID();
      ids.push(id);
      const v = split(x.input.valueAfter);
      const provenance = JSON.stringify({
        syncVersion: 1,
        requestId: input.requestId,
        actorId,
        teacherModelVersionId: r.model.version_id,
        baselineEventId: x.input.baselineEventId,
        baselineSequence: x.input.baselineSequence,
        cellAddress: x.input.cellAddress,
        sheetKey: input.workbook.sheetKey,
      });
      statements.push(
        this.db
          .prepare(
            `INSERT INTO grade_events(id,idempotency_key,payload_hash,correlation_id,event_type,status,grade_key,field,source_id,teacher_model_id,sequence,value_numeric,value_text,is_absent,provenance_json,occurred_at,received_at) VALUES(?,?,?,?,?,'applied',?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
          )
          .bind(
            id,
            `${input.requestId}:${x.input.cellAddress}:${x.input.field}`,
            payloadHash,
            input.requestId,
            'grade.changed',
            x.grade_key,
            x.input.field,
            r.model.source_id,
            r.model.model_id,
            Number(x.sequence) + 1,
            v.n,
            v.t,
            x.input.isAbsent ? 1 : 0,
            provenance,
          ),
      );
      statements.push(
        this.db
          .prepare(
            `INSERT INTO grade_snapshots(grade_key,field,event_id,source_id,sequence,value_numeric,value_text,is_absent,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(grade_key,field) DO UPDATE SET event_id=excluded.event_id,source_id=excluded.source_id,sequence=excluded.sequence,value_numeric=excluded.value_numeric,value_text=excluded.value_text,is_absent=excluded.is_absent,updated_at=excluded.updated_at`,
          )
          .bind(
            x.grade_key,
            x.input.field,
            id,
            r.model.source_id,
            Number(x.sequence) + 1,
            v.n,
            v.t,
            x.input.isAbsent ? 1 : 0,
          ),
      );
    }
    const result: SyncResponse = {
      schemaVersion: 1,
      requestId: input.requestId,
      status: 'committed',
      changeCount: input.changes.length,
      conflictCount: 0,
      eventIds: ids,
    };
    statements.push(
      this.db
        .prepare(
          `INSERT INTO sync_attempts(request_id,payload_hash,teacher_model_id,teacher_model_version_id,actor_id,status,change_count,conflict_count,result_json,duration_ms) VALUES(?,?,?,?,?,'committed',?,0,?,?)`,
        )
        .bind(
          input.requestId,
          payloadHash,
          r.model.model_id,
          r.model.version_id,
          actorId,
          input.changes.length,
          JSON.stringify(result),
          Date.now() - startedAt,
        ),
    );
    try {
      await this.db.batch(statements);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const concurrent = await this.db
        .prepare(
          'SELECT payload_hash,result_json FROM sync_attempts WHERE request_id=? AND actor_id=?',
        )
        .bind(input.requestId, actorId)
        .first<Row>();
      if (concurrent && concurrent.payload_hash === payloadHash) {
        await this.recordDuplicate(input.requestId, actorId, Date.now() - startedAt);
        return {
          ...(JSON.parse(String(concurrent.result_json)) as SyncResponse),
          status: 'duplicate',
          reasonCode: 'DUPLICATE_REQUEST',
        };
      }
      const failed: SyncResponse = {
        schemaVersion: 1,
        requestId: input.requestId,
        status: msg.includes('BASELINE_STALE') ? 'conflict' : 'failed',
        reasonCode: msg.includes('BASELINE_STALE') ? 'BASELINE_STALE' : 'CONFLICT',
        changeCount: input.changes.length,
        conflictCount: 1,
      };
      await this.recordAttempt(
        input,
        actorId,
        payloadHash,
        failed,
        String(r.model.model_id),
        String(r.model.version_id),
        Date.now() - startedAt,
      );
      return failed;
    }
  }
}
