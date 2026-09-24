-- One-time #1119 cutover after migration 0005, backend secret setup and official deploy.
-- All objects are verified byte-for-byte before this script. No source files are deleted.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $$
DECLARE source_count integer; object_count integer; matched_count integer; uid_count integer;
  source_digest text; object_digest text; entry record;
BEGIN
  SELECT count(*) INTO source_count FROM student_portal.profile_photo;
  SELECT count(*) INTO object_count FROM storage.objects WHERE bucket_id='student-photos';
  IF source_count<>361 OR object_count<>source_count THEN
    RAISE EXCEPTION 'photo-storage-inventory-changed';
  END IF;
  SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(a.student_uid,p.account_id,
    p.sharepoint_drive_id,p.sharepoint_item_id,p.byte_size,p.etag,p.version,p.content_type)::text,
    E'\n' ORDER BY a.student_uid),'UTF8')),'hex') INTO source_digest
    FROM student_portal.profile_photo p JOIN student_portal.account a ON a.id=p.account_id;
  IF source_digest<>'d638834560e3ffdc2406c6957947698f62eb5892acac3158ac9151038fa1271d' THEN
    RAISE EXCEPTION 'photo-storage-source-reference-changed';
  END IF;
  SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(name,(metadata->>'size')::integer)::text,
    E'\n' ORDER BY name),'UTF8')),'hex') INTO object_digest
    FROM storage.objects WHERE bucket_id='student-photos';
  IF object_digest<>'4fb5e89b816db8e50d012d3555b404b0bbd7adea7b6e867be97869681844b496' THEN
    RAISE EXCEPTION 'photo-storage-object-inventory-changed';
  END IF;
  SELECT count(*),count(DISTINCT a.student_uid) INTO matched_count,uid_count
    FROM student_portal.profile_photo p
    JOIN student_portal.account a ON a.id=p.account_id
    JOIN storage.objects o ON o.bucket_id='student-photos'
      AND o.name ~ ('^legacy/'||a.student_uid::text||'/[a-f0-9]{64}\.webp$')
      AND o.metadata->>'mimetype'='image/webp'
      AND (o.metadata->>'size')::bigint=p.byte_size;
  IF matched_count<>source_count OR uid_count<>source_count THEN
    RAISE EXCEPTION 'photo-storage-inventory-mismatch';
  END IF;
  FOR entry IN
    SELECT a.student_uid,o.name,(o.metadata->>'size')::integer AS size,
      substring(o.name FROM '/([a-f0-9]{64})\.webp$') AS digest
      FROM student_portal.profile_photo p
      JOIN student_portal.account a ON a.id=p.account_id
      JOIN storage.objects o ON o.bucket_id='student-photos'
        AND o.name ~ ('^legacy/'||a.student_uid::text||'/[a-f0-9]{64}\.webp$')
        AND (o.metadata->>'size')::bigint=p.byte_size
  LOOP
    PERFORM student_photos.adopt_storage_photo_v1(entry.student_uid,
      student_photos.legacy_reference_v1(entry.student_uid),
      jsonb_build_object('driveId','student-photos','itemId',entry.name,'etag',entry.digest,
        'sha256',entry.digest,'byteSize',entry.size,'width',600,'height',800));
  END LOOP;
  IF (SELECT count(*) FROM student_photos.portal_delivery_v1 WHERE storage_path IS NOT NULL)<>source_count
    OR (SELECT count(*) FROM student_photos.asset_delivery_v1 WHERE storage_path IS NOT NULL)<>source_count
    THEN RAISE EXCEPTION 'photo-storage-publication-incomplete';
  END IF;
END $$;
COMMIT;
