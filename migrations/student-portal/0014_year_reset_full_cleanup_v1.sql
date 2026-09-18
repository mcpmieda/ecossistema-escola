-- #870: reset anual remove também coordenação/revisões técnicas do ano apagado.
-- Mantém o contrato V1, os locks e o guard de contas Portal.
BEGIN;

CREATE OR REPLACE FUNCTION student_portal.prepare_year_reset_v1(
  p_year smallint,
  p_actor text,
  p_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE
  r student_portal.academic_revision%ROWTYPE;
  issued timestamptz;
BEGIN
  PERFORM student_portal.assert_year_reset_locks_v1(p_year,false);
  IF p_actor IS NULL OR p_actor !~ '^[a-f0-9]{64}$'
     OR p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'year-reset-invalid-proof' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM gradebook.ano_letivo WHERE ano=p_year) THEN
    RETURN 'not-found';
  END IF;

  SELECT * INTO r
  FROM student_portal.academic_revision
  WHERE academic_year=p_year
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'year-reset-coordination-missing' USING ERRCODE='55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM student_portal.account
    WHERE academic_year=p_year AND gradebook_student_id IS NOT NULL
  ) THEN
    RETURN 'portal-linked-accounts';
  END IF;

  issued := clock_timestamp();
  INSERT INTO student_portal.year_reset_preview_proof
    (token_digest,actor_digest,academic_year,issued_at,expires_at,
     academic_revision,reset_revision,portal_link_revision)
  VALUES (
    p_token,p_actor,p_year,issued,issued+interval '5 minutes',
    r.academic_generation||':'||r.academic_counter::text,
    r.reset_generation||':'||r.reset_counter::text,
    r.portal_link_generation||':'||r.portal_link_counter::text
  );
  RETURN 'clear';
END
$$;

CREATE OR REPLACE FUNCTION student_portal.consume_year_reset_v1(
  p_year smallint,
  p_actor text,
  p_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE
  r student_portal.academic_revision%ROWTYPE;
  affected integer;
BEGIN
  PERFORM student_portal.assert_year_reset_locks_v1(p_year,true);

  IF NOT EXISTS (SELECT 1 FROM gradebook.ano_letivo WHERE ano=p_year) THEN
    RETURN 'preview-changed';
  END IF;

  SELECT * INTO r
  FROM student_portal.academic_revision
  WHERE academic_year=p_year
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'preview-changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM student_portal.account
    WHERE academic_year=p_year AND gradebook_student_id IS NOT NULL
  ) THEN
    RETURN 'portal-linked-accounts';
  END IF;

  UPDATE student_portal.year_reset_preview_proof
  SET consumed_at=clock_timestamp(),
      consumed_transaction=pg_current_xact_id()
  WHERE token_digest=p_token
    AND actor_digest=p_actor
    AND academic_year=p_year
    AND consumed_at IS NULL
    AND issued_at<=clock_timestamp()
    AND expires_at>clock_timestamp()
    AND academic_revision=r.academic_generation||':'||r.academic_counter::text
    AND reset_revision=r.reset_generation||':'||r.reset_counter::text
    AND portal_link_revision=r.portal_link_generation||':'||r.portal_link_counter::text;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN CASE WHEN affected=1 THEN 'clear' ELSE 'preview-changed' END;
END
$$;

CREATE OR REPLACE FUNCTION student_portal.complete_year_reset_v1(
  p_year smallint,
  p_actor text,
  p_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE
  affected integer;
BEGIN
  PERFORM student_portal.assert_year_reset_locks_v1(p_year,true);

  IF EXISTS (SELECT 1 FROM gradebook.ano_letivo WHERE ano=p_year)
     OR EXISTS (
       SELECT 1
       FROM student_portal.account
       WHERE academic_year=p_year AND gradebook_student_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'year-reset-postcondition-failed' USING ERRCODE='55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM student_portal.year_reset_preview_proof
    WHERE token_digest=p_token
      AND actor_digest=p_actor
      AND academic_year=p_year
      AND consumed_at IS NOT NULL
      AND consumed_transaction=pg_current_xact_id()
  ) THEN
    RAISE EXCEPTION 'year-reset-proof-not-consumed-here' USING ERRCODE='55000';
  END IF;

  DELETE FROM student_portal.revision_event
  WHERE academic_year=p_year;

  DELETE FROM student_portal.year_reset_preview_proof
  WHERE academic_year=p_year;

  DELETE FROM student_portal.academic_revision
  WHERE academic_year=p_year;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN
    RAISE EXCEPTION 'year-reset-coordination-missing' USING ERRCODE='55000';
  END IF;

  IF EXISTS (
      SELECT 1 FROM student_portal.revision_event WHERE academic_year=p_year
    ) OR EXISTS (
      SELECT 1 FROM student_portal.year_reset_preview_proof WHERE academic_year=p_year
    ) OR EXISTS (
      SELECT 1 FROM student_portal.academic_revision WHERE academic_year=p_year
    ) THEN
    RAISE EXCEPTION 'year-reset-technical-residue-remains' USING ERRCODE='55000';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION student_portal.prepare_year_reset_v1(smallint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION student_portal.consume_year_reset_v1(smallint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION student_portal.complete_year_reset_v1(smallint,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION student_portal.prepare_year_reset_v1(smallint,text,text) TO gradebook_app;
GRANT EXECUTE ON FUNCTION student_portal.consume_year_reset_v1(smallint,text,text) TO gradebook_app;
GRANT EXECUTE ON FUNCTION student_portal.complete_year_reset_v1(smallint,text,text) TO gradebook_app;

COMMIT;
