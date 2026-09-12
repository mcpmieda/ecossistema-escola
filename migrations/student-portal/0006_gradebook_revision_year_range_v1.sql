-- #706: extend only technical revision recording to the contracted BN year range.
-- Scaffold: Supabase CLI migration new gradebook_revision_year_range_v1; repository slot 0006.
-- No academic DML, public grants or expansion of Portal account scope.
BEGIN;

CREATE OR REPLACE FUNCTION student_portal.record_gradebook_change_v1(
  p_event_id uuid,
  p_academic_year smallint,
  p_cause text,
  p_affects_academic boolean,
  p_student_ids integer[],
  p_occurred_at timestamptz
)
RETURNS TABLE(data_version text, reset_version text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE
  v_row student_portal.academic_revision%ROWTYPE;
  v_existing student_portal.revision_event%ROWTYPE;
BEGIN
  IF p_academic_year IS NULL OR p_academic_year NOT BETWEEN 2000 AND 9999 THEN
    RAISE EXCEPTION 'student-portal-year-not-supported' USING ERRCODE = '22023';
  END IF;
  IF p_cause NOT IN ('relation','marks','council','academic-policy','diagnostics','audit-treatment','bulletin-snapshot') THEN
    RAISE EXCEPTION 'student-portal-revision-cause-invalid' USING ERRCODE = '22023';
  END IF;
  IF p_student_ids IS NULL OR EXISTS (SELECT 1 FROM unnest(p_student_ids) AS id WHERE id IS NULL OR id <= 0) THEN
    RAISE EXCEPTION 'student-portal-student-ids-invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM student_portal.revision_event
  WHERE event_id = p_event_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.data_version, v_existing.reset_version;
    RETURN;
  END IF;

  UPDATE student_portal.academic_revision
  SET academic_counter = academic_counter + CASE WHEN p_affects_academic THEN 1 ELSE 0 END,
      reset_counter = reset_counter + 1,
      updated_at = p_occurred_at
  WHERE academic_year = p_academic_year
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student-portal-revision-state-missing' USING ERRCODE = '55000';
  END IF;

  INSERT INTO student_portal.revision_event
    (event_id, academic_year, student_ids, cause, affects_academic, affects_reset,
     data_version, reset_version, portal_link_version, occurred_at)
  VALUES
    (p_event_id, p_academic_year, p_student_ids, p_cause, p_affects_academic, true,
     v_row.academic_generation || ':' || v_row.academic_counter::text,
     v_row.reset_generation || ':' || v_row.reset_counter::text,
     v_row.portal_link_generation || ':' || v_row.portal_link_counter::text,
     p_occurred_at);

  RETURN QUERY SELECT
    v_row.academic_generation || ':' || v_row.academic_counter::text,
    v_row.reset_generation || ':' || v_row.reset_counter::text;
END
$$;

REVOKE ALL ON FUNCTION student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz) TO gradebook_app;

COMMIT;
