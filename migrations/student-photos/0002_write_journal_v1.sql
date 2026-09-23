-- #1119 CANDIDATE, not applied. Depends on student-photos/0001 and identity/0018.
-- No legacy-photo backfill, no authorization grants to people and no photo publication.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE student_photos.photo_family_v1 (
  student_uid uuid PRIMARY KEY REFERENCES gradebook.student_identity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision uuid,
  pending_request uuid,
  assets jsonb NOT NULL DEFAULT '{"portrait":null,"avatar":null}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK ((jsonb_typeof(assets)='object' AND assets ?& ARRAY['portrait','avatar']
    AND assets - ARRAY['portrait','avatar']='{}'::jsonb
    AND jsonb_typeof(assets->'portrait') IN ('object','null')
    AND jsonb_typeof(assets->'avatar') IN ('object','null')) IS TRUE)
);
CREATE TABLE student_photos.write_operation_v1 (
  request_id uuid PRIMARY KEY,
  student_uid uuid NOT NULL REFERENCES student_photos.photo_family_v1(student_uid) ON UPDATE RESTRICT ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object' AND octet_length(receipt::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK ((receipt->>'requestId'=request_id::text AND receipt->>'studentUid'=student_uid::text
    AND receipt->>'actorId'=actor_id::text AND receipt->>'inputHash'=input_hash
    AND receipt->>'phase' IN ('prepared','committed','complete')) IS TRUE),
  CHECK (receipt ?& ARRAY['requestId','studentUid','actorId','inputHash','phase'])
);
CREATE INDEX photo_write_student_v1 ON student_photos.write_operation_v1(student_uid,created_at);
CREATE TABLE student_photos.write_audit_v1 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES student_photos.write_operation_v1(request_id) ON DELETE RESTRICT,
  student_uid uuid NOT NULL,
  actor_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('prepared','committed','cleanup-deleted','cleanup-already-absent','complete')),
  asset_key text CHECK (asset_key IS NULL OR length(asset_key) BETWEEN 1 AND 513),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
COMMENT ON TABLE student_photos.photo_family_v1 IS
  'Current canonical references and durable single-operation reservation per person. A tombstone revision prevents stale writes after deletion. Not a public API.';
COMMENT ON TABLE student_photos.write_operation_v1 IS
  'Actor/person/payload-bound idempotency receipt. No image bytes or credentials. Do not expire pending operations or unlock by elapsed time.';
COMMENT ON TABLE student_photos.write_audit_v1 IS
  'Append-only for runtime. Operational events only; no images, authorization documents or provider responses.';

ALTER TABLE student_photos.photo_family_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_photos.write_operation_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_photos.write_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_photos.photo_family_v1,student_photos.write_operation_v1,student_photos.write_audit_v1
  FROM PUBLIC,gradebook_app,student_portal_app;
REVOKE ALL ON SEQUENCE student_photos.write_audit_v1_id_seq FROM PUBLIC,gradebook_app,student_portal_app;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE student_photos.photo_family_v1,student_photos.write_operation_v1,student_photos.write_audit_v1 FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE student_photos.write_audit_v1_id_seq FROM %I',role_name);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA student_photos TO gradebook_app;
GRANT SELECT,INSERT,UPDATE ON student_photos.photo_family_v1,student_photos.write_operation_v1 TO gradebook_app;
GRANT SELECT,INSERT ON student_photos.write_audit_v1 TO gradebook_app;
GRANT USAGE ON SEQUENCE student_photos.write_audit_v1_id_seq TO gradebook_app;
CREATE POLICY photo_family_backend_v1 ON student_photos.photo_family_v1
  TO gradebook_app USING (true) WITH CHECK (true);
CREATE POLICY photo_operation_backend_v1 ON student_photos.write_operation_v1
  TO gradebook_app USING (true) WITH CHECK (true);
CREATE POLICY photo_audit_backend_read_v1 ON student_photos.write_audit_v1 FOR SELECT TO gradebook_app USING (true);
CREATE POLICY photo_audit_backend_insert_v1 ON student_photos.write_audit_v1 FOR INSERT TO gradebook_app WITH CHECK (true);

-- Runtime may revoke through a canonical change, but receives NO direct write grant on
-- portal_delivery_v1 and cannot set approval, consent or published bytes through this trigger.
CREATE FUNCTION student_photos.revoke_changed_portrait_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.assets->'portrait' IS DISTINCT FROM OLD.assets->'portrait'
    OR (NEW.revision IS DISTINCT FROM OLD.revision AND NEW.assets->'portrait'='null'::jsonb) THEN
    UPDATE student_photos.portal_delivery_v1
      SET image_webp=NULL,revoked_at=statement_timestamp()
      WHERE student_uid=NEW.student_uid;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION student_photos.revoke_changed_portrait_v1() FROM PUBLIC,gradebook_app,student_portal_app;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION student_photos.revoke_changed_portrait_v1() FROM %I',role_name);
  END LOOP;
END $$;
CREATE TRIGGER photo_family_revoke_portrait_v1 AFTER UPDATE OF assets,revision ON student_photos.photo_family_v1
  FOR EACH ROW EXECUTE FUNCTION student_photos.revoke_changed_portrait_v1();
COMMIT;
