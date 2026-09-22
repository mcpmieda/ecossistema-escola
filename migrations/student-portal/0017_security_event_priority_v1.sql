-- #1101: classify security notices at their existing transactional source.
-- No new channel/resource or protected payload. Historical pending entries default to non-priority;
-- every new security connection reauthorizes, so the cutover does not depend on replaying old notices.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE student_portal.live_event_outbox_v1 ADD COLUMN security_relevant boolean NOT NULL DEFAULT false;
CREATE INDEX student_portal_live_security_pending_v1
  ON student_portal.live_event_outbox_v1(security_relevant DESC,next_attempt_at,id) WHERE delivered_at IS NULL;
CREATE OR REPLACE FUNCTION student_portal.enqueue_revision_live_event_v1() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
BEGIN
  IF NEW.academic_year <> 2026 THEN RETURN NEW; END IF;
  INSERT INTO student_portal.live_event_outbox_v1
    (source_event_id,audience,domain,academic_year,version,student_ids,occurred_at,security_relevant)
  VALUES (NEW.event_id,'admin','gradebook',NEW.academic_year,NEW.data_version,NEW.student_ids,NEW.occurred_at,NEW.cause IN ('relation','academic-policy','portal-link'))
  ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  IF NEW.affects_academic OR NEW.cause IN ('relation','council','academic-policy','portal-link') THEN
    INSERT INTO student_portal.live_event_outbox_v1
      (source_event_id,audience,domain,academic_year,version,student_ids,occurred_at,security_relevant)
    VALUES (NEW.event_id,'student','gradebook',NEW.academic_year,NEW.data_version,NEW.student_ids,NEW.occurred_at,NEW.cause IN ('relation','academic-policy','portal-link'))
    ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION student_portal.enqueue_portal_live_event_v1() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE
  event_account uuid;
  event_class integer;
BEGIN
  IF NEW.kind NOT IN ('activated','password-reset','account-reset','qr-issued','qr-reprinted',
    'qr-regenerated','blocked','unblocked','session-revoked','birth-changed','settings-changed',
    'published','unpublished','projection-updated','links-closed') THEN
    RETURN NEW;
  END IF;
  event_account := COALESCE(NEW.account_id,
    CASE WHEN NEW.scope_json->>'kind'='account' THEN (NEW.scope_json->>'accountId')::uuid END);
  event_class := CASE WHEN NEW.scope_json->>'kind'='class' THEN (NEW.scope_json->>'classId')::integer END;
  INSERT INTO student_portal.live_event_outbox_v1
    (source_event_id,audience,domain,academic_year,version,account_id,class_id,occurred_at,security_relevant)
  VALUES (NEW.event_id,'admin','portal',2026,NEW.version::text,event_account,event_class,NEW.occurred_at,NEW.result='success' AND NEW.kind IN ('activated','password-reset','account-reset','qr-regenerated','blocked','unblocked','session-revoked','settings-changed','links-closed'))
  ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  INSERT INTO student_portal.live_event_outbox_v1
    (source_event_id,audience,domain,academic_year,version,account_id,class_id,occurred_at,security_relevant)
  VALUES (NEW.event_id,'student','portal',2026,NEW.version::text,event_account,event_class,NEW.occurred_at,NEW.result='success' AND NEW.kind IN ('activated','password-reset','account-reset','qr-regenerated','blocked','unblocked','session-revoked','settings-changed','links-closed'))
  ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  RETURN NEW;
END
$$;


COMMIT;
