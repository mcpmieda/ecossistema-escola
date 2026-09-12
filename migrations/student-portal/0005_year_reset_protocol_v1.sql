-- #706: private technical coordination for the existing BN year range.
-- Scaffold: Supabase CLI migration new year_reset_protocol_v1; repository slot 0005.
-- No academic write, no account creation and no public/table grants.
BEGIN;

ALTER TABLE student_portal.academic_revision
  DROP CONSTRAINT student_portal_revision_year_v1,
  ADD CONSTRAINT student_portal_revision_year_v1 CHECK (academic_year BETWEEN 2000 AND 9999);
ALTER TABLE student_portal.revision_event
  DROP CONSTRAINT student_portal_revision_event_year_v1,
  ADD CONSTRAINT student_portal_revision_event_year_v1 CHECK (academic_year BETWEEN 2000 AND 9999);
ALTER TABLE student_portal.year_reset_preview_proof
  DROP CONSTRAINT student_portal_reset_proof_year_v1,
  ADD CONSTRAINT student_portal_reset_proof_year_v1 CHECK (academic_year BETWEEN 2000 AND 9999),
  ADD COLUMN consumed_transaction xid8;

INSERT INTO student_portal.academic_revision
  (academic_year,academic_generation,reset_generation,portal_link_generation,academic_counter,reset_counter,portal_link_counter)
SELECT ano,replace(gen_random_uuid()::text,'-',''),replace(gen_random_uuid()::text,'-',''),
       replace(gen_random_uuid()::text,'-',''),1,1,1
FROM gradebook.ano_letivo
ON CONFLICT (academic_year) DO NOTHING;

-- Caller must acquire transaction advisory locks before touching tables/accounts.
-- This assertion checks this backend's locks; it does not acquire or promote them.
CREATE FUNCTION student_portal.assert_year_reset_locks_v1(p_year smallint, p_reset boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
BEGIN
  IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 9999 OR p_reset IS NULL THEN
    RAISE EXCEPTION 'year-reset-invalid-scope' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
      AND classid=613 AND objid=0 AND objsubid=2 AND granted
      AND (mode='ExclusiveLock' OR (NOT p_reset AND mode='ShareLock'))
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
      AND classid=613 AND objid=p_year::oid AND objsubid=2 AND granted AND mode='ExclusiveLock'
  ) THEN
    RAISE EXCEPTION 'year-reset-locks-required' USING ERRCODE='55000';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION student_portal.assert_year_reset_locks_v1(smallint,boolean) FROM PUBLIC;

