CREATE SCHEMA IF NOT EXISTS gradebook;

CREATE TABLE IF NOT EXISTS gradebook.gradebook_schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS gradebook.academic_years (
  academic_year_id TEXT PRIMARY KEY CHECK (length(academic_year_id) > 0),
  school_id TEXT NOT NULL CHECK (length(school_id) > 0),
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (school_id, year)
);

CREATE TABLE IF NOT EXISTS gradebook.academic_year_configuration_versions (
  academic_year_id TEXT NOT NULL,
  configuration_id TEXT NOT NULL CHECK (length(configuration_id) > 0),
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  evaluation_profile_id TEXT NOT NULL CHECK (length(evaluation_profile_id) > 0),
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, configuration_id, version),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
);

CREATE TABLE IF NOT EXISTS gradebook.academic_year_versions (
  academic_year_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'closed')),
  starts_on DATE,
  ends_on DATE,
  active_evaluation_profile_id TEXT NOT NULL CHECK (length(active_evaluation_profile_id) > 0),
  configuration_id TEXT NOT NULL CHECK (length(configuration_id) > 0),
  configuration_version INTEGER NOT NULL CHECK (configuration_version >= 1),
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, version),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, configuration_id, configuration_version)
    REFERENCES gradebook.academic_year_configuration_versions (
      academic_year_id,
      configuration_id,
      version
    ),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS gradebook.academic_entity_streams (
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
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id)
);

CREATE TABLE IF NOT EXISTS gradebook.academic_entity_versions (
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
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, entity_kind, entity_id, version),
  FOREIGN KEY (academic_year_id, entity_kind, entity_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, teacher_ref_kind, teacher_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, class_group_ref_kind, class_group_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, subject_ref_kind, subject_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, student_ref_kind, student_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, enrollment_ref_kind, enrollment_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, teaching_assignment_ref_kind, teaching_assignment_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
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
);

CREATE TABLE IF NOT EXISTS gradebook.logical_sources (
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
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, logical_source_id),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, teacher_ref_kind, teacher_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, class_group_ref_kind, class_group_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, subject_ref_kind, subject_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  CHECK ((teacher_ref_kind IS NULL) = (teacher_id IS NULL)),
  CHECK ((class_group_ref_kind IS NULL) = (class_group_id IS NULL)),
  CHECK ((subject_ref_kind IS NULL) = (subject_id IS NULL))
);

CREATE TABLE IF NOT EXISTS gradebook.source_file_streams (
  academic_year_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL CHECK (length(manifest_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  current_sha256 TEXT NOT NULL CHECK (current_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, manifest_id),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id),
  UNIQUE (academic_year_id, current_sha256)
);

CREATE TABLE IF NOT EXISTS gradebook.source_file_versions (
  academic_year_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  file_name TEXT NOT NULL CHECK (length(file_name) > 0),
  extension TEXT NOT NULL CHECK (extension IN ('xlsb', 'xlsx', 'xls')),
  reported_mime_type TEXT,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  last_modified_at TIMESTAMPTZ,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source_contract_version INTEGER NOT NULL CHECK (source_contract_version >= 1),
  parser_version TEXT NOT NULL CHECK (length(parser_version) > 0),
  read_at TIMESTAMPTZ NOT NULL,
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
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, manifest_id, version),
  FOREIGN KEY (academic_year_id, manifest_id)
    REFERENCES gradebook.source_file_streams (academic_year_id, manifest_id),
  FOREIGN KEY (confirmed_academic_year_id)
    REFERENCES gradebook.academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, confirmed_teacher_ref_kind, confirmed_teacher_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, confirmed_logical_source_id)
    REFERENCES gradebook.logical_sources (academic_year_id, logical_source_id),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (
    (logical_source_state = 'confirmed' AND confirmed_logical_source_id IS NOT NULL)
    OR (logical_source_state IN ('unmatched', 'candidate') AND confirmed_logical_source_id IS NULL)
  ),
  CHECK ((confirmed_teacher_ref_kind IS NULL) = (confirmed_teacher_id IS NULL)),
  CHECK (confirmed_academic_year_id IS NULL OR confirmed_academic_year_id = academic_year_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_file_versions_confirmed_source
  ON gradebook.source_file_versions (
    academic_year_id,
    manifest_id,
    version,
    confirmed_logical_source_id
  );

CREATE TABLE IF NOT EXISTS gradebook.source_file_logical_source_candidates (
  academic_year_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  source_file_version INTEGER NOT NULL,
  logical_source_id TEXT NOT NULL,
  PRIMARY KEY (academic_year_id, manifest_id, source_file_version, logical_source_id),
  FOREIGN KEY (academic_year_id, manifest_id, source_file_version)
    REFERENCES gradebook.source_file_versions (academic_year_id, manifest_id, version),
  FOREIGN KEY (academic_year_id, logical_source_id)
    REFERENCES gradebook.logical_sources (academic_year_id, logical_source_id)
);

CREATE TABLE IF NOT EXISTS gradebook.import_batch_streams (
  academic_year_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL CHECK (length(import_batch_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, import_batch_id),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id)
);

CREATE TABLE IF NOT EXISTS gradebook.import_batch_versions (
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
  received_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  summary_json JSONB NOT NULL,
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, import_batch_id, version),
  FOREIGN KEY (academic_year_id, import_batch_id)
    REFERENCES gradebook.import_batch_streams (academic_year_id, import_batch_id),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (updated_at >= received_at)
);

