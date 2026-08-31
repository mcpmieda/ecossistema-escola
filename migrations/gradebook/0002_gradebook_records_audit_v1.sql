PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS academic_record_streams (
  academic_year_id TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK (
    record_kind IN ('grade-entry', 'term-result', 'final-recovery', 'annual-result')
  ),
  stream_key TEXT NOT NULL CHECK (length(stream_key) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  student_ref_kind TEXT NOT NULL DEFAULT 'student' CHECK (student_ref_kind = 'student'),
  student_id TEXT NOT NULL,
  enrollment_ref_kind TEXT NOT NULL DEFAULT 'enrollment' CHECK (
    enrollment_ref_kind = 'enrollment'
  ),
  enrollment_id TEXT NOT NULL,
  assessment_component_ref_kind TEXT CHECK (
    assessment_component_ref_kind IS NULL
    OR assessment_component_ref_kind = 'assessment-component'
  ),
  assessment_component_id TEXT,
  teaching_assignment_ref_kind TEXT CHECK (
    teaching_assignment_ref_kind IS NULL
    OR teaching_assignment_ref_kind = 'teaching-assignment'
  ),
  teaching_assignment_id TEXT,
  term INTEGER CHECK (term IS NULL OR term IN (1, 2, 3)),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, record_kind, stream_key),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, student_ref_kind, student_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, enrollment_ref_kind, enrollment_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, assessment_component_ref_kind, assessment_component_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, teaching_assignment_ref_kind, teaching_assignment_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  CHECK ((assessment_component_ref_kind IS NULL) = (assessment_component_id IS NULL)),
  CHECK ((teaching_assignment_ref_kind IS NULL) = (teaching_assignment_id IS NULL)),
  CHECK (
    (record_kind = 'grade-entry'
      AND assessment_component_id IS NOT NULL
      AND teaching_assignment_id IS NULL
      AND term IS NULL)
    OR (record_kind IN ('term-result', 'final-recovery')
      AND assessment_component_id IS NULL
      AND teaching_assignment_id IS NOT NULL
      AND term IS NOT NULL)
    OR (record_kind = 'annual-result'
      AND assessment_component_id IS NULL
      AND teaching_assignment_id IS NOT NULL
      AND term IS NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS academic_record_versions (
  academic_year_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  record_id TEXT NOT NULL CHECK (length(record_id) > 0),
  authority_mode TEXT NOT NULL CHECK (authority_mode IN ('imported-source', 'native-engine')),
  rule_version TEXT NOT NULL CHECK (length(rule_version) > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, record_kind, stream_key, version),
  FOREIGN KEY (academic_year_id, record_kind, stream_key)
    REFERENCES academic_record_streams (academic_year_id, record_kind, stream_key),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS audit_record_streams (
  academic_year_id TEXT NOT NULL,
  audit_kind TEXT NOT NULL CHECK (audit_kind IN ('occurrence', 'reconciliation')),
  audit_record_id TEXT NOT NULL CHECK (length(audit_record_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, audit_kind, audit_record_id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id)
) STRICT;

CREATE TABLE IF NOT EXISTS audit_record_versions (
  academic_year_id TEXT NOT NULL,
  audit_kind TEXT NOT NULL,
  audit_record_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  import_batch_id TEXT,
  severity TEXT CHECK (
    severity IS NULL
    OR severity IN ('information', 'warning', 'blocking-error', 'critical-error')
  ),
  category TEXT,
  occurrence_state TEXT CHECK (
    occurrence_state IS NULL
    OR occurrence_state IN ('open', 'acknowledged', 'resolved', 'dismissed-with-reason')
  ),
  reconciliation_status TEXT CHECK (
    reconciliation_status IS NULL
    OR reconciliation_status IN ('match', 'expected-difference', 'mismatch', 'not-comparable')
  ),
  target_kind TEXT CHECK (
    target_kind IS NULL
    OR target_kind IN ('grade-entry', 'term-result', 'final-recovery', 'annual-result')
  ),
  target_record_id TEXT,
  target_stream_key TEXT,
  difference REAL,
  tolerance REAL,
  rule_version TEXT,
  entity_kind TEXT,
  entity_id TEXT,
  source_manifest_id TEXT,
  source_manifest_version INTEGER,
  source_sheet_name TEXT,
  source_cell_address TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, audit_kind, audit_record_id, version),
  FOREIGN KEY (academic_year_id, audit_kind, audit_record_id)
    REFERENCES audit_record_streams (academic_year_id, audit_kind, audit_record_id),
  FOREIGN KEY (academic_year_id, import_batch_id)
    REFERENCES import_batch_streams (academic_year_id, import_batch_id),
  FOREIGN KEY (academic_year_id, target_kind, target_stream_key)
    REFERENCES academic_record_streams (academic_year_id, record_kind, stream_key),
  FOREIGN KEY (academic_year_id, entity_kind, entity_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, source_manifest_id, source_manifest_version)
    REFERENCES source_file_versions (academic_year_id, manifest_id, version),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK ((import_batch_id IS NULL) OR length(import_batch_id) > 0),
  CHECK ((target_kind IS NULL) = (target_record_id IS NULL)),
  CHECK ((target_kind IS NULL) = (target_stream_key IS NULL)),
  CHECK ((entity_kind IS NULL) = (entity_id IS NULL)),
  CHECK ((source_manifest_id IS NULL) = (source_manifest_version IS NULL)),
  CHECK (
    (audit_kind = 'occurrence'
      AND severity IS NOT NULL
      AND category IS NOT NULL
      AND occurrence_state IS NOT NULL
      AND reconciliation_status IS NULL
      AND target_kind IS NULL
      AND difference IS NULL
      AND tolerance IS NULL
      AND rule_version IS NULL)
    OR (audit_kind = 'reconciliation'
      AND severity IS NULL
      AND category IS NULL
      AND occurrence_state IS NULL
      AND reconciliation_status IS NOT NULL
      AND target_kind IS NOT NULL
      AND rule_version IS NOT NULL
      AND (
        (reconciliation_status = 'not-comparable' AND difference IS NULL)
        OR (reconciliation_status != 'not-comparable' AND difference IS NOT NULL AND tolerance IS NOT NULL)
      ))
  )
) STRICT;

CREATE TABLE IF NOT EXISTS audit_occurrence_transitions (
  academic_year_id TEXT NOT NULL,
  audit_kind TEXT NOT NULL DEFAULT 'occurrence' CHECK (audit_kind = 'occurrence'),
  occurrence_id TEXT NOT NULL,
  transition_sequence INTEGER NOT NULL CHECK (transition_sequence >= 1),
  previous_state TEXT NOT NULL CHECK (previous_state IN ('open', 'acknowledged')),
  next_state TEXT NOT NULL CHECK (
    next_state IN ('acknowledged', 'resolved', 'dismissed-with-reason')
  ),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0),
  occurred_at TEXT NOT NULL CHECK (occurred_at GLOB '????-??-??T??:??:??*Z'),
  note TEXT,
  justification TEXT,
  PRIMARY KEY (academic_year_id, occurrence_id, transition_sequence),
  FOREIGN KEY (academic_year_id, audit_kind, occurrence_id)
    REFERENCES audit_record_streams (academic_year_id, audit_kind, audit_record_id),
  CHECK (
    (next_state = 'acknowledged'
      AND previous_state = 'open'
      AND justification IS NULL)
    OR (next_state IN ('resolved', 'dismissed-with-reason')
      AND justification IS NOT NULL
      AND length(justification) > 0)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_academic_record_streams_current_page
  ON academic_record_streams (
    academic_year_id,
    record_kind,
    student_id,
    enrollment_id,
    stream_key
  );
CREATE INDEX IF NOT EXISTS idx_academic_record_streams_assignment
  ON academic_record_streams (
    academic_year_id,
    teaching_assignment_id,
    term,
    record_kind,
    stream_key
  );
CREATE INDEX IF NOT EXISTS idx_academic_record_versions_history
  ON academic_record_versions (academic_year_id, record_kind, stream_key, version DESC);
CREATE INDEX IF NOT EXISTS idx_academic_record_versions_record_id
  ON academic_record_versions (academic_year_id, record_kind, record_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record_streams_page
  ON audit_record_streams (academic_year_id, audit_kind, audit_record_id);
CREATE INDEX IF NOT EXISTS idx_audit_record_versions_history
  ON audit_record_versions (academic_year_id, audit_kind, audit_record_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_audit_occurrences_state
  ON audit_record_versions (
    academic_year_id,
    occurrence_state,
    severity,
    audit_record_id,
    version DESC
  )
  WHERE audit_kind = 'occurrence';
CREATE INDEX IF NOT EXISTS idx_reconciliations_target
  ON audit_record_versions (
    academic_year_id,
    target_kind,
    target_record_id,
    audit_record_id,
    version DESC
  )
  WHERE audit_kind = 'reconciliation';
CREATE INDEX IF NOT EXISTS idx_audit_source_provenance
  ON audit_record_versions (
    academic_year_id,
    source_manifest_id,
    source_manifest_version,
    audit_record_id
  );
CREATE INDEX IF NOT EXISTS idx_audit_transitions_history
  ON audit_occurrence_transitions (
    academic_year_id,
    occurrence_id,
    transition_sequence DESC
  );

INSERT OR IGNORE INTO gradebook_schema_migrations (version, name, applied_at)
VALUES (
  2,
  'gradebook_records_audit_v1',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
