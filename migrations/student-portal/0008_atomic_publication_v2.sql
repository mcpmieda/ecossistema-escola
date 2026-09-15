-- #803: preparation belongs to the academic commit; release is a small scoped decision.
-- Additive and initially disabled. No publication, credential, access or academic fact is changed.
BEGIN;
SELECT pg_advisory_xact_lock_shared(613,0);
SELECT pg_advisory_xact_lock(613,2026);

CREATE TABLE student_portal.publication_source_v2 (
  academic_year smallint NOT NULL CHECK (academic_year=2026),
  student_id integer NOT NULL CHECK (student_id>0),
  generation char(32) NOT NULL CHECK (generation ~ '^[a-f0-9]{32}$'),
  revision numeric(20,0) NOT NULL CHECK (revision>0),
  class_id integer,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json)='object'),
  period_mask integer NOT NULL CHECK (period_mask BETWEEN 0 AND 63),
  prepared_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (academic_year,student_id,generation,revision)
);
CREATE TABLE student_portal.publication_source_head_v2 (
  academic_year smallint PRIMARY KEY CHECK (academic_year=2026),
  generation char(32) NOT NULL,
  revision numeric(20,0) NOT NULL CHECK (revision>0),
  prepared_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE student_portal.publication_auto_approval_v2 (
  academic_year smallint NOT NULL CHECK (academic_year=2026),
  student_id integer NOT NULL CHECK (student_id>0),
  class_id integer NOT NULL CHECK (class_id>0),
  generation char(32) NOT NULL,
  revision numeric(20,0) NOT NULL CHECK (revision>0),
  PRIMARY KEY (academic_year,student_id)
);
CREATE TABLE student_portal.publication_control_v2 (
  academic_year smallint PRIMARY KEY CHECK (academic_year=2026),
  enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version>=1)
);
INSERT INTO student_portal.publication_control_v2(academic_year) VALUES(2026);
CREATE TABLE student_portal.publication_release_v2 (
  scope_key text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('school','class','account')),
  academic_year smallint NOT NULL CHECK (academic_year=2026),
  class_id integer,
  account_id uuid REFERENCES student_portal.account(id),
  bound_class_id integer,
  period text NOT NULL CHECK (period IN ('T1','T2','T3','REC1','REC2','REC3')),
  target_revision text CHECK (target_revision IS NULL OR target_revision ~ '^[a-f0-9]{32}:[1-9][0-9]{0,19}$'),
  version bigint NOT NULL CHECK (version>=1),
  released_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(scope_key,period),
  CHECK ((scope_kind='school' AND class_id IS NULL AND account_id IS NULL AND bound_class_id IS NULL AND scope_key='school:2026')
    OR (scope_kind='class' AND class_id>0 AND account_id IS NULL AND bound_class_id IS NULL AND scope_key='class:2026:'||class_id::text)
    OR (scope_kind='account' AND class_id IS NULL AND account_id IS NOT NULL AND bound_class_id>0 AND scope_key='account:2026:'||account_id::text))
);