CREATE TABLE IF NOT EXISTS gradebook.import_batch_files (
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
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  last_modified_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL,
  PRIMARY KEY (academic_year_id, import_batch_id, batch_version, import_file_id),
  FOREIGN KEY (academic_year_id, import_batch_id, batch_version)
    REFERENCES gradebook.import_batch_versions (academic_year_id, import_batch_id, version),
  FOREIGN KEY (academic_year_id, manifest_id, manifest_version)
    REFERENCES gradebook.source_file_versions (academic_year_id, manifest_id, version),
  CHECK ((manifest_id IS NULL) = (manifest_version IS NULL))
);

CREATE TABLE IF NOT EXISTS gradebook.import_diagnostics (
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
  source_evidence_json JSONB,
  payload_json JSONB NOT NULL,
  PRIMARY KEY (academic_year_id, import_batch_id, batch_version, diagnostic_id),
  FOREIGN KEY (academic_year_id, import_batch_id, batch_version, import_file_id)
    REFERENCES gradebook.import_batch_files (
      academic_year_id,
      import_batch_id,
      batch_version,
      import_file_id
    ),
  FOREIGN KEY (academic_year_id, manifest_id, manifest_version)
    REFERENCES gradebook.source_file_versions (academic_year_id, manifest_id, version),
  FOREIGN KEY (academic_year_id, entity_kind, entity_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  CHECK ((manifest_id IS NULL) = (manifest_version IS NULL)),
  CHECK ((entity_kind IS NULL) = (entity_id IS NULL)),
  CHECK (
    (location_kind = 'file' AND sheet_name IS NULL AND cell_address IS NULL)
    OR (location_kind = 'sheet' AND sheet_name IS NOT NULL AND cell_address IS NULL)
    OR (location_kind = 'cell' AND sheet_name IS NOT NULL AND cell_address IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS gradebook.academic_record_streams (
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
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, record_kind, stream_key),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id),
  FOREIGN KEY (academic_year_id, student_ref_kind, student_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, enrollment_ref_kind, enrollment_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, assessment_component_ref_kind, assessment_component_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, teaching_assignment_ref_kind, teaching_assignment_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
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
);

CREATE TABLE IF NOT EXISTS gradebook.academic_record_versions (
  academic_year_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  record_id TEXT NOT NULL CHECK (length(record_id) > 0),
  authority_mode TEXT NOT NULL CHECK (authority_mode IN ('imported-source', 'native-engine')),
  rule_version TEXT NOT NULL CHECK (length(rule_version) > 0),
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, record_kind, stream_key, version),
  FOREIGN KEY (academic_year_id, record_kind, stream_key)
    REFERENCES gradebook.academic_record_streams (academic_year_id, record_kind, stream_key),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
);

CREATE TABLE IF NOT EXISTS gradebook.audit_record_streams (
  academic_year_id TEXT NOT NULL,
  audit_kind TEXT NOT NULL CHECK (audit_kind IN ('occurrence', 'reconciliation')),
  audit_record_id TEXT NOT NULL CHECK (length(audit_record_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, audit_kind, audit_record_id),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id)
);

CREATE TABLE IF NOT EXISTS gradebook.audit_record_versions (
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
  difference DOUBLE PRECISION,
  tolerance DOUBLE PRECISION,
  rule_version TEXT,
  entity_kind TEXT,
  entity_id TEXT,
  source_manifest_id TEXT,
  source_manifest_version INTEGER,
  source_sheet_name TEXT,
  source_cell_address TEXT,
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, audit_kind, audit_record_id, version),
  FOREIGN KEY (academic_year_id, audit_kind, audit_record_id)
    REFERENCES gradebook.audit_record_streams (academic_year_id, audit_kind, audit_record_id),
  FOREIGN KEY (academic_year_id, import_batch_id)
    REFERENCES gradebook.import_batch_streams (academic_year_id, import_batch_id),
  FOREIGN KEY (academic_year_id, target_kind, target_stream_key)
    REFERENCES gradebook.academic_record_streams (academic_year_id, record_kind, stream_key),
  FOREIGN KEY (academic_year_id, entity_kind, entity_id)
    REFERENCES gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id),
  FOREIGN KEY (academic_year_id, source_manifest_id, source_manifest_version)
    REFERENCES gradebook.source_file_versions (academic_year_id, manifest_id, version),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  ),
  CHECK (import_batch_id IS NULL OR length(import_batch_id) > 0),
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
        OR (
          reconciliation_status <> 'not-comparable'
          AND difference IS NOT NULL
          AND tolerance IS NOT NULL
        )
      ))
  )
);

