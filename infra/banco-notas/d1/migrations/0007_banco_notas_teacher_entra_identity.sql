ALTER TABLE teachers ADD COLUMN entra_object_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_entra_object_id_unique
ON teachers(entra_object_id)
WHERE entra_object_id IS NOT NULL;

-- Fail safe for any pre-existing homologation row created before this invariant.
-- A model without an institutional Entra identity can never remain sync-enabled.
UPDATE teacher_models
SET sync_enabled = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE sync_enabled = 1
  AND NOT EXISTS (
    SELECT 1
    FROM teachers teacher
    WHERE teacher.id = teacher_models.teacher_id
      AND teacher.status = 'active'
      AND teacher.entra_object_id IS NOT NULL
  );

CREATE TRIGGER IF NOT EXISTS trg_teacher_model_sync_requires_entra_insert
BEFORE INSERT ON teacher_models
WHEN NEW.sync_enabled = 1
  AND NOT EXISTS (
    SELECT 1
    FROM teachers teacher
    WHERE teacher.id = NEW.teacher_id
      AND teacher.status = 'active'
      AND teacher.entra_object_id IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'teacher model entra identity required for sync');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_model_sync_requires_entra_update
BEFORE UPDATE OF sync_enabled, teacher_id ON teacher_models
WHEN NEW.sync_enabled = 1
  AND NOT EXISTS (
    SELECT 1
    FROM teachers teacher
    WHERE teacher.id = NEW.teacher_id
      AND teacher.status = 'active'
      AND teacher.entra_object_id IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'teacher model entra identity required for sync');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_entra_identity_locked_while_sync
BEFORE UPDATE OF entra_object_id ON teachers
WHEN OLD.entra_object_id IS NOT NEW.entra_object_id
  AND EXISTS (
    SELECT 1
    FROM teacher_models model
    WHERE model.teacher_id = OLD.id
      AND model.sync_enabled = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'teacher entra identity locked while sync enabled');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_must_remain_active_while_sync
BEFORE UPDATE OF status ON teachers
WHEN NEW.status <> 'active'
  AND EXISTS (
    SELECT 1
    FROM teacher_models model
    WHERE model.teacher_id = OLD.id
      AND model.sync_enabled = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'active teacher required while sync enabled');
END;
