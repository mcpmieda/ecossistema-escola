-- #808: minimal, transactional notification outbox for authenticated live reads.
-- Payloads contain only routing metadata and opaque versions; protected values remain in PostgreSQL.
BEGIN;

CREATE TABLE student_portal.live_event_outbox_v1 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_event_id uuid NOT NULL,
  audience text NOT NULL,
  domain text NOT NULL,
  academic_year smallint NOT NULL DEFAULT 2026,
  version text NOT NULL,
  account_id uuid,
  class_id integer,
  student_ids integer[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  CONSTRAINT student_portal_live_event_audience_v1 CHECK (audience IN ('admin','student')),
  CONSTRAINT student_portal_live_event_domain_v1 CHECK (domain IN ('gradebook','portal')),
  CONSTRAINT student_portal_live_event_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_live_event_version_v1 CHECK (version ~ '^[A-Za-z0-9:_-]{1,128}$'),
  CONSTRAINT student_portal_live_event_class_v1 CHECK (class_id IS NULL OR class_id > 0),
  CONSTRAINT student_portal_live_event_students_v1 CHECK (
    array_position(student_ids,NULL) IS NULL AND 0 < ALL(student_ids)
  ),
  CONSTRAINT student_portal_live_event_attempts_v1 CHECK (attempts >= 0),
  CONSTRAINT student_portal_live_event_source_audience_v1 UNIQUE (source_event_id, audience, domain)
);
CREATE INDEX student_portal_live_event_pending_v1
  ON student_portal.live_event_outbox_v1(next_attempt_at,id)
  WHERE delivered_at IS NULL;
CREATE INDEX student_portal_live_event_retention_v1
  ON student_portal.live_event_outbox_v1(delivered_at,id)
  WHERE delivered_at IS NOT NULL;

CREATE FUNCTION student_portal.enqueue_revision_live_event_v1() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
BEGIN
  INSERT INTO student_portal.live_event_outbox_v1
    (source_event_id,audience,domain,academic_year,version,student_ids,occurred_at)
  VALUES (NEW.event_id,'admin','gradebook',NEW.academic_year,NEW.data_version,NEW.student_ids,NEW.occurred_at)
  ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  IF NEW.affects_academic OR NEW.cause IN ('relation','council','academic-policy','portal-link') THEN
    INSERT INTO student_portal.live_event_outbox_v1
      (source_event_id,audience,domain,academic_year,version,student_ids,occurred_at)
    VALUES (NEW.event_id,'student','gradebook',NEW.academic_year,NEW.data_version,NEW.student_ids,NEW.occurred_at)
    ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION student_portal.enqueue_portal_live_event_v1() RETURNS trigger
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
    (source_event_id,audience,domain,academic_year,version,account_id,class_id,occurred_at)
  VALUES (NEW.event_id,'admin','portal',2026,NEW.version::text,event_account,event_class,NEW.occurred_at)
  ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  INSERT INTO student_portal.live_event_outbox_v1
    (source_event_id,audience,domain,academic_year,version,account_id,class_id,occurred_at)
  VALUES (NEW.event_id,'student','portal',2026,NEW.version::text,event_account,event_class,NEW.occurred_at)
  ON CONFLICT (source_event_id,audience,domain) DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER student_portal_revision_live_event_v1
  AFTER INSERT ON student_portal.revision_event
  FOR EACH ROW EXECUTE FUNCTION student_portal.enqueue_revision_live_event_v1();
CREATE TRIGGER student_portal_portal_live_event_v1
  AFTER INSERT ON student_portal.audit_event
  FOR EACH ROW EXECUTE FUNCTION student_portal.enqueue_portal_live_event_v1();

REVOKE ALL ON TABLE student_portal.live_event_outbox_v1 FROM PUBLIC;
REVOKE ALL ON SEQUENCE student_portal.live_event_outbox_v1_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION student_portal.enqueue_revision_live_event_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION student_portal.enqueue_portal_live_event_v1() FROM PUBLIC;
GRANT SELECT,UPDATE,DELETE ON student_portal.live_event_outbox_v1 TO student_portal_app;

COMMIT;