CREATE TABLE IF NOT EXISTS gradebook.audit_occurrence_transitions (
  academic_year_id TEXT NOT NULL,
  audit_kind TEXT NOT NULL DEFAULT 'occurrence' CHECK (audit_kind = 'occurrence'),
  occurrence_id TEXT NOT NULL,
  transition_sequence INTEGER NOT NULL CHECK (transition_sequence >= 1),
  previous_state TEXT NOT NULL CHECK (previous_state IN ('open', 'acknowledged')),
  next_state TEXT NOT NULL CHECK (
    next_state IN ('acknowledged', 'resolved', 'dismissed-with-reason')
  ),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  justification TEXT,
  PRIMARY KEY (academic_year_id, occurrence_id, transition_sequence),
  FOREIGN KEY (academic_year_id, audit_kind, occurrence_id)
    REFERENCES gradebook.audit_record_streams (academic_year_id, audit_kind, audit_record_id),
  CHECK (
    (next_state = 'acknowledged'
      AND previous_state = 'open'
      AND justification IS NULL)
    OR (next_state IN ('resolved', 'dismissed-with-reason')
      AND justification IS NOT NULL
      AND length(justification) > 0)
  )
);

CREATE TABLE IF NOT EXISTS gradebook.logical_source_record_streams (
  academic_year_id TEXT NOT NULL,
  logical_source_id TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK (
    record_kind IN ('grade-entry', 'term-result', 'final-recovery', 'annual-result')
  ),
  stream_key TEXT NOT NULL CHECK (length(stream_key) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  current_state TEXT NOT NULL CHECK (current_state IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, logical_source_id, record_kind, stream_key),
  FOREIGN KEY (academic_year_id, logical_source_id)
    REFERENCES gradebook.logical_sources (academic_year_id, logical_source_id),
  FOREIGN KEY (academic_year_id, record_kind, stream_key)
    REFERENCES gradebook.academic_record_streams (academic_year_id, record_kind, stream_key)
);

CREATE TABLE IF NOT EXISTS gradebook.logical_source_record_versions (
  academic_year_id TEXT NOT NULL,
  logical_source_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  association_state TEXT NOT NULL CHECK (association_state IN ('active', 'inactive')),
  source_manifest_id TEXT NOT NULL,
  source_manifest_version INTEGER NOT NULL CHECK (source_manifest_version >= 1),
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    academic_year_id,
    logical_source_id,
    record_kind,
    stream_key,
    version
  ),
  FOREIGN KEY (academic_year_id, logical_source_id, record_kind, stream_key)
    REFERENCES gradebook.logical_source_record_streams (
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
  ) REFERENCES gradebook.source_file_versions (
    academic_year_id,
    manifest_id,
    version,
    confirmed_logical_source_id
  ),
  CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
);

