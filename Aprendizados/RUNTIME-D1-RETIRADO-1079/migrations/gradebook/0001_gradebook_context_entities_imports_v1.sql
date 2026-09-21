PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gradebook_schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
  applied_at TEXT NOT NULL CHECK (applied_at GLOB '????-??-??T??:??:??*Z')
) STRICT;

CREATE TABLE IF NOT EXISTS academic_years (
  academic_year_id TEXT PRIMARY KEY CHECK (length(academic_year_id) > 0),
  school_id TEXT NOT NULL CHECK (length(school_id) > 0),
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  UNIQUE (school_id, year)
) STRICT;

CREATE TABLE IF NOT EXISTS academic_year_configuration_versions (
  academic_year_id TEXT NOT NULL,
  configuration_id TEXT NOT NULL CHECK (length(configuration_id) > 0),
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  evaluation_profile_id TEXT NOT NULL CHECK (length(evaluation_profile_id) > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, configuration_id, version),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS academic_year_versions (
  academic_year_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'closed')),
  starts_on TEXT CHECK (starts_on IS NULL OR starts_on GLOB '????-??-??'),
  ends_on TEXT CHECK (ends_on IS NULL OR ends_on GLOB '????-??-??'),
  active_evaluation_profile_id TEXT NOT NULL CHECK (length(active_evaluation_profile_id) > 0),
  configuration_id TEXT NOT NULL CHECK (length(configuration_id) > 0),
  configuration_version INTEGER NOT NULL CHECK (configuration_version >= 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, version),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, configuration_id, configuration_version)
    REFERENCES academic_year_configuration_versions (academic_year_id, configuration_id, version),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
) STRICT;