-- Only first materialization of a future BN year uses this narrow initializer.
CREATE FUNCTION student_portal.ensure_year_coordination_v1(p_year smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
BEGIN
  PERFORM student_portal.assert_year_reset_locks_v1(p_year,false);
  INSERT INTO student_portal.academic_revision
    (academic_year,academic_generation,reset_generation,portal_link_generation,academic_counter,reset_counter,portal_link_counter)
  VALUES (p_year,replace(gen_random_uuid()::text,'-',''),replace(gen_random_uuid()::text,'-',''),
          replace(gen_random_uuid()::text,'-',''),1,1,1)
  ON CONFLICT (academic_year) DO NOTHING;
END
$$;
REVOKE ALL ON FUNCTION student_portal.ensure_year_coordination_v1(smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_portal.ensure_year_coordination_v1(smallint) TO gradebook_app;

CREATE OR REPLACE FUNCTION student_portal.inspect_year_reset_guard_v1(p_academic_year smallint)
RETURNS TABLE(linked_count bigint, state text, portal_link_revision text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
  SELECT count(a.id)::bigint,
    CASE WHEN count(a.id)=0 THEN 'clear' ELSE 'portal-linked-accounts' END,
    r.portal_link_generation || ':' || r.portal_link_counter::text
  FROM student_portal.academic_revision r
  LEFT JOIN student_portal.account a
    ON a.academic_year=r.academic_year AND a.gradebook_student_id IS NOT NULL
  WHERE r.academic_year=p_academic_year
  GROUP BY r.portal_link_generation,r.portal_link_counter
$$;

CREATE FUNCTION student_portal.prepare_year_reset_v1(p_year smallint,p_actor text,p_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE r student_portal.academic_revision%ROWTYPE; issued timestamptz;
BEGIN
  PERFORM student_portal.assert_year_reset_locks_v1(p_year,false);
  IF p_actor IS NULL OR p_actor !~ '^[a-f0-9]{64}$' OR p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'year-reset-invalid-proof' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT r FROM student_portal.academic_revision WHERE academic_year=p_year FOR UPDATE;
  IF EXISTS (SELECT 1 FROM student_portal.account WHERE academic_year=p_year AND gradebook_student_id IS NOT NULL) THEN
    RETURN 'portal-linked-accounts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM gradebook.ano_letivo WHERE ano=p_year) THEN RETURN 'not-found'; END IF;
  issued := clock_timestamp();
  INSERT INTO student_portal.year_reset_preview_proof
    (token_digest,actor_digest,academic_year,issued_at,expires_at,academic_revision,reset_revision,portal_link_revision)
  VALUES (p_token,p_actor,p_year,issued,issued+interval '5 minutes',
          r.academic_generation||':'||r.academic_counter::text,
          r.reset_generation||':'||r.reset_counter::text,
          r.portal_link_generation||':'||r.portal_link_counter::text);
  RETURN 'clear';
END
$$;
REVOKE ALL ON FUNCTION student_portal.prepare_year_reset_v1(smallint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_portal.prepare_year_reset_v1(smallint,text,text) TO gradebook_app;

CREATE FUNCTION student_portal.consume_year_reset_v1(p_year smallint,p_actor text,p_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE r student_portal.academic_revision%ROWTYPE; affected integer;
BEGIN
  PERFORM student_portal.assert_year_reset_locks_v1(p_year,true);
  -- FOR UPDATE aborts a SERIALIZABLE snapshot made stale while waiting for locks.
  SELECT * INTO STRICT r FROM student_portal.academic_revision WHERE academic_year=p_year FOR UPDATE;
  IF EXISTS (SELECT 1 FROM student_portal.account WHERE academic_year=p_year AND gradebook_student_id IS NOT NULL) THEN
    RETURN 'portal-linked-accounts';
  END IF;
  UPDATE student_portal.year_reset_preview_proof SET consumed_at=clock_timestamp(),
    consumed_transaction=pg_current_xact_id()
  WHERE token_digest=p_token AND actor_digest=p_actor AND academic_year=p_year
    AND consumed_at IS NULL AND issued_at<=clock_timestamp() AND expires_at>clock_timestamp()
    AND academic_revision=r.academic_generation||':'||r.academic_counter::text
    AND reset_revision=r.reset_generation||':'||r.reset_counter::text
    AND portal_link_revision=r.portal_link_generation||':'||r.portal_link_counter::text;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN CASE WHEN affected=1 THEN 'clear' ELSE 'preview-changed' END;
END
$$;
REVOKE ALL ON FUNCTION student_portal.consume_year_reset_v1(smallint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_portal.consume_year_reset_v1(smallint,text,text) TO gradebook_app;

CREATE FUNCTION student_portal.complete_year_reset_v1(p_year smallint,p_actor text,p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE affected integer;
BEGIN
  PERFORM student_portal.assert_year_reset_locks_v1(p_year,true);
  IF EXISTS (SELECT 1 FROM gradebook.ano_letivo WHERE ano=p_year)
     OR EXISTS (SELECT 1 FROM student_portal.account WHERE academic_year=p_year AND gradebook_student_id IS NOT NULL) THEN
    RAISE EXCEPTION 'year-reset-postcondition-failed' USING ERRCODE='55000';
  END IF;
  UPDATE student_portal.year_reset_preview_proof SET consumed_transaction=NULL
  WHERE token_digest=p_token AND actor_digest=p_actor AND academic_year=p_year
    AND consumed_at IS NOT NULL AND consumed_transaction=pg_current_xact_id();
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'year-reset-proof-not-consumed-here' USING ERRCODE='55000'; END IF;
  UPDATE student_portal.academic_revision SET
    academic_generation=replace(gen_random_uuid()::text,'-',''),academic_counter=1,
    reset_generation=replace(gen_random_uuid()::text,'-',''),reset_counter=1,
    portal_link_generation=replace(gen_random_uuid()::text,'-',''),portal_link_counter=1,
    updated_at=clock_timestamp()
  WHERE academic_year=p_year;
  IF NOT FOUND THEN RAISE EXCEPTION 'year-reset-coordination-missing' USING ERRCODE='55000'; END IF;
END
$$;
REVOKE ALL ON FUNCTION student_portal.complete_year_reset_v1(smallint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_portal.complete_year_reset_v1(smallint,text,text) TO gradebook_app;

COMMIT;
