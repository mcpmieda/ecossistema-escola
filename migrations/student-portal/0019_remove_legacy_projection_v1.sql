-- Removes the legacy stored Self projection. Scoped V2 prepared editions are the only published
-- source since the cutover; the table held a stale per-student copy of grades (2026-09-14) that no
-- request reads after the code that drops the fallback is deployed.
-- DEPLOY ORDER: deploy the Worker without the legacy reader/jobs FIRST, then apply this migration.
-- Destructive and not reversible by rollback: the rows are dropped with the table (backups expire
-- on the provider's retention). Refuses to run unless scoped V2 publication is active.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  -- Nested so the inner query is planned only when the V2 control exists.
  IF to_regclass('student_portal.publication_control_v2') IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM student_portal.publication_control_v2 WHERE academic_year=2026 AND enabled)
      THEN RAISE EXCEPTION 'student-portal-legacy-projection-removal-requires-scoped-v2'; END IF;
  END IF;
END
$$;
-- Same body as 0007 except the projection purge; ACL, owner and SECURITY DEFINER are preserved.
CREATE OR REPLACE FUNCTION student_portal.synchronize_profiles_v1(p_create boolean DEFAULT false)
RETURNS TABLE(created_count integer,updated_count integer,denied_count integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,student_portal
AS $$
DECLARE
  v_account record;
  v_binding record;
  v_old_class integer;
  v_has_snapshot boolean;
  v_class integer;
  v_state text;
  v_scope_changed boolean;
  v_revision student_portal.academic_revision%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_created_ids integer[];
BEGIN
  IF p_create IS NULL THEN
    RAISE EXCEPTION 'student-portal-lifecycle-request-invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(613,0);
  PERFORM pg_advisory_xact_lock(613,2026);
  SELECT * INTO STRICT v_revision FROM student_portal.academic_revision WHERE academic_year=2026 FOR UPDATE;
  created_count:=0; updated_count:=0; denied_count:=0;

  IF p_create THEN
    WITH candidates AS (
      SELECT s.student_id,
             CASE WHEN min(b.status) IN (3,4,5) THEN 'exit' ELSE 'eligible' END AS eligibility
        FROM student_portal.academic_student_v1 s
        JOIN student_portal.academic_binding_v1 b
          ON b.academic_year=s.academic_year AND b.student_id=s.student_id
       WHERE b.status IS DISTINCT FROM 6
         AND NOT EXISTS (SELECT 1 FROM student_portal.link_closure c
                          WHERE c.academic_year=2026 AND c.gradebook_student_id=s.student_id)
       GROUP BY s.student_id HAVING count(*)=1
    ), inserted AS (
      INSERT INTO student_portal.account
        (id,academic_year,gradebook_student_id,auth_state,eligibility,blocked,version,security_version,pin_version)
      SELECT gen_random_uuid(),2026,c.student_id,'pending-activation',c.eligibility,false,0,0,0
        FROM candidates c
       WHERE NOT EXISTS (SELECT 1 FROM student_portal.account a
                          WHERE a.academic_year=2026 AND a.gradebook_student_id=c.student_id AND a.closed_at IS NULL)
      RETURNING gradebook_student_id
    ) SELECT count(*)::integer,array_agg(gradebook_student_id ORDER BY gradebook_student_id)
        INTO created_count,v_created_ids FROM inserted;
  END IF;

  IF created_count>0 THEN
    UPDATE student_portal.academic_revision
       SET reset_counter=reset_counter+1,portal_link_counter=portal_link_counter+1,updated_at=v_now
     WHERE academic_year=2026 RETURNING * INTO v_revision;
    INSERT INTO student_portal.revision_event
      (event_id,academic_year,student_ids,cause,affects_academic,affects_reset,
       data_version,reset_version,portal_link_version,occurred_at)
    VALUES (gen_random_uuid(),2026,v_created_ids,'portal-link',false,true,
      v_revision.academic_generation||':'||v_revision.academic_counter::text,
      v_revision.reset_generation||':'||v_revision.reset_counter::text,
      v_revision.portal_link_generation||':'||v_revision.portal_link_counter::text,v_now);
  END IF;

  FOR v_account IN SELECT a.* FROM student_portal.account a
    WHERE a.academic_year=2026 AND a.closed_at IS NULL AND a.gradebook_student_id IS NOT NULL
    ORDER BY a.id FOR UPDATE
  LOOP
    SELECT count(*) AS matches,min(b.class_id) AS class_id,min(b.status) AS status
      INTO v_binding FROM student_portal.academic_binding_v1 b
      JOIN student_portal.academic_student_v1 s
        ON s.academic_year=b.academic_year AND s.student_id=b.student_id
     WHERE b.academic_year=2026 AND b.student_id=v_account.gradebook_student_id AND b.status IS DISTINCT FROM 6;
    v_class:=CASE WHEN v_binding.matches=1 THEN v_binding.class_id ELSE NULL END;
    v_state:=CASE WHEN v_binding.matches<>1 THEN 'unresolved'
                  WHEN v_binding.status IN (3,4,5) THEN 'exit' ELSE 'eligible' END;
    SELECT class_id INTO v_old_class FROM student_portal.lifecycle_snapshot WHERE account_id=v_account.id;
    v_has_snapshot:=FOUND;
    v_scope_changed:=NOT v_has_snapshot OR v_old_class IS DISTINCT FROM v_class;

    IF v_account.eligibility IS DISTINCT FROM v_state OR (v_has_snapshot AND v_scope_changed) THEN
      UPDATE student_portal.account SET eligibility=v_state,version=version+1,
        security_version=security_version+CASE WHEN v_state<>'eligible' AND v_account.eligibility='eligible' THEN 1 ELSE 0 END,
        updated_at=v_now WHERE id=v_account.id;
      updated_count:=updated_count+1;
    END IF;
    IF v_state<>'eligible' THEN
      denied_count:=denied_count+1;
      UPDATE student_portal.session SET revoked_at=v_now WHERE account_id=v_account.id AND revoked_at IS NULL;
      UPDATE student_portal.auth_challenge SET consumed_at=v_now WHERE account_id=v_account.id AND consumed_at IS NULL;
    END IF;
    IF v_scope_changed OR v_state<>'eligible' THEN
      UPDATE student_portal.publication_job SET state='failed',lease_until=NULL,updated_at=v_now
        WHERE account_id=v_account.id AND state IN ('queued','running');
    END IF;
    INSERT INTO student_portal.lifecycle_snapshot (account_id,class_id,data_version)
      VALUES (v_account.id,v_class,v_revision.academic_generation||':'||v_revision.academic_counter::text)
    ON CONFLICT (account_id) DO UPDATE SET class_id=EXCLUDED.class_id,data_version=EXCLUDED.data_version
      WHERE lifecycle_snapshot.class_id IS DISTINCT FROM EXCLUDED.class_id
         OR lifecycle_snapshot.data_version IS DISTINCT FROM EXCLUDED.data_version;
  END LOOP;
  RETURN NEXT;
END
$$;
DROP TABLE student_portal.published_projection;
COMMIT;