-- This is the same narrow raw input as ACADEMIC_STUDENT_QUERY_V1, independent of login accounts.
-- Academic calculations remain exclusively in the existing TypeScript academic reader/engine.
CREATE FUNCTION student_portal.publication_source_rows_v2()
RETURNS TABLE(student_id integer,class_id integer,payload_json jsonb,period_mask integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
WITH context AS (
  SELECT s.student_id,s.name,y.minimum_approval,y.max_council_components,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('academicYear',b.academic_year,'studentId',b.student_id,
      'classId',b.class_id,'status',b.status,'classLabel',b.class_name))
      FROM student_portal.academic_binding_v1 b WHERE b.academic_year=2026 AND b.student_id=s.student_id
        AND b.status IS DISTINCT FROM 6),'[]'::jsonb) AS bindings,
    (SELECT decision FROM student_portal.academic_council_decision_v1 c
      WHERE c.academic_year=2026 AND c.student_id=s.student_id) AS decision
  FROM student_portal.academic_student_v1 s
  JOIN student_portal.academic_year_policy_v1 y ON y.academic_year=s.academic_year
  WHERE s.academic_year=2026
), target AS (
  SELECT *,CASE WHEN jsonb_array_length(bindings)=1 THEN (bindings->0->>'classId')::integer END AS class_id FROM context
), raw AS (
  SELECT target.student_id,target.class_id,jsonb_build_object('name',target.name,
    'minimum_approval',target.minimum_approval,'max_council_components',target.max_council_components,
    'bindings',target.bindings,'decision',target.decision,
    'offers',COALESCE((SELECT jsonb_agg(jsonb_build_object('offerId',o.offer_id,'subjectId',o.subject_id,'label',o.subject_label,
      'instruments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'term',i.trimestre,'slot',i.slot,
        'maximum',i.maximo,'label',i.descricao,'value',n.value) ORDER BY i.trimestre,i.slot)
        FROM (SELECT assessment_id AS id,offer_id AS oferta_id,term AS trimestre,slot,maximum AS maximo,label AS descricao
          FROM student_portal.academic_instrument_v1) i
        LEFT JOIN student_portal.academic_mark_v1 n ON n.assessment_id=i.id AND n.student_id=target.student_id
        WHERE i.oferta_id=o.offer_id AND (
          i.slot < 11 OR i.maximo IS NOT NULL
          OR (NULLIF(btrim(i.descricao), '') IS NOT NULL
            AND NOT btrim(i.descricao) ~ ('^' || (i.slot - 10)::text || '([.,]0+)?$'))
          OR EXISTS (SELECT 1 FROM student_portal.academic_mark_v1 evidence WHERE evidence.assessment_id=i.id)
        )),'[]'::jsonb),
      'closure',(SELECT jsonb_build_object('am1',f.am1_fonte,'am2',f.am2_fonte,'am3',f.am3_fonte,
        'rec1',f.rec1,'rec2',f.rec2,'rec3',f.rec3,'nc',f.rec_nc_mask,'rr',f.rec_rr_mask,'annual',f.u_fonte)
        FROM student_portal.academic_closure_v1 f WHERE f.offer_id=o.offer_id AND f.student_id=target.student_id)))
      FROM (SELECT * FROM student_portal.academic_offer_v1 WHERE academic_year=2026 AND class_id=target.class_id
        ORDER BY offer_id LIMIT 101) o),'[]'::jsonb)) AS payload_json
  FROM target
)
SELECT raw.student_id,raw.class_id,raw.payload_json,COALESCE((
  SELECT sum(1 << p.position)::integer FROM (VALUES(0,'am1',1),(1,'am2',2),(2,'am3',3),
    (3,'rec1',1),(4,'rec2',2),(5,'rec3',3)) p(position,field,term)
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(raw.payload_json->'offers') o
    WHERE o->'closure'->>p.field IS NOT NULL
      OR (p.position<3 AND EXISTS (SELECT 1 FROM jsonb_array_elements(o->'instruments') i
        WHERE (i->>'term')::integer=p.term AND i->>'value' IS NOT NULL))
      OR (p.position>=3 AND ((COALESCE((o->'closure'->>'nc')::integer,0)
        | COALESCE((o->'closure'->>'rr')::integer,0)) & (1 << (p.term-1)))<>0))
),0) FROM raw;
$$;

