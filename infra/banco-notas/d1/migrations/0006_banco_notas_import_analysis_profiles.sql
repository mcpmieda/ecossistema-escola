CREATE TABLE IF NOT EXISTS import_analysis_profiles (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  data_source_id TEXT NOT NULL REFERENCES data_sources(id),
  source_format TEXT NOT NULL DEFAULT 'xlsx' CHECK (source_format = 'xlsx'),
  profile_id TEXT NOT NULL,
  analysis_version TEXT NOT NULL,
  profile_hash TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (data_source_id, profile_id, analysis_version),
  UNIQUE (data_source_id, profile_hash)
);

CREATE TABLE IF NOT EXISTS import_job_analysis_profiles (
  import_job_id TEXT PRIMARY KEY REFERENCES import_jobs(id),
  analysis_profile_id TEXT NOT NULL REFERENCES import_analysis_profiles(id),
  attached_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  attached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_analysis_profiles_source
ON import_analysis_profiles(school_year_id, data_source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_job_analysis_profiles_profile
ON import_job_analysis_profiles(analysis_profile_id, attached_at DESC);

CREATE TRIGGER IF NOT EXISTS import_analysis_profiles_source_integrity
BEFORE INSERT ON import_analysis_profiles
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM data_sources source
    WHERE source.id = NEW.data_source_id
      AND source.school_year_id = NEW.school_year_id
      AND source.type = 'legacy_import'
  ) THEN RAISE(ABORT, 'import analysis profile source mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS import_analysis_profiles_append_only_update
BEFORE UPDATE ON import_analysis_profiles
BEGIN
  SELECT RAISE(ABORT, 'import_analysis_profiles are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_analysis_profiles_append_only_delete
BEFORE DELETE ON import_analysis_profiles
BEGIN
  SELECT RAISE(ABORT, 'import_analysis_profiles are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_job_analysis_profiles_integrity
BEFORE INSERT ON import_job_analysis_profiles
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM import_jobs job
    JOIN import_analysis_profiles profile
      ON profile.id = NEW.analysis_profile_id
    WHERE job.id = NEW.import_job_id
      AND job.state = 'draft'
      AND job.school_year_id = profile.school_year_id
      AND job.data_source_id = profile.data_source_id
      AND json_extract(job.provenance_json, '$.sourceFormat') = 'xlsx'
      AND profile.source_format = 'xlsx'
  ) THEN RAISE(ABORT, 'import analysis profile job mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS import_job_analysis_profiles_append_only_update
BEFORE UPDATE ON import_job_analysis_profiles
BEGIN
  SELECT RAISE(ABORT, 'import_job_analysis_profiles are append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_job_analysis_profiles_append_only_delete
BEFORE DELETE ON import_job_analysis_profiles
BEGIN
  SELECT RAISE(ABORT, 'import_job_analysis_profiles are append-only');
END;
