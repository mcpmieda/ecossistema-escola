-- #1119: private Supabase Storage is canonical for photo bytes. Apply once after
-- the original references have been inventoried; the import itself follows.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM student_photos.asset_delivery_v1)
    OR EXISTS (SELECT 1 FROM student_photos.portal_delivery_v1)
    OR EXISTS (SELECT 1 FROM student_photos.photo_family_v1 WHERE assets->'portrait'<>'null'::jsonb OR assets->'avatar'<>'null'::jsonb)
  THEN RAISE EXCEPTION 'photo-storage-cutover-requires-empty-delivery'; END IF;
END $$;

ALTER TABLE student_photos.asset_delivery_v1 ALTER COLUMN image_webp DROP NOT NULL;
ALTER TABLE student_photos.asset_delivery_v1 ADD COLUMN storage_path text;
ALTER TABLE student_photos.asset_delivery_v1 ADD CONSTRAINT asset_delivery_one_location_v1
  CHECK ((image_webp IS NULL) <> (storage_path IS NULL));
ALTER TABLE student_photos.portal_delivery_v1 ADD COLUMN storage_path text;
ALTER TABLE student_photos.portal_delivery_v1 ADD COLUMN byte_size integer
  CHECK (byte_size IS NULL OR byte_size BETWEEN 20 AND 131072);
ALTER TABLE student_photos.portal_delivery_v1 ADD CONSTRAINT portal_delivery_revoked_storage_v1
  CHECK (revoked_at IS NULL OR storage_path IS NULL);
COMMENT ON TABLE student_photos.portal_delivery_v1 IS
  'Approved private portrait metadata. Image bytes are held in the student-photos Storage bucket.';

DROP POLICY portal_delivery_runtime_read_v1 ON student_photos.portal_delivery_v1;
CREATE POLICY portal_delivery_runtime_read_v1 ON student_photos.portal_delivery_v1
  FOR SELECT TO student_portal_app USING (image_use_authorized AND approved_at IS NOT NULL
    AND authorized_at <= statement_timestamp() AND approved_at <= statement_timestamp()
    AND approved_source_revision=source_revision AND revoked_at IS NULL AND storage_path IS NOT NULL);

CREATE OR REPLACE FUNCTION student_photos.revoke_changed_portrait_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.assets->'portrait' IS DISTINCT FROM OLD.assets->'portrait'
    OR (NEW.revision IS DISTINCT FROM OLD.revision AND NEW.assets->'portrait'='null'::jsonb) THEN
    UPDATE student_photos.portal_delivery_v1
      SET image_webp=NULL,storage_path=NULL,revoked_at=statement_timestamp()
      WHERE student_uid=NEW.student_uid;
  END IF;
  RETURN NEW;
END $$;

-- Future edits must not mirror Storage paths into legacy SharePoint columns.
DROP TRIGGER photo_family_mirror_legacy_v1 ON student_photos.photo_family_v1;
DROP FUNCTION student_photos.mirror_legacy_photo_v1();
DROP FUNCTION student_photos.publish_asset_v1(uuid,uuid,text,jsonb,bytea);

