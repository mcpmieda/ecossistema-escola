PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_file_versions_confirmed_source
  ON source_file_versions (
    academic_year_id,
    manifest_id,
    version,
    confirmed_logical_source_id
  );

CREATE TABLE IF NOT EXISTS logical_source_record_streams (
  academic_year_id TEXT NOT NULL,
  logical_source_id TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK (
    record_kind IN ('grade-entry', 'term-result', 'final-recovery', 'annual-result')
  ),
  stream_key TEXT NOT NULL CHECK (length(stream_key) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  current_state TEXT NOT NULL CHECK (current_state IN ('active', 'inactive')),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, logical_source_id, record_kind, stream_key),
  FOREIGN KEY (academic_year_id, logical_source_id)
    REFERENCES logical_sources (academic_year_id, logical_source_id),
  FOREIGN KEY (academic_year_id, record_kind, stream_key)
    REFERENCES academic_record_streams (academic_year_id, record_kind, stream_key)
) STRICT;

CREATE TABLE IF NOT EXISTS logical_source_record_versions (
  academic_year_id TEXT NOT NULL,
  logical_source_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  association_state TEXT NOT NULL CHECK (association_state IN ('active', 'inactive')),
  source_manifest_id TEXT NOT NULL,
  source_manifest_version INTEGER NOT NULL CHECK (source_manifest_version >= 1),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (
    academic_year_id,
    logical_source_id,
    record_kind,
    stream_key,
    version
  ),
  FOREIGN KEY (academic_year_id, logical_source_id, record_kind, stream_key)
    REFERENCES logical_source_record_streams (
      academic_year_id,
      logical_source_id,
      record_kind,
      stream_key
    ),
  FOREIGN KEY (
    academic_year_id,
    source_manifest_id,
    source_manifest_version,
    logical_source_id
  ) REFERENCES source_file_versions (
    academic_year_id,
    manifest_id,
    version,
    confirmed_logical_source_id
  ),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_logical_source_record_streams_current
  ON logical_source_record_streams (
    academic_year_id,
    logical_source_id,
    record_kind,
    stream_key
  )
  WHERE current_state = 'active';

CREATE INDEX IF NOT EXISTS idx_logical_source_record_versions_history
  ON logical_source_record_versions (
    academic_year_id,
    logical_source_id,
    record_kind,
    stream_key,
    version DESC
  );

CREATE INDEX IF NOT EXISTS idx_logical_source_record_versions_manifest
  ON logical_source_record_versions (
    academic_year_id,
    source_manifest_id,
    source_manifest_version,
    logical_source_id
  );

INSERT OR IGNORE INTO gradebook_schema_migrations (version, name, applied_at)
VALUES (
  3,
  'logical_source_record_catalog_v1',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
