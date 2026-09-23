-- #1119: private runtime catalog, explicit legacy adoption and bounded publication.
-- Requires student-photos 0001/0002 and the already applied identity migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- This legacy table predates the repository's photo migrations. Reconstruct its
-- verified contract on a fresh installation; never drop or backfill the live table.
DO $$ BEGIN
  IF to_regclass('student_portal.profile_photo') IS NULL THEN
    CREATE TABLE student_portal.profile_photo (
      account_id uuid PRIMARY KEY REFERENCES student_portal.account(id) ON DELETE RESTRICT,
      sharepoint_drive_id text NOT NULL CHECK(length(btrim(sharepoint_drive_id))>0),
      sharepoint_item_id text NOT NULL CHECK(length(btrim(sharepoint_item_id))>0),
      content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
      byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=5242880),
      etag text, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(sharepoint_drive_id,sharepoint_item_id)
    );
    ALTER TABLE student_portal.profile_photo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON student_portal.profile_photo FROM PUBLIC;
    GRANT SELECT,INSERT,UPDATE,DELETE ON student_portal.profile_photo TO student_portal_app;
    CREATE POLICY profile_photo_backend_v1 ON student_portal.profile_photo
      TO student_portal_app USING(true) WITH CHECK(true);
  END IF;
END $$;

CREATE TABLE student_photos.asset_delivery_v1 (
  student_uid uuid NOT NULL REFERENCES student_photos.photo_family_v1(student_uid) ON DELETE RESTRICT,
  variant text NOT NULL CHECK(variant IN ('portrait','avatar')),
  revision uuid NOT NULL,
  source_asset jsonb NOT NULL CHECK(jsonb_typeof(source_asset)='object'),
  image_webp bytea NOT NULL CHECK(octet_length(image_webp) BETWEEN 20 AND 131072),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(student_uid,variant),
  CHECK(encode(sha256(image_webp),'hex')=source_asset->>'sha256'),
  CHECK(octet_length(image_webp)=(source_asset->>'byteSize')::integer),
  CHECK(substring(image_webp FROM 1 FOR 4)=decode('52494646','hex')
    AND substring(image_webp FROM 9 FOR 4)=decode('57454250','hex'))
);
ALTER TABLE student_photos.asset_delivery_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_photos.asset_delivery_v1 FROM PUBLIC,gradebook_app,student_portal_app;
GRANT SELECT ON student_photos.asset_delivery_v1 TO gradebook_app;
CREATE POLICY photo_asset_backend_read_v1 ON student_photos.asset_delivery_v1 FOR SELECT TO gradebook_app USING(true);

