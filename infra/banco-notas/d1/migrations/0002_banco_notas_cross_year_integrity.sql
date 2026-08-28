PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS source_assignments_source_year_guard_insert
BEFORE INSERT ON source_assignments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM data_sources source
    WHERE source.id = NEW.data_source_id
      AND source.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'source assignment year mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS source_assignments_source_year_guard_update
BEFORE UPDATE ON source_assignments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM data_sources source
    WHERE source.id = NEW.data_source_id
      AND source.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'source assignment year mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS teacher_assignments_year_guard_insert
BEFORE INSERT ON teacher_assignments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM class_groups class_group
    WHERE class_group.id = NEW.class_group_id
      AND class_group.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'teacher assignment class year mismatch') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM components component
    WHERE component.id = NEW.component_id
      AND component.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'teacher assignment component year mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS teacher_assignments_year_guard_update
BEFORE UPDATE ON teacher_assignments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM class_groups class_group
    WHERE class_group.id = NEW.class_group_id
      AND class_group.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'teacher assignment class year mismatch') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM components component
    WHERE component.id = NEW.component_id
      AND component.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'teacher assignment component year mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS relationship_snapshots_source_year_guard_insert
BEFORE INSERT ON relationship_snapshots
WHEN NEW.source_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM data_sources source
    WHERE source.id = NEW.source_id
      AND source.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'relationship snapshot source year mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS relationship_snapshots_source_year_guard_update
BEFORE UPDATE ON relationship_snapshots
WHEN NEW.source_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM data_sources source
    WHERE source.id = NEW.source_id
      AND source.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'relationship snapshot source year mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS import_jobs_source_year_guard_insert
BEFORE INSERT ON import_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM data_sources source
    WHERE source.id = NEW.data_source_id
      AND source.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'import job source year mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS import_jobs_source_year_guard_update
BEFORE UPDATE ON import_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM data_sources source
    WHERE source.id = NEW.data_source_id
      AND source.school_year_id = NEW.school_year_id
  ) THEN RAISE(ABORT, 'import job source year mismatch') END;
END;
