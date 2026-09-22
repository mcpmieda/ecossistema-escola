-- #1093: aggregate observations only; no academic or pre-existing audit retention changes.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
CREATE TABLE system_health.portal_signal_v1 (
  bucket_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('challenge','login','activation','session','profile','browser-module','browser-render','browser-read')),
  outcome text NOT NULL CHECK (outcome IN ('ok','refused','limited','failed')),
  samples integer NOT NULL CHECK (samples BETWEEN 1 AND 1000),
  total_ms integer NOT NULL CHECK (total_ms BETWEEN 0 AND 60000000),
  max_ms integer NOT NULL CHECK (max_ms BETWEEN 0 AND 60000),
  slow integer NOT NULL CHECK (slow BETWEEN 0 AND samples),
  capped boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (bucket_at,source,outcome),
  CHECK (isfinite(bucket_at) AND bucket_at = date_bin(interval '5 minutes',bucket_at,timestamptz '2000-01-01 00:00:00+00')),
  CHECK (total_ms >= max_ms AND total_ms <= samples * max_ms),
  CHECK (max_ms >= 3000 OR slow = 0),
  CHECK (source NOT LIKE 'browser-%' OR (outcome='failed' AND max_ms=0 AND samples<=60))
);
REVOKE ALL ON system_health.portal_signal_v1 FROM PUBLIC, student_portal_app;
DO $$ DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','gradebook_app'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON system_health.portal_signal_v1 FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
ALTER TABLE system_health.portal_signal_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_signal_backend_v1 ON system_health.portal_signal_v1
  FOR ALL TO student_portal_app USING (true) WITH CHECK (true);
GRANT SELECT, DELETE ON system_health.portal_signal_v1 TO student_portal_app;
GRANT INSERT (bucket_at,source,outcome,samples,total_ms,max_ms,slow,capped)
  ON system_health.portal_signal_v1 TO student_portal_app;
GRANT UPDATE (samples,total_ms,max_ms,slow,capped)
  ON system_health.portal_signal_v1 TO student_portal_app;
COMMIT;
