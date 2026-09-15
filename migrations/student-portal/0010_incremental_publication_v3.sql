-- #806. Incremental preparation, no change to source grades or publication decisions.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock_shared(613,0);
SELECT pg_advisory_xact_lock(613,2026);

CREATE FUNCTION student_portal.publication_source_rows_v3(p_student_ids integer[])
RETURNS TABLE(student_id integer,class_id integer,payload_json jsonb,period_mask integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
WITH context AS MATERIALIZED (
  SELECT s.student_id,s.name,y.minimum_approval,y.max_council_components,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('academicYear',b.academic_year,'studentId',b.student_id,
      'classId',b.class_id,'status',b.status,'classLabel',b.class_name))
      FROM student_portal.academic_binding_v1 b WHERE b.academic_year=2026 AND b.student_id=s.student_id
        AND b.status IS DISTINCT FROM 6),'[]'::jsonb) AS bindings,
    (SELECT decision FROM student_portal.academic_council_decision_v1 c
      WHERE c.academic_year=2026 AND c.student_id=s.student_id) AS decision
  FROM student_portal.academic_student_v1 s
  JOIN student_portal.academic_year_policy_v1 y ON y.academic_year=s.academic_year
  WHERE s.academic_year=2026 AND (p_student_ids IS NULL OR s.student_id=ANY(p_student_ids))
), target AS (
  SELECT *,CASE WHEN jsonb_array_length(bindings)=1 THEN (bindings->0->>'classId')::integer END AS class_id FROM context
), raw AS MATERIALIZED (
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
REVOKE ALL ON FUNCTION student_portal.publication_source_rows_v3(integer[]) FROM PUBLIC;

CREATE TABLE student_portal.publication_preparation_metrics_v3 (
  academic_year smallint PRIMARY KEY CHECK(academic_year=2026),
  revision text NOT NULL,
  mode text NOT NULL CHECK(mode IN('full','incremental')),
  scanned_students integer NOT NULL CHECK(scanned_students>=0),
  written_sources integer NOT NULL CHECK(written_sources>=0),
  elapsed_ms numeric NOT NULL CHECK(elapsed_ms>=0),
  prepared_at timestamptz NOT NULL
);
REVOKE ALL ON TABLE student_portal.publication_preparation_metrics_v3 FROM PUBLIC;
GRANT SELECT ON student_portal.publication_preparation_metrics_v3 TO student_portal_app;

CREATE OR REPLACE FUNCTION student_portal.capture_publication_source_v2() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  source_generation char(32); source_revision numeric(20,0); previous_revision numeric(20,0);
  covered numeric; unknown_scope boolean; changed_ids integer[]; expanded_ids integer[];
  scanned integer; written integer; started timestamptz := clock_timestamp();
BEGIN
  SELECT academic_generation,academic_counter INTO source_generation,source_revision
    FROM student_portal.academic_revision WHERE academic_year=2026;
  IF source_generation IS NULL THEN RETURN; END IF;
  SELECT revision INTO previous_revision FROM student_portal.publication_source_head_v2
    WHERE academic_year=2026 AND generation=source_generation;
  IF previous_revision=source_revision THEN RETURN; END IF;

  -- The domain writer records the affected students in the same transaction as the facts.
  -- Missing revision coverage, global changes and empty scope MUST fall back to full preparation.
  WITH events AS MATERIALIZED (
    SELECT * FROM student_portal.revision_event e WHERE e.academic_year=2026 AND e.affects_academic
      AND split_part(e.data_version,':',1)=source_generation::text
      AND split_part(e.data_version,':',2)::numeric>previous_revision
      AND split_part(e.data_version,':',2)::numeric<=source_revision
  ) SELECT count(DISTINCT data_version),
      COALESCE(bool_or(cardinality(student_ids)=0 OR cause NOT IN('marks','relation','council')),true),
      (SELECT array_agg(DISTINCT id ORDER BY id) FROM events CROSS JOIN LATERAL unnest(student_ids) id)
    INTO covered,unknown_scope,changed_ids FROM events;
  IF previous_revision IS NOT NULL AND covered=source_revision-previous_revision
    AND NOT unknown_scope AND cardinality(changed_ids)>0 THEN
    -- An instrument's definition or presence changes every student in its class, not just
    -- the rows that received marks. Expand current AND previous classes before evaluating.
    WITH classes AS (
      SELECT class_id FROM student_portal.academic_binding_v1
        WHERE academic_year=2026 AND student_id=ANY(changed_ids) AND status IS DISTINCT FROM 6
      UNION
      SELECT class_id FROM student_portal.publication_source_v2
        WHERE academic_year=2026 AND generation=source_generation AND student_id=ANY(changed_ids)
          AND revision<=previous_revision
    ), affected AS (
      SELECT unnest(changed_ids) AS id
      UNION SELECT student_id FROM student_portal.academic_binding_v1
        WHERE academic_year=2026 AND class_id IN(SELECT class_id FROM classes) AND status IS DISTINCT FROM 6
    ) SELECT array_agg(id ORDER BY id) INTO expanded_ids FROM affected;
  ELSE expanded_ids := NULL;
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT s.* FROM student_portal.publication_source_rows_v3(expanded_ids) s
  ), inserted AS (
    INSERT INTO student_portal.publication_source_v2(academic_year,student_id,generation,revision,class_id,payload_json,period_mask)
    SELECT 2026,s.student_id,source_generation,source_revision,s.class_id,s.payload_json,s.period_mask
    FROM candidates s LEFT JOIN LATERAL (
      SELECT payload_json FROM student_portal.publication_source_v2 previous
      WHERE previous.academic_year=2026 AND previous.student_id=s.student_id AND previous.generation=source_generation
      ORDER BY previous.revision DESC LIMIT 1) previous ON true
    WHERE previous.payload_json IS DISTINCT FROM s.payload_json
    ON CONFLICT DO NOTHING RETURNING student_id
  ) SELECT (SELECT count(*) FROM candidates),(SELECT count(*) FROM inserted) INTO scanned,written;
  INSERT INTO student_portal.publication_source_head_v2(academic_year,generation,revision)
    VALUES(2026,source_generation,source_revision)
  ON CONFLICT(academic_year) DO UPDATE SET generation=EXCLUDED.generation,revision=EXCLUDED.revision,prepared_at=statement_timestamp();
  PERFORM student_portal.pin_publication_auto_approval_v2();
  INSERT INTO student_portal.publication_preparation_metrics_v3
    VALUES(2026,source_generation||':'||source_revision::text,
      CASE WHEN expanded_ids IS NULL THEN 'full' ELSE 'incremental' END,scanned,written,
      extract(epoch FROM clock_timestamp()-started)*1000,statement_timestamp())
  ON CONFLICT(academic_year) DO UPDATE SET revision=EXCLUDED.revision,mode=EXCLUDED.mode,
    scanned_students=EXCLUDED.scanned_students,written_sources=EXCLUDED.written_sources,
    elapsed_ms=EXCLUDED.elapsed_ms,prepared_at=EXCLUDED.prepared_at;
END;
$$;

-- Targeted indexes for current Self joins and the large academic histories. No unused index is removed.
CREATE INDEX IF NOT EXISTS student_portal_publication_account_period_v3 ON student_portal.publication(account_id,period);
CREATE INDEX IF NOT EXISTS gradebook_nota_history_student_v3 ON gradebook.nota_historico(aluno_id,importacao_id);
CREATE INDEX IF NOT EXISTS gradebook_nota_history_instrument_v3 ON gradebook.nota_historico(instrumento_id);
CREATE INDEX IF NOT EXISTS gradebook_closing_history_student_v3 ON gradebook.fechamento_historico(aluno_id,importacao_id);
CREATE INDEX IF NOT EXISTS gradebook_closing_history_offer_v3 ON gradebook.fechamento_historico(oferta_id);
COMMIT;
