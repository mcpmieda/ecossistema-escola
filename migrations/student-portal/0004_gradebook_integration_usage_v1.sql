-- Portal do Aluno P1-02 / #704.
-- The Gradebook application role needs namespace visibility to invoke the single
-- SECURITY DEFINER integration function. No table privilege is granted.
BEGIN;
GRANT USAGE ON SCHEMA student_portal TO gradebook_app;
REVOKE ALL ON ALL TABLES IN SCHEMA student_portal FROM gradebook_app;
GRANT EXECUTE ON FUNCTION student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz) TO gradebook_app;
COMMIT;