-- Remember the last source approved by auto-update, so disabling it does not rewind notes.
-- Only already released periods consume this pointer; it never opens an unpublished period.
CREATE FUNCTION student_portal.pin_publication_auto_approval_v2() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO student_portal.publication_auto_approval_v2(academic_year,student_id,class_id,generation,revision)
  SELECT 2026,s.student_id,s.class_id,h.generation,h.revision
  FROM student_portal.publication_source_head_v2 h
  JOIN student_portal.academic_revision r ON r.academic_year=h.academic_year
    AND r.academic_generation=h.generation AND r.academic_counter=h.revision
  CROSS JOIN LATERAL (SELECT DISTINCT ON(student_id) student_id,class_id,payload_json
    FROM student_portal.publication_source_v2 WHERE academic_year=2026 AND generation=h.generation AND revision<=h.revision
    ORDER BY student_id,revision DESC) s
  LEFT JOIN student_portal.account a ON a.academic_year=2026 AND a.gradebook_student_id=s.student_id AND a.closed_at IS NULL
  LEFT JOIN student_portal.setting sa ON sa.scope_key='account:2026:'||a.id::text AND sa.field_key='autoUpdate'
  LEFT JOIN student_portal.setting sc ON sc.scope_key='class:2026:'||s.class_id::text AND sc.field_key='autoUpdate'
  LEFT JOIN student_portal.setting ss ON ss.scope_key='school:2026' AND ss.field_key='autoUpdate'
  WHERE h.academic_year=2026 AND s.class_id IS NOT NULL AND jsonb_array_length(s.payload_json->'bindings')=1
    AND (s.payload_json#>>'{bindings,0,status}' IS NULL OR (s.payload_json#>>'{bindings,0,status}')::integer IN(1,2,7))
    AND COALESCE(sa.value_json,sc.value_json,ss.value_json,'false'::jsonb)='true'::jsonb
  ON CONFLICT(academic_year,student_id) DO UPDATE SET class_id=EXCLUDED.class_id,
    generation=EXCLUDED.generation,revision=EXCLUDED.revision;
END;
$$;

CREATE FUNCTION student_portal.capture_publication_source_v2() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source_generation char(32); source_revision numeric(20,0);
BEGIN
  SELECT academic_generation,academic_counter INTO source_generation,source_revision
    FROM student_portal.academic_revision WHERE academic_year=2026;
  IF source_generation IS NULL THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM student_portal.publication_source_head_v2
    WHERE academic_year=2026 AND generation=source_generation AND revision=source_revision) THEN RETURN; END IF;
  -- One database statement, not a network request/job per account. Unchanged source payloads are not duplicated.
  INSERT INTO student_portal.publication_source_v2(academic_year,student_id,generation,revision,class_id,payload_json,period_mask)
  SELECT 2026,s.student_id,source_generation,source_revision,s.class_id,s.payload_json,s.period_mask
  FROM student_portal.publication_source_rows_v2() s
  LEFT JOIN LATERAL (SELECT payload_json FROM student_portal.publication_source_v2 previous
    WHERE previous.academic_year=2026 AND previous.student_id=s.student_id AND previous.generation=source_generation
    ORDER BY previous.revision DESC LIMIT 1) previous ON true
  WHERE previous.payload_json IS DISTINCT FROM s.payload_json
  ON CONFLICT DO NOTHING;
  INSERT INTO student_portal.publication_source_head_v2(academic_year,generation,revision)
    VALUES(2026,source_generation,source_revision)
  ON CONFLICT(academic_year) DO UPDATE SET generation=EXCLUDED.generation,revision=EXCLUDED.revision,prepared_at=statement_timestamp();
  PERFORM student_portal.pin_publication_auto_approval_v2();
END;
$$;
CREATE FUNCTION student_portal.prepare_publication_after_commit_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.academic_year=2026 THEN PERFORM student_portal.capture_publication_source_v2(); END IF;
  RETURN NULL;
END;
$$;
-- Deferred means after the full write transaction, not a later asynchronous job.
-- Multiple revision increments in one transaction capture only its final, externally observable source.
CREATE CONSTRAINT TRIGGER student_portal_prepare_publication_v2
  AFTER INSERT OR UPDATE ON student_portal.academic_revision
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION student_portal.prepare_publication_after_commit_v2();
CREATE FUNCTION student_portal.pin_publication_after_policy_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF COALESCE(NEW.field_key,OLD.field_key)='autoUpdate' THEN PERFORM student_portal.pin_publication_auto_approval_v2(); END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER student_portal_pin_publication_policy_v2
  AFTER INSERT OR UPDATE OR DELETE ON student_portal.setting
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION student_portal.pin_publication_after_policy_v2();

