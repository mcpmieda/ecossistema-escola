-- #1119: recover a confirmed save even after the browser has closed.
-- Only final codec-verified variants are retained while their operation is pending.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE student_photos.write_payload_v1 (
  request_id uuid PRIMARY KEY REFERENCES student_photos.write_operation_v1(request_id) ON DELETE RESTRICT,
  portrait_bytes bytea CHECK(portrait_bytes IS NULL OR octet_length(portrait_bytes) BETWEEN 20 AND 131072),
  avatar_bytes bytea CHECK(avatar_bytes IS NULL OR octet_length(avatar_bytes) BETWEEN 20 AND 65536),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE student_photos.recovery_audit_v1 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES student_photos.write_operation_v1(request_id) ON DELETE RESTRICT,
  student_uid uuid NOT NULL,previous_actor uuid NOT NULL,acting_actor uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE student_photos.write_payload_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_photos.recovery_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_photos.write_payload_v1,student_photos.recovery_audit_v1 FROM PUBLIC,gradebook_app,student_portal_app;
REVOKE ALL ON SEQUENCE student_photos.recovery_audit_v1_id_seq FROM PUBLIC,gradebook_app,student_portal_app;
GRANT SELECT ON student_photos.write_payload_v1,student_photos.recovery_audit_v1 TO gradebook_app;
CREATE POLICY photo_payload_backend_read_v1 ON student_photos.write_payload_v1 FOR SELECT TO gradebook_app USING(true);
CREATE POLICY photo_recovery_backend_read_v1 ON student_photos.recovery_audit_v1 FOR SELECT TO gradebook_app USING(true);

CREATE FUNCTION student_photos.stage_payload_v1(p_uid uuid,p_actor uuid,p_request uuid,p_portrait bytea,p_avatar bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt jsonb; variant text; data bytea; metadata jsonb; old student_photos.write_payload_v1%ROWTYPE;
BEGIN
  PERFORM 1 FROM student_photos.photo_family_v1 WHERE student_uid=p_uid AND pending_request=p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'photo-reservation-mismatch'; END IF;
  SELECT o.receipt INTO receipt FROM student_photos.write_operation_v1 o
    WHERE request_id=p_request AND student_uid=p_uid AND actor_id=p_actor;
  IF receipt IS NULL OR receipt->>'phase'<>'prepared' THEN RAISE EXCEPTION 'photo-payload-phase'; END IF;
  FOREACH variant IN ARRAY ARRAY['portrait','avatar'] LOOP
    data:=CASE WHEN variant='portrait' THEN p_portrait ELSE p_avatar END;
    metadata:=receipt->'plan'->variant;
    IF (data IS NULL) IS DISTINCT FROM (metadata='null'::jsonb) THEN RAISE EXCEPTION 'photo-payload-mismatch'; END IF;
    IF data IS NOT NULL AND (octet_length(data) IS DISTINCT FROM (metadata->>'byteSize')::integer
      OR encode(sha256(data),'hex') IS DISTINCT FROM metadata->>'sha256') THEN RAISE EXCEPTION 'photo-payload-mismatch'; END IF;
  END LOOP;
  SELECT * INTO old FROM student_photos.write_payload_v1 WHERE request_id=p_request;
  IF FOUND THEN
    IF old.portrait_bytes IS DISTINCT FROM p_portrait OR old.avatar_bytes IS DISTINCT FROM p_avatar
      THEN RAISE EXCEPTION 'photo-payload-immutable'; END IF;
    RETURN;
  END IF;
  INSERT INTO student_photos.write_payload_v1(request_id,portrait_bytes,avatar_bytes) VALUES(p_request,p_portrait,p_avatar);
END $$;

-- Explicit recovery transfers the pending operation, not the person's identity.
-- Old in-flight uploads retain the same immutable key/bytes. Every following
-- mutation rechecks the receipt owner and is fenced after this atomic transfer.
CREATE FUNCTION student_photos.takeover_write_v1(p_uid uuid,p_actor uuid,p_request uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE operation student_photos.write_operation_v1%ROWTYPE; updated jsonb;
BEGIN
  IF p_actor IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'photo-recovery-invalid'; END IF;
  PERFORM 1 FROM student_photos.photo_family_v1 WHERE student_uid=p_uid AND pending_request=p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'photo-reservation-mismatch' USING ERRCODE='40001'; END IF;
  SELECT * INTO operation FROM student_photos.write_operation_v1 WHERE request_id=p_request AND student_uid=p_uid FOR UPDATE;
  IF NOT FOUND OR operation.receipt->>'phase'='complete' THEN RAISE EXCEPTION 'photo-recovery-phase'; END IF;
  IF operation.receipt->>'phase'='prepared' AND NOT EXISTS(SELECT 1 FROM student_photos.write_payload_v1 WHERE request_id=p_request)
    THEN RAISE EXCEPTION 'photo-recovery-payload-missing'; END IF;
  updated:=jsonb_set(jsonb_set(operation.receipt,'{actorId}',to_jsonb(p_actor::text)),'{inputHash}',to_jsonb(p_hash));
  UPDATE student_photos.write_operation_v1 SET actor_id=p_actor,input_hash=p_hash,receipt=updated,updated_at=statement_timestamp() WHERE request_id=p_request;
  INSERT INTO student_photos.recovery_audit_v1(request_id,student_uid,previous_actor,acting_actor)
    VALUES(p_request,p_uid,operation.actor_id,p_actor);
  RETURN updated;
END $$;

CREATE FUNCTION student_photos.clear_completed_payload_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.receipt->>'phase'='complete' THEN DELETE FROM student_photos.write_payload_v1 WHERE request_id=NEW.request_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER photo_operation_clear_payload_v1 AFTER UPDATE OF receipt ON student_photos.write_operation_v1
  FOR EACH ROW EXECUTE FUNCTION student_photos.clear_completed_payload_v1();
REVOKE ALL ON FUNCTION student_photos.stage_payload_v1(uuid,uuid,uuid,bytea,bytea),
  student_photos.takeover_write_v1(uuid,uuid,uuid,text),student_photos.clear_completed_payload_v1()
  FROM PUBLIC,gradebook_app,student_portal_app;
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON student_photos.write_payload_v1,student_photos.recovery_audit_v1 FROM %I',r);
    EXECUTE format('REVOKE ALL ON SEQUENCE student_photos.recovery_audit_v1_id_seq FROM %I',r);
    EXECUTE format('REVOKE ALL ON FUNCTION student_photos.stage_payload_v1(uuid,uuid,uuid,bytea,bytea),student_photos.takeover_write_v1(uuid,uuid,uuid,text),student_photos.clear_completed_payload_v1() FROM %I',r);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION student_photos.stage_payload_v1(uuid,uuid,uuid,bytea,bytea),student_photos.takeover_write_v1(uuid,uuid,uuid,text) TO gradebook_app;
COMMIT;
