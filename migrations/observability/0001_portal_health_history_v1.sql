-- #1091: aggregate operational history only; no academic or security-audit retention changes.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
CREATE SCHEMA IF NOT EXISTS system_health;
REVOKE ALL ON SCHEMA system_health FROM PUBLIC;

CREATE TABLE system_health.portal_sample_v1 (
  bucket_at timestamptz PRIMARY KEY DEFAULT date_bin(interval '5 minutes', statement_timestamp(), timestamptz '2000-01-01 00:00:00+00'),
  observed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  serving_enabled boolean NOT NULL,
  credentials_configured boolean NOT NULL,
  maintenance_state text NOT NULL CHECK (maintenance_state IN ('normal', 'attention', 'intervention')),
  publication_due integer NOT NULL CHECK (publication_due BETWEEN 0 AND 1001),
  live_pending integer CHECK (live_pending BETWEEN 0 AND 1001),
  waiting_connections integer NOT NULL CHECK (waiting_connections >= 0),
  read_duration_ms integer NOT NULL CHECK (read_duration_ms >= 0),
  CHECK (isfinite(bucket_at) AND isfinite(observed_at)),
  CHECK (bucket_at = date_bin(interval '5 minutes', bucket_at, timestamptz '2000-01-01 00:00:00+00')),
  CHECK (observed_at >= bucket_at AND observed_at < bucket_at + interval '5 minutes')
);
CREATE INDEX portal_sample_v1_retention_idx ON system_health.portal_sample_v1 (observed_at);
REVOKE ALL ON system_health.portal_sample_v1 FROM PUBLIC;
-- Supabase owner default privileges must not expose this private table to API roles.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'gradebook_app'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON system_health.portal_sample_v1 FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
ALTER TABLE system_health.portal_sample_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_sample_backend_v1 ON system_health.portal_sample_v1
  FOR ALL TO student_portal_app USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA system_health TO student_portal_app;
GRANT SELECT, DELETE ON system_health.portal_sample_v1 TO student_portal_app;
-- The application cannot supply timestamps or rewrite an existing sample.
GRANT INSERT (serving_enabled, credentials_configured, maintenance_state, publication_due,
  live_pending, waiting_connections, read_duration_ms)
  ON system_health.portal_sample_v1 TO student_portal_app;
COMMIT;
