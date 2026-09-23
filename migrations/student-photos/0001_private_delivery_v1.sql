-- #1119, delivery foundation only. CANDIDATE: not applied to production.
-- Depends on applied student-portal/0018. No legacy-photo backfill and no runtime writer.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA student_photos;
REVOKE ALL ON SCHEMA student_photos FROM PUBLIC;
CREATE TABLE student_photos.portal_delivery_v1 (
  student_uid uuid PRIMARY KEY REFERENCES gradebook.student_identity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision uuid NOT NULL UNIQUE,
  source_revision uuid NOT NULL,
  approved_source_revision uuid,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  portrait_sha256 text NOT NULL CHECK (portrait_sha256 ~ '^[0-9a-f]{64}$'),
  width integer NOT NULL CHECK (width > 0 AND width <= 900),
  height integer NOT NULL CHECK (height > 0 AND height <= 1200 AND width * 4 = height * 3),
  image_webp bytea CHECK (image_webp IS NULL OR (octet_length(image_webp) BETWEEN 20 AND 131072
    AND substring(image_webp FROM 1 FOR 4)=decode('52494646','hex')
    AND substring(image_webp FROM 9 FOR 4)=decode('57454250','hex'))),
  image_use_authorized boolean NOT NULL DEFAULT false,
  authorized_by uuid,
  authorized_at timestamptz,
  authorization_reference text CHECK (authorization_reference IS NULL OR length(btrim(authorization_reference)) BETWEEN 1 AND 256),
  approved_by uuid,
  approved_at timestamptz,
  revoked_at timestamptz,
  CHECK (NOT image_use_authorized OR (authorized_by IS NOT NULL AND authorized_at IS NOT NULL AND authorization_reference IS NOT NULL)),
  CHECK ((approved_at IS NULL AND approved_by IS NULL AND approved_source_revision IS NULL)
    OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_source_revision IS NOT NULL AND approved_source_revision=source_revision)),
  CHECK (revoked_at IS NULL OR image_webp IS NULL)
);
COMMENT ON TABLE student_photos.portal_delivery_v1 IS
  'One bounded 3x4 WebP delivery with background per permanent studentUid. SharePoint remains canonical. No implicit guardian authorization; not an upload API.';
ALTER TABLE student_photos.portal_delivery_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_photos.portal_delivery_v1 FROM PUBLIC, gradebook_app, student_portal_app;
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA student_photos FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON student_photos.portal_delivery_v1 FROM %I', role_name);
  END LOOP;
END
$$;
GRANT USAGE ON SCHEMA student_photos TO student_portal_app;
GRANT SELECT ON student_photos.portal_delivery_v1 TO student_portal_app;
CREATE POLICY portal_delivery_runtime_read_v1 ON student_photos.portal_delivery_v1
  FOR SELECT TO student_portal_app USING (image_use_authorized AND approved_at IS NOT NULL
    AND authorized_at <= statement_timestamp() AND approved_at <= statement_timestamp()
    AND approved_source_revision=source_revision AND revoked_at IS NULL AND image_webp IS NOT NULL);
-- The backend additionally binds every read to its freshly authorized session account.
-- Intentionally no INSERT/UPDATE/DELETE grants or SECURITY DEFINER publishing function.
COMMIT;
