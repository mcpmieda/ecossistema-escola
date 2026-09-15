-- Reject an obsolete or already-running materializer after scoped publication becomes authoritative.
-- Deletions remain available to lifecycle/privacy operations; expired-job cleanup remains permitted.
BEGIN;
CREATE FUNCTION student_portal.guard_legacy_publication_writer_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM student_portal.publication_control_v2 WHERE academic_year=2026 AND enabled)
    THEN RAISE EXCEPTION 'student-portal-scoped-cutover-conflict'; END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER student_portal_legacy_publication_guard_v2
  BEFORE INSERT OR UPDATE ON student_portal.publication
  FOR EACH STATEMENT EXECUTE FUNCTION student_portal.guard_legacy_publication_writer_v2();
CREATE TRIGGER student_portal_legacy_projection_guard_v2
  BEFORE INSERT OR UPDATE ON student_portal.published_projection
  FOR EACH STATEMENT EXECUTE FUNCTION student_portal.guard_legacy_publication_writer_v2();
CREATE TRIGGER student_portal_legacy_job_guard_v2
  BEFORE INSERT ON student_portal.publication_job
  FOR EACH STATEMENT EXECUTE FUNCTION student_portal.guard_legacy_publication_writer_v2();
REVOKE ALL ON FUNCTION student_portal.guard_legacy_publication_writer_v2() FROM PUBLIC;
COMMIT;