CREATE FUNCTION student_photos.resolve_student_v1(p_source text,p_year integer,p_reference text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result uuid;
BEGIN
  IF p_source='portal' THEN
    SELECT student_uid INTO result FROM student_portal.account WHERE id=p_reference::uuid AND academic_year=p_year;
  ELSIF p_source='gradebook' AND p_reference ~ '^[0-9]{1,10}$' THEN
    SELECT student_uid INTO result FROM gradebook.aluno WHERE id=p_reference::bigint AND ano=p_year;
  ELSE RAISE EXCEPTION 'photo-subject-invalid' USING ERRCODE='22023'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION student_photos.legacy_reference_v1(p_uid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; total integer;
BEGIN
  SELECT count(*) INTO total FROM student_portal.profile_photo p JOIN student_portal.account a ON a.id=p.account_id WHERE a.student_uid=p_uid;
  IF total>1 THEN RAISE EXCEPTION 'photo-legacy-ambiguous' USING ERRCODE='23514'; END IF;
  SELECT jsonb_build_object('accountId',p.account_id::text,'driveId',p.sharepoint_drive_id,
    'itemId',p.sharepoint_item_id,'etag',p.etag,'byteSize',p.byte_size,'version',p.version,'contentType',p.content_type)
    INTO result FROM student_portal.profile_photo p JOIN student_portal.account a ON a.id=p.account_id WHERE a.student_uid=p_uid;
  RETURN result;
END $$;

CREATE FUNCTION student_photos.initialize_family_v1(p_uid uuid,p_actor uuid,p_legacy jsonb,p_asset jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing uuid; current_legacy jsonb;
BEGIN
  IF p_actor IS NULL OR p_uid IS NULL THEN RAISE EXCEPTION 'photo-context-invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('student-photo:'||p_uid::text,1119));
  IF EXISTS(SELECT 1 FROM student_photos.photo_family_v1 WHERE student_uid=p_uid) THEN RETURN; END IF;
  current_legacy:=student_photos.legacy_reference_v1(p_uid);
  IF current_legacy IS DISTINCT FROM p_legacy THEN RAISE EXCEPTION 'photo-legacy-changed' USING ERRCODE='40001'; END IF;
  IF p_asset IS NOT NULL THEN
    IF current_legacy IS NULL OR p_asset->>'driveId' IS DISTINCT FROM current_legacy->>'driveId'
      OR p_asset->>'itemId' IS DISTINCT FROM current_legacy->>'itemId'
      OR (p_asset->>'byteSize')::bigint IS DISTINCT FROM (current_legacy->>'byteSize')::bigint
      OR (p_asset->>'sha256') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'photo-legacy-mismatch'; END IF;
    existing:=gen_random_uuid();
  ELSIF current_legacy IS NOT NULL THEN RAISE EXCEPTION 'photo-legacy-not-absent'; END IF;
  INSERT INTO student_photos.photo_family_v1(student_uid,revision,assets)
    VALUES(p_uid,existing,jsonb_build_object('portrait',p_asset,'avatar',NULL));
END $$;

-- Publication accepts only bytes already verified by the server codec or the
-- canonical legacy reader. The family lock prevents a late upload publishing
-- over a more recent photo. Enrollment authorization was confirmed by the owner.
CREATE FUNCTION student_photos.publish_asset_v1(p_uid uuid,p_actor uuid,p_variant text,p_asset jsonb,p_bytes bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE family student_photos.photo_family_v1%ROWTYPE; image_revision uuid; w integer; h integer;
BEGIN
  SELECT * INTO family FROM student_photos.photo_family_v1 WHERE student_uid=p_uid FOR UPDATE;
  IF NOT FOUND OR family.revision IS NULL OR p_actor IS NULL OR p_variant NOT IN ('portrait','avatar')
    OR p_asset IS NULL OR family.assets->p_variant IS DISTINCT FROM p_asset
    OR encode(sha256(p_bytes),'hex') IS DISTINCT FROM p_asset->>'sha256'
    OR octet_length(p_bytes) IS DISTINCT FROM (p_asset->>'byteSize')::integer
    OR octet_length(p_bytes) NOT BETWEEN 20 AND CASE WHEN p_variant='portrait' THEN 131072 ELSE 65536 END
    THEN RAISE EXCEPTION 'photo-publication-conflict' USING ERRCODE='40001'; END IF;
  w:=(p_asset->>'width')::integer; h:=(p_asset->>'height')::integer;
  IF w NOT BETWEEN 1 AND 900 OR h NOT BETWEEN 1 AND 1200
    OR (p_variant='portrait' AND w*4<>h*3)
    OR (p_variant='avatar' AND (w<>h OR w>320)) THEN RAISE EXCEPTION 'photo-publication-dimensions'; END IF;
  INSERT INTO student_photos.asset_delivery_v1(student_uid,variant,revision,source_asset,image_webp)
    VALUES(p_uid,p_variant,gen_random_uuid(),p_asset,p_bytes)
    ON CONFLICT(student_uid,variant) DO UPDATE SET revision=EXCLUDED.revision,
      source_asset=EXCLUDED.source_asset,image_webp=EXCLUDED.image_webp,updated_at=statement_timestamp()
      WHERE student_photos.asset_delivery_v1.source_asset IS DISTINCT FROM EXCLUDED.source_asset;
  SELECT revision INTO image_revision FROM student_photos.asset_delivery_v1 WHERE student_uid=p_uid AND variant=p_variant;
  IF p_variant='portrait' THEN
    INSERT INTO student_photos.portal_delivery_v1(student_uid,revision,source_revision,approved_source_revision,
      source_sha256,portrait_sha256,width,height,image_webp,image_use_authorized,
      authorized_by,authorized_at,authorization_reference,approved_by,approved_at,revoked_at)
    VALUES(p_uid,image_revision,family.revision,family.revision,p_asset->>'sha256',p_asset->>'sha256',w,h,p_bytes,true,
      p_actor,statement_timestamp(),'enrollment-authorization-confirmed-2026-09-23',p_actor,statement_timestamp(),NULL)
    ON CONFLICT(student_uid) DO UPDATE SET revision=EXCLUDED.revision,source_revision=EXCLUDED.source_revision,
      approved_source_revision=EXCLUDED.approved_source_revision,source_sha256=EXCLUDED.source_sha256,
      portrait_sha256=EXCLUDED.portrait_sha256,width=EXCLUDED.width,height=EXCLUDED.height,image_webp=EXCLUDED.image_webp,
      image_use_authorized=true,authorized_by=EXCLUDED.authorized_by,authorized_at=EXCLUDED.authorized_at,
      authorization_reference=EXCLUDED.authorization_reference,approved_by=EXCLUDED.approved_by,
      approved_at=EXCLUDED.approved_at,revoked_at=NULL
    WHERE student_photos.portal_delivery_v1.revision IS DISTINCT FROM EXCLUDED.revision
      OR student_photos.portal_delivery_v1.revoked_at IS NOT NULL;
  END IF;
END $$;

CREATE FUNCTION student_photos.invalidate_asset_delivery_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  DELETE FROM student_photos.asset_delivery_v1 d WHERE d.student_uid=NEW.student_uid
    AND NEW.assets->d.variant IS DISTINCT FROM d.source_asset;
  RETURN NEW;
END $$;
CREATE TRIGGER photo_family_invalidate_delivery_v1 AFTER UPDATE OF assets ON student_photos.photo_family_v1
  FOR EACH ROW EXECUTE FUNCTION student_photos.invalidate_asset_delivery_v1();

-- Keep the existing lookup compatible; removal cannot resurrect the original.
-- Do not attach a photo by name or choose between multiple annual accounts.
CREATE FUNCTION student_photos.mirror_legacy_photo_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; total integer; asset jsonb;
BEGIN
  IF NEW.assets->'portrait' IS NOT DISTINCT FROM OLD.assets->'portrait' THEN RETURN NEW; END IF;
  asset:=NEW.assets->'portrait';
  IF asset='null'::jsonb THEN
    DELETE FROM student_portal.profile_photo p USING student_portal.account a WHERE p.account_id=a.id AND a.student_uid=NEW.student_uid;
    RETURN NEW;
  END IF;
  SELECT count(*), (array_agg(id))[1] INTO total,target FROM student_portal.account WHERE student_uid=NEW.student_uid;
  IF total=1 THEN
    INSERT INTO student_portal.profile_photo(account_id,sharepoint_drive_id,sharepoint_item_id,content_type,byte_size,etag)
      VALUES(target,asset->>'driveId',asset->>'itemId','image/webp',(asset->>'byteSize')::bigint,asset->>'etag')
      ON CONFLICT(account_id) DO UPDATE SET sharepoint_drive_id=EXCLUDED.sharepoint_drive_id,
        sharepoint_item_id=EXCLUDED.sharepoint_item_id,content_type=EXCLUDED.content_type,
        byte_size=EXCLUDED.byte_size,etag=EXCLUDED.etag,version=student_portal.profile_photo.version+1,updated_at=statement_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER photo_family_mirror_legacy_v1 AFTER UPDATE OF assets ON student_photos.photo_family_v1
  FOR EACH ROW EXECUTE FUNCTION student_photos.mirror_legacy_photo_v1();

REVOKE ALL ON FUNCTION student_photos.resolve_student_v1(text,integer,text),student_photos.legacy_reference_v1(uuid),
  student_photos.initialize_family_v1(uuid,uuid,jsonb,jsonb),student_photos.publish_asset_v1(uuid,uuid,text,jsonb,bytea),
  student_photos.invalidate_asset_delivery_v1(),student_photos.mirror_legacy_photo_v1() FROM PUBLIC,gradebook_app,student_portal_app;
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON student_photos.asset_delivery_v1 FROM %I',r);
    EXECUTE format('REVOKE ALL ON FUNCTION student_photos.resolve_student_v1(text,integer,text),student_photos.legacy_reference_v1(uuid),student_photos.initialize_family_v1(uuid,uuid,jsonb,jsonb),student_photos.publish_asset_v1(uuid,uuid,text,jsonb,bytea),student_photos.invalidate_asset_delivery_v1(),student_photos.mirror_legacy_photo_v1() FROM %I',r);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION student_photos.resolve_student_v1(text,integer,text),student_photos.legacy_reference_v1(uuid),
  student_photos.initialize_family_v1(uuid,uuid,jsonb,jsonb),student_photos.publish_asset_v1(uuid,uuid,text,jsonb,bytea) TO gradebook_app;
COMMIT;
