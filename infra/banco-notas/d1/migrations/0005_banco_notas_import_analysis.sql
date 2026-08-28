CREATE TABLE IF NOT EXISTS import_analyses (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id),
  analyzer_id TEXT NOT NULL,
  analysis_version TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN ('xlsb', 'xlsx')),
  school_year INTEGER NOT NULL,
  model_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (import_job_id)
);

CREATE INDEX IF NOT EXISTS idx_import_analyses_job
  ON import_analyses(import_job_id, created_at);

CREATE TRIGGER IF NOT EXISTS import_analyses_integrity_insert
BEFORE INSERT ON import_analyses
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM import_jobs job
      JOIN school_years school_year ON school_year.id = job.school_year_id
      WHERE job.id = NEW.import_job_id
        AND job.state = 'draft'
        AND job.source_hash = NEW.source_hash
        AND school_year.year = NEW.school_year
        AND json_extract(job.provenance_json, '$.sourceFormat') = NEW.source_format
    )
    THEN RAISE(ABORT, 'import analysis provenance mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS import_analyses_append_only_update
BEFORE UPDATE ON import_analyses
BEGIN
  SELECT RAISE(ABORT, 'import_analyses are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_analyses_append_only_delete
BEFORE DELETE ON import_analyses
BEGIN
  SELECT RAISE(ABORT, 'import_analyses are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_jobs_analyzed_requires_analysis
BEFORE UPDATE OF state ON import_jobs
WHEN NEW.state = 'analyzed'
  AND NOT EXISTS (
    SELECT 1 FROM import_analyses analysis WHERE analysis.import_job_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'import job analysis artifact required');
END;
