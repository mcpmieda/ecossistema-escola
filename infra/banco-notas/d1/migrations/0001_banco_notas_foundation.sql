PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS school_years (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE CHECK (year BETWEEN 2000 AND 2200),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'closed')),
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (starts_on <= ends_on)
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  external_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_groups (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  external_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_year_id, external_id),
  UNIQUE (school_year_id, name)
);

CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  external_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_year_id, external_id),
  UNIQUE (school_year_id, name)
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  external_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  teacher_id TEXT NOT NULL REFERENCES teachers(id),
  class_group_id TEXT NOT NULL REFERENCES class_groups(id),
  component_id TEXT NOT NULL REFERENCES components(id),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (effective_to IS NULL OR effective_from <= effective_to),
  UNIQUE (school_year_id, teacher_id, class_group_id, component_id, effective_from)
);

CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  type TEXT NOT NULL CHECK (type IN ('legacy_import', 'linked_teacher_model')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT 'homologation' CHECK (environment IN ('homologation', 'production')),
  migration_state TEXT NOT NULL DEFAULT 'not_started' CHECK (migration_state IN ('not_started', 'preparing', 'reconciling', 'ready', 'blocked')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_year_id, name)
);

CREATE TABLE IF NOT EXISTS source_assignments (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  data_source_id TEXT NOT NULL REFERENCES data_sources(id),
  teacher_id TEXT REFERENCES teachers(id),
  scope TEXT NOT NULL CHECK (scope IN ('school_year_default', 'teacher_override')),
  authority TEXT NOT NULL DEFAULT 'authoritative' CHECK (authority IN ('authoritative', 'reference_only')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'superseded')),
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0, 1)),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  operator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (effective_to IS NULL OR effective_from <= effective_to),
  CHECK (
    (scope = 'school_year_default' AND teacher_id IS NULL) OR
    (scope = 'teacher_override' AND teacher_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS relationship_snapshots (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  source_id TEXT REFERENCES data_sources(id),
  version INTEGER NOT NULL CHECK (version > 0),
  content_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_year_id, version),
  UNIQUE (content_hash)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  teacher_id TEXT REFERENCES teachers(id),
  data_source_id TEXT NOT NULL REFERENCES data_sources(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'analyzed', 'generated', 'validated', 'ready_to_share', 'shared', 'connected', 'failed')),
  provenance_json TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (data_source_id, source_hash)
);

CREATE TABLE IF NOT EXISTS import_findings (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  code TEXT NOT NULL,
  location_json TEXT NOT NULL,
  details_json TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_models (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  teacher_id TEXT NOT NULL REFERENCES teachers(id),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'validated', 'ready_to_share', 'shared', 'connected', 'suspended', 'archived')),
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0, 1)),
  environment TEXT NOT NULL DEFAULT 'homologation' CHECK (environment IN ('homologation', 'production')),
  drive_item_id TEXT,
  last_reconciled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_year_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS teacher_model_versions (
  id TEXT PRIMARY KEY,
  teacher_model_id TEXT NOT NULL REFERENCES teacher_models(id),
  version INTEGER NOT NULL CHECK (version > 0),
  model_hash TEXT NOT NULL,
  mapping_version INTEGER NOT NULL CHECK (mapping_version > 0),
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (teacher_model_id, version),
  UNIQUE (teacher_model_id, model_hash)
);

CREATE TABLE IF NOT EXISTS cell_mappings (
  id TEXT PRIMARY KEY,
  teacher_model_version_id TEXT NOT NULL REFERENCES teacher_model_versions(id),
  grade_key TEXT NOT NULL,
  sheet_key TEXT NOT NULL,
  cell_address TEXT NOT NULL,
  field TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (teacher_model_version_id, grade_key, field),
  UNIQUE (teacher_model_version_id, sheet_key, cell_address)
);

CREATE TABLE IF NOT EXISTS rulesets (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_year_id, name)
);

CREATE TABLE IF NOT EXISTS ruleset_versions (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id),
  version INTEGER NOT NULL CHECK (version > 0),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  rules_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (effective_to IS NULL OR effective_from <= effective_to),
  UNIQUE (ruleset_id, version)
);