-- Cutover is a separate explicit administrative action after compatible runtime deployment.
CREATE FUNCTION student_portal.activate_scoped_publication_v2() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE next_version bigint; current_revision text; adopted integer;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(613,0);
  PERFORM pg_advisory_xact_lock(613,2026);
  SELECT version+1 INTO next_version FROM student_portal.publication_control_v2 WHERE academic_year=2026 FOR UPDATE;
  IF EXISTS(SELECT 1 FROM student_portal.publication_control_v2 WHERE academic_year=2026 AND enabled)
    THEN RETURN jsonb_build_object('state','already-active'); END IF;
  PERFORM student_portal.capture_publication_source_v2();
  SELECT generation||':'||revision::text INTO current_revision FROM student_portal.publication_source_head_v2 WHERE academic_year=2026;
  IF current_revision IS NULL THEN RAISE EXCEPTION 'student-portal-preparation-unavailable'; END IF;
  -- Never recreate a pending historical edition using current marks.
  IF EXISTS(SELECT 1 FROM student_portal.publication_job WHERE state IN('queued','running')
    AND publication_version !~ '^job:0:' AND data_version<>current_revision)
    THEN RAISE EXCEPTION 'student-portal-cutover-pending-source-conflict'; END IF;
  INSERT INTO student_portal.publication_release_v2(scope_key,scope_kind,academic_year,account_id,bound_class_id,
    period,target_revision,version,released_at)
  SELECT DISTINCT ON(j.account_id,p.period) 'account:2026:'||j.account_id::text,'account',2026,j.account_id,b.class_id,
    p.period,j.data_version,next_version,j.created_at
  FROM student_portal.publication_job j
  JOIN student_portal.account a ON a.id=j.account_id AND a.closed_at IS NULL
  JOIN LATERAL (SELECT min(class_id) AS class_id,count(*) AS matches FROM student_portal.academic_binding_v1
    WHERE academic_year=2026 AND student_id=a.gradebook_student_id AND status IS DISTINCT FROM 6) b ON b.matches=1
  CROSS JOIN (VALUES('T1',1),('T2',2),('T3',4),('REC1',8),('REC2',16),('REC3',32)) p(period,mask)
  WHERE j.state IN('queued','running') AND j.data_version=current_revision
    AND j.publication_version ~ '^job:([0-9]|[1-5][0-9]|6[0-3])(:[0-9]+){6}$'
    AND (split_part(j.publication_version,':',2)::integer & p.mask)<>0
    AND j.publication_version=(SELECT 'job:'||split_part(j.publication_version,':',2)||':'||string_agg(COALESCE(s.version,0)::text,':' ORDER BY x.position)
      FROM unnest(ARRAY['T1','T2','T3','REC1','REC2','REC3']) WITH ORDINALITY x(period,position)
      LEFT JOIN student_portal.publication s ON s.account_id=j.account_id AND s.period=x.period)
    AND j.policy_version='epoch:'||(SELECT min(version)::text FROM student_portal.setting WHERE scope_key='school:2026')||':account:'||a.version::text
  ORDER BY j.account_id,p.period,j.created_at DESC
  ON CONFLICT(scope_key,period) DO NOTHING;
  GET DIAGNOSTICS adopted=ROW_COUNT;
  -- Existing published payloads remain as a read-only legacy floor. Superseded jobs are no longer the release authority.
  UPDATE student_portal.publication_job SET state='failed',lease_until=NULL,updated_at=statement_timestamp()
    WHERE state IN('queued','running');
  UPDATE student_portal.publication_control_v2 SET enabled=true,version=next_version WHERE academic_year=2026;
  RETURN jsonb_build_object('state','active','adoptedPendingPeriods',adopted,'version',next_version);
END;
$$;

REVOKE ALL ON student_portal.publication_source_v2,student_portal.publication_source_head_v2,
  student_portal.publication_auto_approval_v2,student_portal.publication_control_v2,student_portal.publication_release_v2 FROM PUBLIC;
REVOKE ALL ON FUNCTION student_portal.publication_source_rows_v2(),student_portal.pin_publication_auto_approval_v2(),
  student_portal.capture_publication_source_v2(),student_portal.prepare_publication_after_commit_v2(),
  student_portal.pin_publication_after_policy_v2(),student_portal.activate_scoped_publication_v2() FROM PUBLIC;
GRANT SELECT ON student_portal.publication_source_v2,student_portal.publication_source_head_v2,
  student_portal.publication_auto_approval_v2,student_portal.publication_control_v2,student_portal.publication_release_v2 TO student_portal_app;
GRANT INSERT,UPDATE ON student_portal.publication_release_v2 TO student_portal_app;
GRANT UPDATE(version) ON student_portal.publication_control_v2 TO student_portal_app;
-- No anon/authenticated grants, no change to exposed API schemas, no direct gradebook privileges.
SELECT student_portal.capture_publication_source_v2();
COMMIT;
