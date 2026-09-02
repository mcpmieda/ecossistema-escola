PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bulletin_snapshot_streams (
  series_key TEXT PRIMARY KEY CHECK (length(series_key) > 0),
  academic_year_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL UNIQUE CHECK (length(snapshot_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  class_group_id TEXT NOT NULL CHECK (length(class_group_id) > 0),
  student_id TEXT NOT NULL CHECK (length(student_id) > 0),
  enrollment_id TEXT NOT NULL CHECK (length(enrollment_id) > 0),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id),
  UNIQUE (
    series_key,
    academic_year_id,
    snapshot_id,
    class_group_id,
    student_id,
    enrollment_id
  )
) STRICT;

CREATE TABLE IF NOT EXISTS bulletin_snapshot_versions (
  series_key TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  class_group_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL CHECK (length(enrollment_id) > 0),
  emitted_at TEXT NOT NULL CHECK (emitted_at GLOB '????-??-??T??:??:??*Z'),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (snapshot_id, version),
  UNIQUE (series_key, version),
  FOREIGN KEY (
    series_key,
    academic_year_id,
    snapshot_id,
    class_group_id,
    student_id,
    enrollment_id
  )
    REFERENCES bulletin_snapshot_streams (
      series_key,
      academic_year_id,
      snapshot_id,
      class_group_id,
      student_id,
      enrollment_id
    ),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS council_decision_streams (
  academic_year_id TEXT NOT NULL,
  class_reference TEXT NOT NULL CHECK (length(class_reference) > 0),
  student_reference TEXT NOT NULL CHECK (length(student_reference) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, class_reference, student_reference),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id)
) STRICT;

CREATE TABLE IF NOT EXISTS council_decision_versions (
  academic_year_id TEXT NOT NULL,
  class_reference TEXT NOT NULL,
  student_reference TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  decision_reference TEXT NOT NULL UNIQUE CHECK (length(decision_reference) > 0),
  decision_outcome TEXT NOT NULL CHECK (decision_outcome IN ('approved', 'failed')),
  resulting_state TEXT NOT NULL CHECK (
    resulting_state IN ('approved-by-council', 'failed-by-council-decision')
  ),
  justification TEXT NOT NULL CHECK (length(justification) BETWEEN 1 AND 4000),
  actor_reference TEXT NOT NULL CHECK (length(actor_reference) > 0),
  decided_at TEXT NOT NULL CHECK (decided_at GLOB '????-??-??T??:??:??*Z'),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (academic_year_id, class_reference, student_reference, version),
  FOREIGN KEY (academic_year_id, class_reference, student_reference)
    REFERENCES council_decision_streams (
      academic_year_id,
      class_reference,
      student_reference
    ),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (
    (decision_outcome = 'approved' AND resulting_state = 'approved-by-council')
    OR (
      decision_outcome = 'failed'
      AND resulting_state = 'failed-by-council-decision'
    )
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_bulletin_snapshot_versions_history
  ON bulletin_snapshot_versions (series_key, version DESC);

CREATE INDEX IF NOT EXISTS idx_bulletin_snapshot_versions_class_page
  ON bulletin_snapshot_versions (
    academic_year_id,
    class_group_id,
    emitted_at DESC,
    snapshot_id,
    version DESC,
    student_id
  );

CREATE INDEX IF NOT EXISTS idx_bulletin_snapshot_versions_student_page
  ON bulletin_snapshot_versions (
    academic_year_id,
    class_group_id,
    student_id,
    emitted_at DESC,
    snapshot_id,
    version DESC
  );

CREATE INDEX IF NOT EXISTS idx_council_decision_versions_history
  ON council_decision_versions (
    academic_year_id,
    class_reference,
    student_reference,
    version DESC
  );

INSERT OR IGNORE INTO gradebook_schema_migrations (version, name, applied_at)
VALUES (
  4,
  'bulletin_council_durability_v1',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
