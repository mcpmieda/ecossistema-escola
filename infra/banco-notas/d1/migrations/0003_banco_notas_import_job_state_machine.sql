CREATE TRIGGER IF NOT EXISTS import_jobs_state_transition_guard
BEFORE UPDATE OF state ON import_jobs
WHEN NEW.state <> OLD.state
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.state = 'draft' AND NEW.state IN ('analyzed', 'failed')) OR
    (OLD.state = 'analyzed' AND NEW.state IN ('generated', 'failed')) OR
    (OLD.state = 'generated' AND NEW.state IN ('validated', 'failed')) OR
    (OLD.state = 'validated' AND NEW.state IN ('ready_to_share', 'failed')) OR
    (OLD.state = 'ready_to_share' AND NEW.state IN ('shared', 'failed')) OR
    (OLD.state = 'shared' AND NEW.state IN ('connected', 'failed'))
  ) THEN RAISE(ABORT, 'invalid import job state transition') END;
END;

CREATE TRIGGER IF NOT EXISTS import_findings_append_only_update
BEFORE UPDATE ON import_findings
BEGIN
  SELECT RAISE(ABORT, 'import_findings are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_findings_append_only_delete
BEFORE DELETE ON import_findings
BEGIN
  SELECT RAISE(ABORT, 'import_findings are append-only');
END;
