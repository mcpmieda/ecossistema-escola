-- #1102: historical operator/entity labels on the existing private audit table.
-- Additive only. Old events remain unknown; no fabricated backfill, new grants, public API or retention change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE student_portal.audit_event
  ADD COLUMN actor_name varchar(200),
  ADD COLUMN subject_name varchar(200),
  ADD COLUMN subject_class_id integer,
  ADD COLUMN subject_class_label varchar(80),
  ADD CONSTRAINT student_portal_audit_subject_class_v1 CHECK (subject_class_id IS NULL OR subject_class_id > 0);

CREATE FUNCTION student_portal.capture_audit_entities_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE
  v_student_id integer;
  v_class_count integer;
BEGIN
  -- Only a name from the verified ADM identity, scoped to this transaction and this actor.
  NEW.actor_name := CASE WHEN NULLIF(current_setting('student_portal.audit_actor_id', true),'') = NEW.actor_id::text
    THEN left(NULLIF(current_setting('student_portal.audit_actor_name', true),''),200) ELSE NULL END;
  NEW.subject_name := NULL;
  NEW.subject_class_id := NULL;
  NEW.subject_class_label := NULL;
  IF NEW.account_id IS NOT NULL THEN
    SELECT COALESCE(a.gradebook_student_id,c.gradebook_student_id) INTO v_student_id
      FROM student_portal.account a LEFT JOIN student_portal.link_closure c ON c.account_id=a.id
      WHERE a.id=NEW.account_id AND a.academic_year=2026;
    SELECT left(s.name,200) INTO NEW.subject_name FROM student_portal.academic_student_v1 s
      WHERE s.student_id=v_student_id AND s.academic_year=2026;
    SELECT count(*)::integer,min(b.class_id),left(min(b.class_name),80)
      INTO v_class_count,NEW.subject_class_id,NEW.subject_class_label
      FROM student_portal.academic_binding_v1 b
      WHERE b.student_id=v_student_id AND b.academic_year=2026 AND b.status IS DISTINCT FROM 6;
    IF v_class_count <> 1 THEN NEW.subject_class_id := NULL; NEW.subject_class_label := NULL; END IF;
  ELSIF NEW.scope_json->>'kind'='class' THEN
    NEW.subject_class_id := (NEW.scope_json->>'classId')::integer;
    SELECT left(min(b.class_name),80) INTO NEW.subject_class_label
      FROM student_portal.academic_binding_v1 b WHERE b.class_id=NEW.subject_class_id AND b.academic_year=2026;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION student_portal.capture_audit_entities_v1() FROM PUBLIC;
CREATE TRIGGER student_portal_capture_audit_entities_v1 BEFORE INSERT ON student_portal.audit_event
  FOR EACH ROW EXECUTE FUNCTION student_portal.capture_audit_entities_v1();
CREATE INDEX student_portal_audit_subject_class_idx_v1 ON student_portal.audit_event(subject_class_id,occurred_at DESC,event_id)
  WHERE subject_class_id IS NOT NULL;
COMMIT;
