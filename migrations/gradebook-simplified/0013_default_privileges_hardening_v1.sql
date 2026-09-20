-- BN-12 Gate 2 / #1036
-- Harden only default privileges for objects created in the future.
-- Existing object ACLs are intentionally untouched.
--
-- Rollback, if institutionally authorized:
-- ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gradebook_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook
--   GRANT USAGE, SELECT ON SEQUENCES TO gradebook_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook
--   GRANT EXECUTE ON FUNCTIONS TO gradebook_app;
-- ALTER DEFAULT PRIVILEGES
--   GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--
-- These defaults apply only to objects created by the migration owner executing
-- this file. The same owner must be used consistently with application_role_grants.sql.

BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM gradebook_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook
  REVOKE USAGE, SELECT ON SEQUENCES FROM gradebook_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook
  REVOKE EXECUTE ON FUNCTIONS FROM gradebook_app;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC through the owner's
-- global default ACL. A schema-local REVOKE cannot subtract a global default.
-- Harden the migration owner's future functions globally; every future function
-- must receive its intended EXECUTE grants explicitly.
ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
