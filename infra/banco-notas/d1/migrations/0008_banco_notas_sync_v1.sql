CREATE TABLE IF NOT EXISTS sync_configuration (
  id TEXT PRIMARY KEY CHECK (id = 'global'), sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK(sync_enabled IN(0,1)),
  commit_route_enabled INTEGER NOT NULL DEFAULT 0 CHECK(commit_route_enabled IN(0,1)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO sync_configuration(id,sync_enabled,commit_route_enabled) VALUES('global',0,0);

CREATE TABLE IF NOT EXISTS sync_pilot_eligibility (
  teacher_model_id TEXT PRIMARY KEY REFERENCES teacher_models(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
  starts_at TEXT, expires_at TEXT, approved_by TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(expires_at IS NULL OR starts_at IS NULL OR starts_at <= expires_at)
);

CREATE TABLE IF NOT EXISTS sync_attempts (
  request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, teacher_model_id TEXT REFERENCES teacher_models(id),
  teacher_model_version_id TEXT REFERENCES teacher_model_versions(id), actor_id TEXT REFERENCES teachers(id),
  status TEXT NOT NULL CHECK(status IN('committed','rejected','conflict','duplicate','failed')),
  change_count INTEGER NOT NULL DEFAULT 0, conflict_count INTEGER NOT NULL DEFAULT 0,
  reason_code TEXT, result_json TEXT NOT NULL DEFAULT '{}', duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_attempts_model_time ON sync_attempts(teacher_model_id,created_at DESC);

CREATE TABLE IF NOT EXISTS sync_attempt_invocations (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES sync_attempts(request_id), actor_id TEXT REFERENCES teachers(id),
  status TEXT NOT NULL CHECK(status='duplicate'), duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_attempt_invocations_request_time ON sync_attempt_invocations(request_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS sync_attempts_append_only_update BEFORE UPDATE ON sync_attempts BEGIN SELECT RAISE(ABORT,'sync_attempts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS sync_attempts_append_only_delete BEFORE DELETE ON sync_attempts BEGIN SELECT RAISE(ABORT,'sync_attempts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS sync_attempt_invocations_append_only_update BEFORE UPDATE ON sync_attempt_invocations BEGIN SELECT RAISE(ABORT,'sync attempt invocations are append-only'); END;
CREATE TRIGGER IF NOT EXISTS sync_attempt_invocations_append_only_delete BEFORE DELETE ON sync_attempt_invocations BEGIN SELECT RAISE(ABORT,'sync attempt invocations are append-only'); END;

CREATE TRIGGER IF NOT EXISTS grade_events_sync_v1_guards
BEFORE INSERT ON grade_events
WHEN json_extract(NEW.provenance_json,'$.syncVersion') = 1
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sync_configuration WHERE id='global' AND sync_enabled=1 AND commit_route_enabled=1)
    THEN RAISE(ABORT,'SYNC_DISABLED') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sync_pilot_eligibility p WHERE p.teacher_model_id=NEW.teacher_model_id AND p.enabled=1 AND (p.starts_at IS NULL OR p.starts_at<=CURRENT_TIMESTAMP) AND (p.expires_at IS NULL OR p.expires_at>=CURRENT_TIMESTAMP))
    THEN RAISE(ABORT,'PILOT_NOT_ALLOWED') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teacher_models model JOIN teachers teacher ON teacher.id=model.teacher_id WHERE model.id=NEW.teacher_model_id AND model.state='connected' AND model.sync_enabled=1 AND teacher.status='active' AND teacher.id=json_extract(NEW.provenance_json,'$.actorId'))
    THEN RAISE(ABORT,'OWNERSHIP_DENIED') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teacher_models model JOIN source_assignments assignment ON assignment.school_year_id=model.school_year_id AND (assignment.teacher_id=model.teacher_id OR assignment.teacher_id IS NULL) JOIN data_sources source ON source.id=assignment.data_source_id WHERE model.id=NEW.teacher_model_id AND source.id=NEW.source_id AND source.type='linked_teacher_model' AND source.status='active' AND source.environment=model.environment AND assignment.status='active' AND assignment.authority='authoritative' AND assignment.sync_enabled=1 AND assignment.effective_from<=date('now') AND (assignment.effective_to IS NULL OR assignment.effective_to>=date('now')))
    THEN RAISE(ABORT,'SOURCE_INVALID') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teacher_models model JOIN teacher_assignments assignment ON assignment.teacher_id=model.teacher_id AND assignment.school_year_id=model.school_year_id WHERE model.id=NEW.teacher_model_id AND assignment.status='active' AND assignment.effective_from<=date('now') AND (assignment.effective_to IS NULL OR assignment.effective_to>=date('now')) AND instr(NEW.grade_key,'|'||assignment.class_group_id||'|'||assignment.component_id||'|')>0)
    THEN RAISE(ABORT,'ASSIGNMENT_INACTIVE') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM grade_snapshots s WHERE s.grade_key=NEW.grade_key AND s.field=NEW.field AND s.event_id=json_extract(NEW.provenance_json,'$.baselineEventId') AND s.sequence=json_extract(NEW.provenance_json,'$.baselineSequence'))
    THEN RAISE(ABORT,'BASELINE_STALE') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teacher_model_versions v JOIN cell_mappings m ON m.teacher_model_version_id=v.id WHERE v.id=json_extract(NEW.provenance_json,'$.teacherModelVersionId') AND v.teacher_model_id=NEW.teacher_model_id AND v.version=(SELECT max(current.version) FROM teacher_model_versions current WHERE current.teacher_model_id=NEW.teacher_model_id) AND m.grade_key=NEW.grade_key AND m.field=NEW.field AND m.sheet_key=json_extract(NEW.provenance_json,'$.sheetKey') AND upper(m.cell_address)=upper(json_extract(NEW.provenance_json,'$.cellAddress')))
    THEN RAISE(ABORT,'MAPPING_MISMATCH') END;
END;
