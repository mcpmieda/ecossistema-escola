PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gradebook_import_stage_sessions (
  session_id TEXT NOT NULL CHECK (length(session_id) > 0),
  academic_year_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  expected_chunk_count INTEGER NOT NULL CHECK (expected_chunk_count >= 1 AND expected_chunk_count <= 512),
  state TEXT NOT NULL CHECK (state IN ('preparing', 'committed', 'blocked')),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  meta_write_json TEXT CHECK (meta_write_json IS NULL OR json_valid(meta_write_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  expires_at TEXT NOT NULL CHECK (length(expires_at) > 0),
  committed_at TEXT,
  PRIMARY KEY (session_id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id),
  CHECK (
    (state = 'committed' AND committed_at IS NOT NULL AND result_json IS NOT NULL)
    OR (state <> 'committed' AND committed_at IS NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS gradebook_import_stage_chunks (
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_hash TEXT NOT NULL CHECK (length(chunk_hash) = 64),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  incoming_keys_json TEXT NOT NULL CHECK (json_valid(incoming_keys_json)),
  entity_write_count INTEGER NOT NULL CHECK (entity_write_count >= 0),
  academic_record_write_count INTEGER NOT NULL CHECK (academic_record_write_count >= 0),
  association_write_count INTEGER NOT NULL CHECK (association_write_count >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  PRIMARY KEY (session_id, chunk_index),
  FOREIGN KEY (session_id) REFERENCES gradebook_import_stage_sessions (session_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_gradebook_import_stage_sessions_expiry
  ON gradebook_import_stage_sessions (state, expires_at);

CREATE INDEX IF NOT EXISTS idx_gradebook_import_stage_chunks_session
  ON gradebook_import_stage_chunks (session_id, chunk_index);

INSERT OR IGNORE INTO gradebook_schema_migrations (version, name, applied_at)
VALUES (
  6,
  'import_staging_v1',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