CREATE TABLE IF NOT EXISTS academic_entity_streams (
  academic_year_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (
    entity_kind IN (
      'teacher',
      'class-group',
      'subject',
      'teaching-assignment',
      'student',
      'enrollment',
      'student-status-event',
      'assessment-component'
    )
  ),
  entity_id TEXT NOT NULL CHECK (length(entity_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id)
) STRICT;

CREATE TABLE IF NOT EXISTS academic_entity_versions (
  academic_year_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  teacher_ref_kind TEXT CHECK (teacher_ref_kind IS NULL OR teacher_ref_kind = 'teacher'),
  teacher_id TEXT,
  class_group_ref_kind TEXT CHECK (
    class_group_ref_kind IS NULL OR class_group_ref_kind = 'class-group'
  ),
  class_group_id TEXT,
  subject_ref_kind TEXT CHECK (subject_ref_kind IS NULL OR subject_ref_kind = 'subject'),
  subject_id TEXT,
  student_ref_kind TEXT CHECK (student_ref_kind IS NULL OR student_ref_kind = 'student'),
  student_id TEXT,
  enrollment_ref_kind TEXT CHECK (
    enrollment_ref_kind IS NULL OR enrollment_ref_kind = 'enrollment'
  ),
  enrollment_id TEXT,
  teaching_assignment_ref_kind TEXT CHECK (
    teaching_assignment_ref_kind IS NULL
    OR teaching_assignment_ref_kind = 'teaching-assignment'
  ),
  teaching_assignment_id TEXT,
  term INTEGER CHECK (term IS NULL OR term IN (1, 2, 3)),
  display_code TEXT,
  lifecycle_state TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, entity_kind, entity_id, version),
  FOREIGN KEY (academic_year_id, entity_kind, entity_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, teacher_ref_kind, teacher_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, class_group_ref_kind, class_group_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, subject_ref_kind, subject_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, student_ref_kind, student_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, enrollment_ref_kind, enrollment_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, teaching_assignment_ref_kind, teaching_assignment_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK ((teacher_ref_kind IS NULL) = (teacher_id IS NULL)),
  CHECK ((class_group_ref_kind IS NULL) = (class_group_id IS NULL)),
  CHECK ((subject_ref_kind IS NULL) = (subject_id IS NULL)),
  CHECK ((student_ref_kind IS NULL) = (student_id IS NULL)),
  CHECK ((enrollment_ref_kind IS NULL) = (enrollment_id IS NULL)),
  CHECK ((teaching_assignment_ref_kind IS NULL) = (teaching_assignment_id IS NULL)),
  CHECK (
    (entity_kind = 'teaching-assignment'
      AND teacher_id IS NOT NULL
      AND class_group_id IS NOT NULL
      AND subject_id IS NOT NULL
      AND student_id IS NULL
      AND enrollment_id IS NULL
      AND teaching_assignment_id IS NULL
      AND term IS NULL)
    OR (entity_kind = 'enrollment'
      AND student_id IS NOT NULL
      AND class_group_id IS NOT NULL
      AND teacher_id IS NULL
      AND subject_id IS NULL
      AND enrollment_id IS NULL
      AND teaching_assignment_id IS NULL
      AND term IS NULL)
    OR (entity_kind = 'student-status-event'
      AND enrollment_id IS NOT NULL
      AND teacher_id IS NULL
      AND class_group_id IS NULL
      AND subject_id IS NULL
      AND student_id IS NULL
      AND teaching_assignment_id IS NULL
      AND term IS NULL)
    OR (entity_kind = 'assessment-component'
      AND teaching_assignment_id IS NOT NULL
      AND term IS NOT NULL
      AND teacher_id IS NULL
      AND class_group_id IS NULL
      AND subject_id IS NULL
      AND student_id IS NULL
      AND enrollment_id IS NULL)
    OR (entity_kind IN ('teacher', 'class-group', 'subject', 'student')
      AND teacher_id IS NULL
      AND class_group_id IS NULL
      AND subject_id IS NULL
      AND student_id IS NULL
      AND enrollment_id IS NULL
      AND teaching_assignment_id IS NULL
      AND term IS NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS logical_sources (
  academic_year_id TEXT NOT NULL,
  logical_source_id TEXT NOT NULL CHECK (length(logical_source_id) > 0),
  teacher_ref_kind TEXT CHECK (teacher_ref_kind IS NULL OR teacher_ref_kind = 'teacher'),
  teacher_id TEXT,
  class_group_ref_kind TEXT CHECK (
    class_group_ref_kind IS NULL OR class_group_ref_kind = 'class-group'
  ),
  class_group_id TEXT,
  subject_ref_kind TEXT CHECK (subject_ref_kind IS NULL OR subject_ref_kind = 'subject'),
  subject_id TEXT,
  source_context TEXT NOT NULL CHECK (length(source_context) > 0),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, logical_source_id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, teacher_ref_kind, teacher_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, class_group_ref_kind, class_group_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, subject_ref_kind, subject_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  CHECK ((teacher_ref_kind IS NULL) = (teacher_id IS NULL)),
  CHECK ((class_group_ref_kind IS NULL) = (class_group_id IS NULL)),
  CHECK ((subject_ref_kind IS NULL) = (subject_id IS NULL))
) STRICT;

CREATE TABLE IF NOT EXISTS source_file_streams (
  academic_year_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL CHECK (length(manifest_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  current_sha256 TEXT NOT NULL CHECK (
    length(current_sha256) = 64
    AND current_sha256 = lower(current_sha256)
    AND current_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, manifest_id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id),
  UNIQUE (academic_year_id, current_sha256)
) STRICT;

CREATE TABLE IF NOT EXISTS source_file_versions (
  academic_year_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  file_name TEXT NOT NULL CHECK (length(file_name) > 0),
  extension TEXT NOT NULL CHECK (extension IN ('xlsb', 'xlsx', 'xls')),
  reported_mime_type TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  last_modified_at TEXT CHECK (
    last_modified_at IS NULL OR last_modified_at GLOB '????-??-??T??:??:??*Z'
  ),
  sha256 TEXT NOT NULL CHECK (
    length(sha256) = 64
    AND sha256 = lower(sha256)
    AND sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  source_contract_version INTEGER NOT NULL CHECK (source_contract_version >= 1),
  parser_version TEXT NOT NULL CHECK (length(parser_version) > 0),
  read_at TEXT NOT NULL CHECK (read_at GLOB '????-??-??T??:??:??*Z'),
  suggested_academic_year INTEGER,
  confirmed_academic_year_id TEXT,
  suggested_teacher_name TEXT,
  confirmed_teacher_ref_kind TEXT CHECK (
    confirmed_teacher_ref_kind IS NULL OR confirmed_teacher_ref_kind = 'teacher'
  ),
  confirmed_teacher_id TEXT,
  logical_source_state TEXT NOT NULL CHECK (
    logical_source_state IN ('unmatched', 'candidate', 'confirmed')
  ),
  confirmed_logical_source_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, manifest_id, version),
  FOREIGN KEY (academic_year_id, manifest_id)
    REFERENCES source_file_streams (academic_year_id, manifest_id),
  FOREIGN KEY (confirmed_academic_year_id) REFERENCES academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, confirmed_teacher_ref_kind, confirmed_teacher_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, confirmed_logical_source_id)
    REFERENCES logical_sources (academic_year_id, logical_source_id),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (
    (logical_source_state = 'confirmed' AND confirmed_logical_source_id IS NOT NULL)
    OR (logical_source_state IN ('unmatched', 'candidate') AND confirmed_logical_source_id IS NULL)
  ),
  CHECK ((confirmed_teacher_ref_kind IS NULL) = (confirmed_teacher_id IS NULL)),
  CHECK (
    confirmed_academic_year_id IS NULL OR confirmed_academic_year_id = academic_year_id
  )
) STRICT;

CREATE TABLE IF NOT EXISTS source_file_logical_source_candidates (
  academic_year_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  source_file_version INTEGER NOT NULL,
  logical_source_id TEXT NOT NULL,
  PRIMARY KEY (academic_year_id, manifest_id, source_file_version, logical_source_id),
  FOREIGN KEY (academic_year_id, manifest_id, source_file_version)
    REFERENCES source_file_versions (academic_year_id, manifest_id, version),
  FOREIGN KEY (academic_year_id, logical_source_id)
    REFERENCES logical_sources (academic_year_id, logical_source_id)
) STRICT;

CREATE TABLE IF NOT EXISTS import_batch_streams (
  academic_year_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL CHECK (length(import_batch_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, import_batch_id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years (academic_year_id)
) STRICT;

CREATE TABLE IF NOT EXISTS import_batch_versions (
  academic_year_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  status TEXT NOT NULL CHECK (
    status IN (
      'received',
      'processing',
      'review-required',
      'partially-approved',
      'approved',
      'rejected',
      'failed'
    )
  ),
  received_at TEXT NOT NULL CHECK (received_at GLOB '????-??-??T??:??:??*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '????-??-??T??:??:??*Z'),
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  recorded_at TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (academic_year_id, import_batch_id, version),
  FOREIGN KEY (academic_year_id, import_batch_id)
    REFERENCES import_batch_streams (academic_year_id, import_batch_id),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (updated_at >= received_at)
) STRICT;

CREATE TABLE IF NOT EXISTS import_batch_files (
  academic_year_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  batch_version INTEGER NOT NULL,
  import_file_id TEXT NOT NULL CHECK (length(import_file_id) > 0),
  manifest_id TEXT,
  manifest_version INTEGER,
  status TEXT NOT NULL CHECK (
    status IN ('received', 'processing', 'review-required', 'approved', 'rejected', 'failed')
  ),
  file_name TEXT NOT NULL CHECK (length(file_name) > 0),
  extension TEXT,
  reported_mime_type TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  last_modified_at TEXT CHECK (
    last_modified_at IS NULL OR last_modified_at GLOB '????-??-??T??:??:??*Z'
  ),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (academic_year_id, import_batch_id, batch_version, import_file_id),
  FOREIGN KEY (academic_year_id, import_batch_id, batch_version)
    REFERENCES import_batch_versions (academic_year_id, import_batch_id, version),
  FOREIGN KEY (academic_year_id, manifest_id, manifest_version)
    REFERENCES source_file_versions (academic_year_id, manifest_id, version),
  CHECK ((manifest_id IS NULL) = (manifest_version IS NULL))
) STRICT;

CREATE TABLE IF NOT EXISTS import_diagnostics (
  academic_year_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  batch_version INTEGER NOT NULL,
  diagnostic_id TEXT NOT NULL CHECK (length(diagnostic_id) > 0),
  import_file_id TEXT NOT NULL,
  manifest_id TEXT,
  manifest_version INTEGER,
  severity TEXT NOT NULL CHECK (
    severity IN ('information', 'warning', 'blocking-error', 'critical-error')
  ),
  code TEXT NOT NULL CHECK (length(code) > 0),
  message TEXT NOT NULL CHECK (length(message) > 0),
  location_kind TEXT NOT NULL CHECK (location_kind IN ('file', 'sheet', 'cell')),
  sheet_name TEXT,
  cell_address TEXT,
  entity_kind TEXT,
  entity_id TEXT,
  source_evidence_json TEXT CHECK (
    source_evidence_json IS NULL OR json_valid(source_evidence_json)
  ),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (academic_year_id, import_batch_id, batch_version, diagnostic_id),
  FOREIGN KEY (academic_year_id, import_batch_id, batch_version, import_file_id)
    REFERENCES import_batch_files (
      academic_year_id,
      import_batch_id,
      batch_version,
      import_file_id
    ),
  FOREIGN KEY (academic_year_id, manifest_id, manifest_version)
    REFERENCES source_file_versions (academic_year_id, manifest_id, version),
  FOREIGN KEY (academic_year_id, entity_kind, entity_id)
    REFERENCES academic_entity_streams (academic_year_id, entity_kind, entity_id),
  CHECK ((manifest_id IS NULL) = (manifest_version IS NULL)),
  CHECK ((entity_kind IS NULL) = (entity_id IS NULL)),
  CHECK (
    (location_kind = 'file' AND sheet_name IS NULL AND cell_address IS NULL)
    OR (location_kind = 'sheet' AND sheet_name IS NOT NULL AND cell_address IS NULL)
    OR (location_kind = 'cell' AND sheet_name IS NOT NULL AND cell_address IS NOT NULL)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_academic_years_year
  ON academic_years (year, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_academic_year_versions_current
  ON academic_year_versions (academic_year_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_academic_configuration_versions_page
  ON academic_year_configuration_versions (academic_year_id, configuration_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_academic_entity_streams_page
  ON academic_entity_streams (academic_year_id, entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS idx_academic_entity_versions_history
  ON academic_entity_versions (academic_year_id, entity_kind, entity_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_academic_entity_versions_relations
  ON academic_entity_versions (
    academic_year_id,
    student_id,
    enrollment_id,
    teaching_assignment_id
  );
CREATE INDEX IF NOT EXISTS idx_logical_sources_context
  ON logical_sources (academic_year_id, teacher_id, class_group_id, subject_id, logical_source_id);
CREATE INDEX IF NOT EXISTS idx_source_file_streams_hash
  ON source_file_streams (academic_year_id, current_sha256, manifest_id);
CREATE INDEX IF NOT EXISTS idx_source_file_versions_history
  ON source_file_versions (academic_year_id, manifest_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_source_file_versions_logical_source
  ON source_file_versions (
    academic_year_id,
    confirmed_logical_source_id,
    recorded_at,
    manifest_id,
    version
  );
CREATE INDEX IF NOT EXISTS idx_import_batch_streams_page
  ON import_batch_streams (academic_year_id, import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_versions_history
  ON import_batch_versions (academic_year_id, import_batch_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_import_batch_files_status
  ON import_batch_files (
    academic_year_id,
    import_batch_id,
    batch_version,
    status,
    import_file_id
  );
CREATE INDEX IF NOT EXISTS idx_import_diagnostics_file
  ON import_diagnostics (
    academic_year_id,
    import_batch_id,
    batch_version,
    import_file_id,
    diagnostic_id
  );
CREATE INDEX IF NOT EXISTS idx_import_diagnostics_severity
  ON import_diagnostics (academic_year_id, severity, diagnostic_id);

INSERT OR IGNORE INTO gradebook_schema_migrations (version, name, applied_at)
VALUES (
  1,
  'gradebook_context_entities_imports_v1',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