CREATE OR REPLACE FUNCTION student_photos.initialize_family_v1(p_uid uuid,p_actor uuid,p_legacy jsonb,p_asset jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_actor IS NULL OR p_uid IS NULL OR p_legacy IS NOT NULL OR p_asset IS NOT NULL
    THEN RAISE EXCEPTION 'photo-context-invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('student-photo:'||p_uid::text,1119));
  IF EXISTS(SELECT 1 FROM student_photos.photo_family_v1 WHERE student_uid=p_uid) THEN RETURN; END IF;
  IF student_photos.legacy_reference_v1(p_uid) IS NOT NULL
    THEN RAISE EXCEPTION 'photo-storage-import-required' USING ERRCODE='40001'; END IF;
  INSERT INTO student_photos.photo_family_v1(student_uid,assets)
    VALUES(p_uid,jsonb_build_object('portrait',NULL,'avatar',NULL));
END $$;

CREATE FUNCTION student_photos.publish_storage_asset_v1(p_uid uuid,p_actor uuid,p_variant text,p_asset jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE family student_photos.photo_family_v1%ROWTYPE; image_revision uuid;
  digest text; object_path text; w integer; h integer; size integer;
BEGIN
  SELECT * INTO family FROM student_photos.photo_family_v1 WHERE student_uid=p_uid FOR UPDATE;
  IF NOT FOUND OR family.revision IS NULL OR p_actor IS NULL OR p_variant IS NULL
    OR p_variant NOT IN ('portrait','avatar')
    OR p_asset IS NULL OR family.assets->p_variant IS DISTINCT FROM p_asset
    THEN RAISE EXCEPTION 'photo-storage-publication-conflict' USING ERRCODE='40001'; END IF;
  digest:=p_asset->>'sha256'; object_path:=p_asset->>'itemId';
  w:=(p_asset->>'width')::integer; h:=(p_asset->>'height')::integer;
  size:=(p_asset->>'byteSize')::integer;
  IF p_asset->>'driveId' IS DISTINCT FROM 'student-photos' OR digest IS NULL
    OR digest !~ '^[a-f0-9]{64}$' OR object_path IS NULL OR size IS NULL OR w IS NULL OR h IS NULL
    OR p_asset->>'etag' IS DISTINCT FROM digest
    OR object_path NOT IN ('legacy/'||p_uid::text||'/'||digest||'.webp',
      'write/'||p_uid::text||'/'||family.revision::text||'/'||p_variant||'-'||digest||'.webp')
    OR size NOT BETWEEN 20 AND (CASE WHEN p_variant='portrait' THEN 131072 ELSE 65536 END)
    OR w NOT BETWEEN 1 AND 900 OR h NOT BETWEEN 1 AND 1200
    OR (p_variant='portrait' AND w*4<>h*3)
    OR (p_variant='avatar' AND (w<>h OR w>320))
    THEN RAISE EXCEPTION 'photo-storage-asset-invalid' USING ERRCODE='22023'; END IF;
  INSERT INTO student_photos.asset_delivery_v1(student_uid,variant,revision,source_asset,image_webp,storage_path)
    VALUES(p_uid,p_variant,gen_random_uuid(),p_asset,NULL,object_path)
    ON CONFLICT(student_uid,variant) DO UPDATE SET revision=EXCLUDED.revision,
      source_asset=EXCLUDED.source_asset,image_webp=NULL,storage_path=EXCLUDED.storage_path,
      updated_at=statement_timestamp()
      WHERE student_photos.asset_delivery_v1.source_asset IS DISTINCT FROM EXCLUDED.source_asset;
  SELECT revision INTO image_revision FROM student_photos.asset_delivery_v1 WHERE student_uid=p_uid AND variant=p_variant;
  IF p_variant='portrait' THEN
    INSERT INTO student_photos.portal_delivery_v1(student_uid,revision,source_revision,approved_source_revision,
      source_sha256,portrait_sha256,width,height,image_webp,storage_path,byte_size,image_use_authorized,
      authorized_by,authorized_at,authorization_reference,approved_by,approved_at,revoked_at)
    VALUES(p_uid,image_revision,family.revision,family.revision,digest,digest,w,h,NULL,object_path,size,true,
      p_actor,statement_timestamp(),'enrollment-authorization-confirmed-2026-09-23',p_actor,statement_timestamp(),NULL)
    ON CONFLICT(student_uid) DO UPDATE SET revision=EXCLUDED.revision,source_revision=EXCLUDED.source_revision,
      approved_source_revision=EXCLUDED.approved_source_revision,source_sha256=EXCLUDED.source_sha256,
      portrait_sha256=EXCLUDED.portrait_sha256,width=EXCLUDED.width,height=EXCLUDED.height,
      image_webp=NULL,storage_path=EXCLUDED.storage_path,byte_size=EXCLUDED.byte_size,image_use_authorized=true,
      authorized_by=EXCLUDED.authorized_by,authorized_at=EXCLUDED.authorized_at,
      authorization_reference=EXCLUDED.authorization_reference,approved_by=EXCLUDED.approved_by,
      approved_at=EXCLUDED.approved_at,revoked_at=NULL
    WHERE student_photos.portal_delivery_v1.revision IS DISTINCT FROM EXCLUDED.revision
      OR student_photos.portal_delivery_v1.revoked_at IS NOT NULL;
  END IF;
END $$;

CREATE FUNCTION student_photos.adopt_storage_photo_v1(p_uid uuid,p_legacy jsonb,p_asset jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_legacy jsonb; existing jsonb; migration_actor uuid:='00000000-0000-4000-8000-000000001119';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('student-photo:'||p_uid::text,1119));
  current_legacy:=student_photos.legacy_reference_v1(p_uid);
  IF current_legacy IS NULL OR current_legacy IS DISTINCT FROM p_legacy
    OR (p_asset->>'byteSize')::bigint IS DISTINCT FROM (current_legacy->>'byteSize')::bigint
    THEN RAISE EXCEPTION 'photo-storage-legacy-mismatch' USING ERRCODE='40001'; END IF;
  SELECT assets->'portrait' INTO existing FROM student_photos.photo_family_v1 WHERE student_uid=p_uid FOR UPDATE;
  IF FOUND THEN
    IF existing IS DISTINCT FROM p_asset THEN RAISE EXCEPTION 'photo-storage-family-conflict' USING ERRCODE='40001'; END IF;
  ELSE
    INSERT INTO student_photos.photo_family_v1(student_uid,revision,assets)
      VALUES(p_uid,gen_random_uuid(),jsonb_build_object('portrait',p_asset,'avatar',NULL));
  END IF;
  PERFORM student_photos.publish_storage_asset_v1(p_uid,migration_actor,'portrait',p_asset);
END $$;

REVOKE ALL ON FUNCTION student_photos.publish_storage_asset_v1(uuid,uuid,text,jsonb),
  student_photos.adopt_storage_photo_v1(uuid,jsonb,jsonb) FROM PUBLIC,student_portal_app;
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION student_photos.publish_storage_asset_v1(uuid,uuid,text,jsonb),student_photos.adopt_storage_photo_v1(uuid,jsonb,jsonb) FROM %I',r);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION student_photos.publish_storage_asset_v1(uuid,uuid,text,jsonb) TO gradebook_app;
COMMENT ON FUNCTION student_photos.adopt_storage_photo_v1(uuid,jsonb,jsonb) IS
  'One-time privileged migration of exact linked originals; not granted to application roles.';
COMMIT;
