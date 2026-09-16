-- #817. Requires gradebook-simplified/0009. No publication or backfill.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock_shared(613,0);
SELECT pg_advisory_xact_lock(613,2026);
CREATE OR REPLACE VIEW student_portal.academic_year_policy_v1 WITH (security_barrier=true) AS
SELECT ano AS academic_year, minimo_aprovacao AS minimum_approval,
       max_componentes_conselho AS max_council_components, nomes_avaliacoes AS assessment_names
FROM gradebook.ano_letivo WHERE ano=2026;
CREATE OR REPLACE FUNCTION student_portal.publication_source_rows_v3(p_student_ids integer[])
RETURNS TABLE(student_id integer,class_id integer,payload_json jsonb,period_mask integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
WITH context AS MATERIALIZED (
  SELECT s.student_id,s.name,y.minimum_approval,y.max_council_components,y.assessment_names,
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
    'assessment_names',target.assessment_names,'minimum_approval',target.minimum_approval,'max_council_components',target.max_council_components,
    'bindings',target.bindings,'decision',target.decision,
    'offers',COALESCE((SELECT jsonb_agg(jsonb_build_object('offerId',o.offer_id,'subjectId',o.subject_id,'label',o.subject_label,
      'instruments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'term',i.trimestre,'slot',i.slot,
        'maximum',i.maximo,'label',i.descricao,'value',n.value,'observed',n.assessment_id IS NOT NULL) ORDER BY i.trimestre,i.slot)
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
        WHERE (i->>'term')::integer=p.term AND (i->>'value' IS NOT NULL OR (i->>'observed')::boolean IS TRUE)))
      OR (p.position>=3 AND ((COALESCE((o->'closure'->>'nc')::integer,0)
        | COALESCE((o->'closure'->>'rr')::integer,0)) & (1 << (p.term-1)))<>0))
),0) FROM raw;
$$;
REVOKE ALL ON FUNCTION student_portal.publication_source_rows_v3(integer[]) FROM PUBLIC;

-- Other gradebook years must not violate the Portal's 2026-only routing constraint.
DROP TRIGGER student_portal_revision_live_event_v1 ON student_portal.revision_event;
CREATE TRIGGER student_portal_revision_live_event_v1
  AFTER INSERT ON student_portal.revision_event FOR EACH ROW
  WHEN (NEW.academic_year = 2026)
  EXECUTE FUNCTION student_portal.enqueue_revision_live_event_v1();
COMMIT;
