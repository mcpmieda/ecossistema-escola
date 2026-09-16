-- #827: logical return to the current parent, without deleting a release or copying grades.
-- Default zero preserves all existing decisions. No new grants, routines or row rewrites.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE student_portal.publication_release_v2
  ADD COLUMN inherit_version bigint NOT NULL DEFAULT 0;
ALTER TABLE student_portal.publication_release_v2
  ADD CONSTRAINT publication_inheritance_marker_v1 CHECK (
    inherit_version>=0 AND inherit_version<=version
    AND (scope_kind<>'school' OR inherit_version=0)
  );
COMMENT ON COLUMN student_portal.publication_release_v2.inherit_version IS
  'Decision is explicit only while version > inherit_version. A reset marks the current version; a later explicit command naturally has a greater version.';
COMMIT;