CREATE TABLE IF NOT EXISTS gradebook.bulletin_snapshot_streams (
  series_key TEXT PRIMARY KEY CHECK (length(series_key) > 0),
  academic_year_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL UNIQUE CHECK (length(snapshot_id) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  class_group_id TEXT NOT NULL CHECK (length(class_group_id) > 0),
  student_id TEXT NOT NULL CHECK (length(student_id) > 0),
  enrollment_id TEXT NOT NULL CHECK (length(enrollment_id) > 0),
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id),
  UNIQUE (
    series_key,
    academic_year_id,
    snapshot_id,
    class_group_id,
    student_id,
    enrollment_id
  )
);

CREATE TABLE IF NOT EXISTS gradebook.bulletin_snapshot_versions (
  series_key TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  class_group_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL CHECK (length(enrollment_id) > 0),
  emitted_at TIMESTAMPTZ NOT NULL,
  payload_json JSONB NOT NULL,
  PRIMARY KEY (snapshot_id, version),
  UNIQUE (series_key, version),
  FOREIGN KEY (
    series_key,
    academic_year_id,
    snapshot_id,
    class_group_id,
    student_id,
    enrollment_id
  ) REFERENCES gradebook.bulletin_snapshot_streams (
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
);

CREATE TABLE IF NOT EXISTS gradebook.council_decision_streams (
  academic_year_id TEXT NOT NULL,
  class_reference TEXT NOT NULL CHECK (length(class_reference) > 0),
  student_reference TEXT NOT NULL CHECK (length(student_reference) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (academic_year_id, class_reference, student_reference),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id)
);

CREATE TABLE IF NOT EXISTS gradebook.council_decision_versions (
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
  decided_at TIMESTAMPTZ NOT NULL,
  payload_json JSONB NOT NULL,
  PRIMARY KEY (academic_year_id, class_reference, student_reference, version),
  FOREIGN KEY (academic_year_id, class_reference, student_reference)
    REFERENCES gradebook.council_decision_streams (
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
);

CREATE TABLE IF NOT EXISTS gradebook.council_session_streams (
  academic_year_id TEXT NOT NULL,
  class_reference TEXT NOT NULL CHECK (length(class_reference) > 0),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
  PRIMARY KEY (academic_year_id, class_reference),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id)
);

CREATE TABLE IF NOT EXISTS gradebook.council_session_versions (
  academic_year_id TEXT NOT NULL,
  class_reference TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version INTEGER,
  state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
  closure_reference TEXT,
  payload_json JSONB NOT NULL,
  PRIMARY KEY (academic_year_id, class_reference, version),
  FOREIGN KEY (academic_year_id, class_reference)
    REFERENCES gradebook.council_session_streams (academic_year_id, class_reference),
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
);

CREATE TABLE IF NOT EXISTS gradebook.gradebook_import_stage_sessions (
  session_id TEXT NOT NULL CHECK (length(session_id) > 0),
  academic_year_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  expected_chunk_count INTEGER NOT NULL CHECK (
    expected_chunk_count >= 1 AND expected_chunk_count <= 512
  ),
  state TEXT NOT NULL CHECK (state IN ('preparing', 'committed', 'blocked')),
  metadata_json JSONB NOT NULL,
  meta_write_json JSONB,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  committed_at TIMESTAMPTZ,
  PRIMARY KEY (session_id),
  FOREIGN KEY (academic_year_id) REFERENCES gradebook.academic_years (academic_year_id),
  CHECK (
    (state = 'committed' AND committed_at IS NOT NULL AND result_json IS NOT NULL)
    OR (state <> 'committed' AND committed_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS gradebook.gradebook_import_stage_chunks (
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_hash TEXT NOT NULL CHECK (chunk_hash ~ '^[0-9a-f]{64}$'),
  payload_json JSONB NOT NULL,
  incoming_keys_json JSONB NOT NULL,
  entity_write_count INTEGER NOT NULL CHECK (entity_write_count >= 0),
  academic_record_write_count INTEGER NOT NULL CHECK (academic_record_write_count >= 0),
  association_write_count INTEGER NOT NULL CHECK (association_write_count >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (session_id, chunk_index),
  FOREIGN KEY (session_id)
    REFERENCES gradebook.gradebook_import_stage_sessions (session_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_academic_years_year
  ON gradebook.academic_years (year, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_academic_year_versions_current
  ON gradebook.academic_year_versions (academic_year_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_academic_configuration_versions_page
  ON gradebook.academic_year_configuration_versions (
    academic_year_id,
    configuration_id,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_academic_entity_streams_page
  ON gradebook.academic_entity_streams (academic_year_id, entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS idx_academic_entity_versions_history
  ON gradebook.academic_entity_versions (
    academic_year_id,
    entity_kind,
    entity_id,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_academic_entity_versions_relations
  ON gradebook.academic_entity_versions (
    academic_year_id,
    student_id,
    enrollment_id,
    teaching_assignment_id
  );
CREATE INDEX IF NOT EXISTS idx_logical_sources_context
  ON gradebook.logical_sources (
    academic_year_id,
    teacher_id,
    class_group_id,
    subject_id,
    logical_source_id
  );
CREATE INDEX IF NOT EXISTS idx_source_file_streams_hash
  ON gradebook.source_file_streams (academic_year_id, current_sha256, manifest_id);
CREATE INDEX IF NOT EXISTS idx_source_file_versions_history
  ON gradebook.source_file_versions (academic_year_id, manifest_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_source_file_versions_logical_source
  ON gradebook.source_file_versions (
    academic_year_id,
    confirmed_logical_source_id,
    recorded_at,
    manifest_id,
    version
  );
CREATE INDEX IF NOT EXISTS idx_import_batch_streams_page
  ON gradebook.import_batch_streams (academic_year_id, import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_versions_history
  ON gradebook.import_batch_versions (academic_year_id, import_batch_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_import_batch_files_status
  ON gradebook.import_batch_files (
    academic_year_id,
    import_batch_id,
    batch_version,
    status,
    import_file_id
  );
CREATE INDEX IF NOT EXISTS idx_import_diagnostics_file
  ON gradebook.import_diagnostics (
    academic_year_id,
    import_batch_id,
    batch_version,
    import_file_id,
    diagnostic_id
  );
CREATE INDEX IF NOT EXISTS idx_import_diagnostics_severity
  ON gradebook.import_diagnostics (academic_year_id, severity, diagnostic_id);
CREATE INDEX IF NOT EXISTS idx_academic_record_streams_current_page
  ON gradebook.academic_record_streams (
    academic_year_id,
    record_kind,
    student_id,
    enrollment_id,
    stream_key
  );
CREATE INDEX IF NOT EXISTS idx_academic_record_streams_assignment
  ON gradebook.academic_record_streams (
    academic_year_id,
    teaching_assignment_id,
    term,
    record_kind,
    stream_key
  );
CREATE INDEX IF NOT EXISTS idx_academic_record_versions_history
  ON gradebook.academic_record_versions (
    academic_year_id,
    record_kind,
    stream_key,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_academic_record_versions_record_id
  ON gradebook.academic_record_versions (
    academic_year_id,
    record_kind,
    record_id,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_audit_record_streams_page
  ON gradebook.audit_record_streams (academic_year_id, audit_kind, audit_record_id);
CREATE INDEX IF NOT EXISTS idx_audit_record_versions_history
  ON gradebook.audit_record_versions (
    academic_year_id,
    audit_kind,
    audit_record_id,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_audit_occurrences_state
  ON gradebook.audit_record_versions (
    academic_year_id,
    occurrence_state,
    severity,
    audit_record_id,
    version DESC
  )
  WHERE audit_kind = 'occurrence';
CREATE INDEX IF NOT EXISTS idx_reconciliations_target
  ON gradebook.audit_record_versions (
    academic_year_id,
    target_kind,
    target_record_id,
    audit_record_id,
    version DESC
  )
  WHERE audit_kind = 'reconciliation';
CREATE INDEX IF NOT EXISTS idx_audit_source_provenance
  ON gradebook.audit_record_versions (
    academic_year_id,
    source_manifest_id,
    source_manifest_version,
    audit_record_id
  );
CREATE INDEX IF NOT EXISTS idx_audit_transitions_history
  ON gradebook.audit_occurrence_transitions (
    academic_year_id,
    occurrence_id,
    transition_sequence DESC
  );
CREATE INDEX IF NOT EXISTS idx_logical_source_record_streams_current
  ON gradebook.logical_source_record_streams (
    academic_year_id,
    logical_source_id,
    record_kind,
    stream_key
  )
  WHERE current_state = 'active';
CREATE INDEX IF NOT EXISTS idx_logical_source_record_versions_history
  ON gradebook.logical_source_record_versions (
    academic_year_id,
    logical_source_id,
    record_kind,
    stream_key,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_logical_source_record_versions_manifest
  ON gradebook.logical_source_record_versions (
    academic_year_id,
    source_manifest_id,
    source_manifest_version,
    logical_source_id
  );
CREATE INDEX IF NOT EXISTS idx_bulletin_snapshot_versions_history
  ON gradebook.bulletin_snapshot_versions (series_key, version DESC);
CREATE INDEX IF NOT EXISTS idx_bulletin_snapshot_versions_class_page
  ON gradebook.bulletin_snapshot_versions (
    academic_year_id,
    class_group_id,
    emitted_at DESC,
    snapshot_id,
    version DESC,
    student_id
  );
CREATE INDEX IF NOT EXISTS idx_bulletin_snapshot_versions_student_page
  ON gradebook.bulletin_snapshot_versions (
    academic_year_id,
    class_group_id,
    student_id,
    emitted_at DESC,
    snapshot_id,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_council_decision_versions_history
  ON gradebook.council_decision_versions (
    academic_year_id,
    class_reference,
    student_reference,
    version DESC
  );
CREATE INDEX IF NOT EXISTS idx_council_session_versions_history
  ON gradebook.council_session_versions (
    academic_year_id,
    class_reference,
    state,
    version DESC
  );
CREATE UNIQUE INDEX IF NOT EXISTS idx_council_session_versions_closure_reference
  ON gradebook.council_session_versions (closure_reference)
  WHERE closure_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gradebook_import_stage_sessions_expiry
  ON gradebook.gradebook_import_stage_sessions (state, expires_at);
CREATE INDEX IF NOT EXISTS idx_gradebook_import_stage_chunks_session
  ON gradebook.gradebook_import_stage_chunks (session_id, chunk_index);

INSERT INTO gradebook.gradebook_schema_migrations (version, name, applied_at)
VALUES
  (1, 'gradebook_context_entities_imports_v1', clock_timestamp()),
  (2, 'gradebook_records_audit_v1', clock_timestamp()),
  (3, 'logical_source_record_catalog_v1', clock_timestamp()),
  (4, 'bulletin_council_durability_v1', clock_timestamp()),
  (5, 'council_session_durability_v2', clock_timestamp()),
  (6, 'import_staging_v1', clock_timestamp())
ON CONFLICT (version) DO NOTHING;

REVOKE ALL ON SCHEMA gradebook FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA gradebook FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA gradebook FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gradebook FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook REVOKE ALL ON FUNCTIONS FROM PUBLIC;
