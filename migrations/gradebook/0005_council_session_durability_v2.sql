PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS council_session_streams (
  academic_year_id TEXT NOT NULL,
  class_reference TEXT NOT NULL CHECK (length(class_reference) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
  PRIMARY KEY (academic_year_id, class_reference),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id)
) STRICT;

CREATE TABLE IF NOT EXISTS council_session_versions (
  academic_year_id TEXT NOT NULL,
  class_reference TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
  closure_reference TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (academic_year_id, class_reference, version),
  FOREIGN KEY (academic_year_id, class_reference)
    REFERENCES council_session_streams (academic_year_id, class_reference),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (
    (state = 'open' AND closure_reference IS NULL)
    OR (
      state = 'closed'
      AND closure_reference IS NOT NULL
      AND length(closure_reference) > 0
    )
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_council_session_versions_history
  ON council_session_versions (academic_year_id, class_reference, version DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_council_session_versions_closure_reference
  ON council_session_versions (closure_reference)
  WHERE closure_reference IS NOT NULL;

INSERT OR IGNORE INTO gradebook_schema_migrations (version, name, applied_at)
VALUES (
  5,
  'council_session_durability_v2',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
