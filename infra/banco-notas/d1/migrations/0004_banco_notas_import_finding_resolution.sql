CREATE TABLE IF NOT EXISTS import_finding_resolutions (
  id TEXT PRIMARY KEY,
  import_finding_id TEXT NOT NULL REFERENCES import_findings(id),
  resolved_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (import_finding_id)
);

CREATE INDEX IF NOT EXISTS idx_import_finding_resolutions_finding
  ON import_finding_resolutions(import_finding_id, resolved_at);

CREATE TRIGGER IF NOT EXISTS import_finding_resolutions_append_only_update
BEFORE UPDATE ON import_finding_resolutions
BEGIN
  SELECT RAISE(ABORT, 'import_finding_resolutions are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_finding_resolutions_append_only_delete
BEFORE DELETE ON import_finding_resolutions
BEGIN
  SELECT RAISE(ABORT, 'import_finding_resolutions are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_jobs_state_reentry_guard
BEFORE UPDATE OF state ON import_jobs
WHEN NEW.state = OLD.state
BEGIN
  SELECT RAISE(ABORT, 'import job state re-entry is not allowed');
END;
