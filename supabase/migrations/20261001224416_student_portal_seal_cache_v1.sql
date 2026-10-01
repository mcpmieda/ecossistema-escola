-- #1221: private derived counts, validated against fresh authorization/version metadata on every hit.
BEGIN;

CREATE TABLE student_portal.seal_count_cache_v1 (
  account_id uuid PRIMARY KEY REFERENCES student_portal.account(id) ON DELETE CASCADE,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  seals integer CHECK (seals IS NULL OR seals >= 0),
  computed_at timestamptz NOT NULL CHECK (isfinite(computed_at)),
  expires_at timestamptz CHECK (expires_at IS NULL OR (isfinite(expires_at) AND expires_at > computed_at))
);

REVOKE ALL ON student_portal.seal_count_cache_v1 FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON student_portal.seal_count_cache_v1 FROM %I',client_role);
    END IF;
  END LOOP;
END;
$$;
ALTER TABLE student_portal.seal_count_cache_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_portal_app_backend_v1 ON student_portal.seal_count_cache_v1
  FOR ALL TO student_portal_app USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE ON student_portal.seal_count_cache_v1 TO student_portal_app;

COMMIT;
