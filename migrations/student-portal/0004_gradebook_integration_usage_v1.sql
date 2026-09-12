-- Portal do Aluno P1-02 / #704.
-- The Gradebook application role gets namespace visibility plus two narrow
-- SECURITY DEFINER functions. It receives no table privilege in student_portal.
BEGIN;

CREATE FUNCTION student_portal.inspect_year_reset_guard_v1(p_academic_year smallint)
RETURNS TABLE(linked_count bigint, state text, portal_link_revision text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
  SELECT
    count(a.id)::bigint AS linked_count,
    CASE WHEN count(a.id) = 0 THEN 'clear' ELSE 'portal-linked-accounts' END AS state,
    r.portal_link_generation || ':' || r.portal_link_counter::text AS portal_link_revision
  FROM student_portal.academic_revision r
  LEFT JOIN student_portal.account a
    ON a.academic_year = r.academic_year
   AND a.gradebook_student_id IS NOT NULL
   AND a.closed_at IS NULL
  WHERE r.academic_year = p_academic_year
    AND p_academic_year = 2026
  GROUP BY r.portal_link_generation, r.portal_link_counter
$$;

GRANT USAGE ON SCHEMA student_portal TO gradebook_app;
REVOKE ALL ON ALL TABLES IN SCHEMA student_portal FROM gradebook_app;
REVOKE ALL ON FUNCTION student_portal.inspect_year_reset_guard_v1(smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_portal.inspect_year_reset_guard_v1(smallint) TO gradebook_app;
GRANT EXECUTE ON FUNCTION student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz) TO gradebook_app;

COMMIT;