CREATE TABLE IF NOT EXISTS grade_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('grade.changed', 'grade.recalculated', 'grade.reverted')),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'stale', 'recalculated', 'reverted', 'rejected')),
  grade_key TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES data_sources(id),
  teacher_model_id TEXT REFERENCES teacher_models(id),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  value_numeric REAL,
  value_text TEXT,
  is_absent INTEGER NOT NULL DEFAULT 0 CHECK (is_absent IN (0, 1)),
  provenance_json TEXT NOT NULL,
  ruleset_version_id TEXT REFERENCES ruleset_versions(id),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (is_absent = 1 AND value_numeric IS NULL AND value_text IS NULL) OR
    (is_absent = 0 AND NOT (value_numeric IS NOT NULL AND value_text IS NOT NULL))
  ),
  UNIQUE (source_id, grade_key, sequence)
);

CREATE TABLE IF NOT EXISTS grade_snapshots (
  grade_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES grade_events(id),
  source_id TEXT NOT NULL REFERENCES data_sources(id),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  value_numeric REAL,
  value_text TEXT,
  is_absent INTEGER NOT NULL CHECK (is_absent IN (0, 1)),
  ruleset_version_id TEXT REFERENCES ruleset_versions(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (is_absent = 1 AND value_numeric IS NULL AND value_text IS NULL) OR
    (is_absent = 0 AND NOT (value_numeric IS NOT NULL AND value_text IS NOT NULL))
  )
);

CREATE TABLE IF NOT EXISTS share_audit (
  id TEXT PRIMARY KEY,
  teacher_model_id TEXT NOT NULL REFERENCES teacher_models(id),
  recipient_object_id TEXT NOT NULL,
  recipient_upn TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('requested', 'succeeded', 'failed', 'revoked')),
  correlation_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id TEXT PRIMARY KEY,
  teacher_model_id TEXT NOT NULL REFERENCES teacher_models(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'matched', 'diverged', 'failed')),
  correlation_id TEXT NOT NULL,
  findings_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'banco-de-notas',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_data_sources_year ON data_sources(school_year_id, status, type);
CREATE INDEX IF NOT EXISTS idx_source_assignments_effective ON source_assignments(school_year_id, teacher_id, status, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_lookup ON teacher_assignments(school_year_id, teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_students_external ON students(external_id);
CREATE INDEX IF NOT EXISTS idx_import_findings_job ON import_findings(import_job_id, severity);
CREATE INDEX IF NOT EXISTS idx_teacher_models_year ON teacher_models(school_year_id, state);
CREATE INDEX IF NOT EXISTS idx_grade_events_key ON grade_events(grade_key, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_grade_events_correlation ON grade_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_model ON reconciliation_runs(teacher_model_id, started_at DESC);

CREATE TRIGGER IF NOT EXISTS source_assignments_no_authority_overlap_insert
BEFORE INSERT ON source_assignments
WHEN NEW.status = 'active' AND NEW.authority = 'authoritative'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM source_assignments current
    WHERE current.school_year_id = NEW.school_year_id
      AND current.scope = NEW.scope
      AND COALESCE(current.teacher_id, '') = COALESCE(NEW.teacher_id, '')
      AND current.status = 'active'
      AND current.authority = 'authoritative'
      AND COALESCE(current.effective_to, '9999-12-31') >= NEW.effective_from
      AND COALESCE(NEW.effective_to, '9999-12-31') >= current.effective_from
  ) THEN RAISE(ABORT, 'authoritative source assignment overlap') END;
END;

CREATE TRIGGER IF NOT EXISTS source_assignments_no_authority_overlap_update
BEFORE UPDATE ON source_assignments
WHEN NEW.status = 'active' AND NEW.authority = 'authoritative'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM source_assignments current
    WHERE current.id <> NEW.id
      AND current.school_year_id = NEW.school_year_id
      AND current.scope = NEW.scope
      AND COALESCE(current.teacher_id, '') = COALESCE(NEW.teacher_id, '')
      AND current.status = 'active'
      AND current.authority = 'authoritative'
      AND COALESCE(current.effective_to, '9999-12-31') >= NEW.effective_from
      AND COALESCE(NEW.effective_to, '9999-12-31') >= current.effective_from
  ) THEN RAISE(ABORT, 'authoritative source assignment overlap') END;
END;

CREATE TRIGGER IF NOT EXISTS grade_events_append_only_update
BEFORE UPDATE ON grade_events
BEGIN
  SELECT RAISE(ABORT, 'grade_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS grade_events_append_only_delete
BEFORE DELETE ON grade_events
BEGIN
  SELECT RAISE(ABORT, 'grade_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_append_only_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_append_only_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;
