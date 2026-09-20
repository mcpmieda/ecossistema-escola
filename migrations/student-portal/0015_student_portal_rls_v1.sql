-- #859: defense-in-depth RLS for the private Student Portal schema.
-- Existing student_portal_app grants remain the operation boundary; policies do not grant privileges.
BEGIN;

DO $$
DECLARE
  v_tables constant text[] := ARRAY[
    'academic_revision',
    'account',
    'account_access_data',
    'audit_event',
    'auth_attempt',
    'auth_challenge',
    'lifecycle_control',
    'lifecycle_snapshot',
    'link_close_preview',
    'link_closure',
    'live_event_outbox_v1',
    'operation_receipt',
    'password_credential',
    'publication',
    'publication_auto_approval_v2',
    'publication_control_v2',
    'publication_job',
    'publication_preparation_metrics_v3',
    'publication_release_v2',
    'publication_source_head_v2',
    'publication_source_v2',
    'published_projection',
    'qr_credential',
    'revision_event',
    'session',
    'setting',
    'year_reset_preview_proof'
  ];
  v_actual text[];
  v_table text;
  v_app oid;
BEGIN
  SELECT oid INTO v_app FROM pg_roles WHERE rolname='student_portal_app';
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'student-portal-rls-v1 requires the dedicated student_portal_app role';
  END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE oid=v_app) THEN
    RAISE EXCEPTION 'student-portal-rls-v1 refuses a student_portal_app role with BYPASSRLS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='student_portal'
      AND c.relkind IN ('r','p')
      AND c.relowner=v_app
  ) THEN
    RAISE EXCEPTION 'student-portal-rls-v1 refuses application-owned Portal tables';
  END IF;

  SELECT array_agg(tablename ORDER BY tablename)
  INTO v_actual
  FROM pg_tables
  WHERE schemaname='student_portal';

  IF v_actual IS DISTINCT FROM v_tables THEN
    RAISE EXCEPTION 'student-portal-rls-v1 table set changed: expected %, found %', v_tables, v_actual;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE student_portal.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format(
      'DROP POLICY IF EXISTS student_portal_app_backend_v1 ON student_portal.%I',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY student_portal_app_backend_v1 ON student_portal.%I FOR ALL TO student_portal_app USING (true) WITH CHECK (true)',
      v_table
    );
  END LOOP;
END
$$;

REVOKE ALL ON SCHEMA student_portal FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA student_portal FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA student_portal FROM PUBLIC;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated']::text[] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA student_portal FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA student_portal FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA student_portal FROM %I', v_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA student_portal REVOKE ALL ON TABLES FROM %I',
        v_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA student_portal REVOKE ALL ON SEQUENCES FROM %I',
        v_role
      );
    END IF;
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA student_portal REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA student_portal REVOKE ALL ON SEQUENCES FROM PUBLIC;

COMMIT;
