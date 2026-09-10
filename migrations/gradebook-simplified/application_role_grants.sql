-- Optional recovery provisioning; requires a pre-existing dedicated role and authorization.
-- No passwords, LOGIN, role creation, superuser, RLS bypass or production execution here.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gradebook_app') THEN
    RAISE EXCEPTION 'Provision the dedicated gradebook_app role through the authorized private process first';
  END IF;
END $$;
GRANT USAGE ON SCHEMA gradebook TO gradebook_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gradebook TO gradebook_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gradebook TO gradebook_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gradebook TO gradebook_app;
-- Defaults apply to the executing object owner only; use the intended migration owner.
ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gradebook_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook GRANT USAGE, SELECT ON SEQUENCES TO gradebook_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook GRANT EXECUTE ON FUNCTIONS TO gradebook_app;
COMMIT;
