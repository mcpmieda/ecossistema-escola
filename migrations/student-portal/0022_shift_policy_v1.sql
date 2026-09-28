-- Políticas por turno (owner decision 2026-09-28). Additive only.
-- The shift of each class comes from the Relação (INICIO!I7:I28, beside the class in E/F), already
-- imported into gradebook.turma.turno. A shift is a policy level between the school and its classes:
-- for the same option a shift rule wins over its classes' rules (they stay stored, inactive, and come
-- back if the shift rule is removed); an account rule still wins over both.
-- DEPLOY ORDER: apply this BEFORE the Worker that reads shifts. It adds a narrow academic view,
-- extends the setting scope CHECK and aligns the publication pin with shift policy precedence.
-- With no shift settings the publication pin keeps exactly its previous behavior.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Normalized shift per class; an unknown spelling reads as NULL (no shift level for that class).
CREATE OR REPLACE VIEW student_portal.academic_class_v1 WITH (security_barrier = true) AS
SELECT t.ano AS academic_year, t.id AS class_id, t.codigo AS class_code, t.nome AS class_name,
       CASE upper(btrim(t.turno))
         WHEN 'MATUTINO' THEN 'MATUTINO'
         WHEN 'VESPERTINO' THEN 'VESPERTINO'
         WHEN 'NOTURNO' THEN 'NOTURNO'
       END AS shift
FROM gradebook.turma t
WHERE t.ano = 2026;
REVOKE ALL ON student_portal.academic_class_v1 FROM PUBLIC;
GRANT SELECT ON student_portal.academic_class_v1 TO student_portal_app;

ALTER TABLE student_portal.setting DROP CONSTRAINT student_portal_setting_scope_v1;
ALTER TABLE student_portal.setting ADD CONSTRAINT student_portal_setting_scope_v1 CHECK (
  (scope_kind = 'school' AND class_id IS NULL AND account_id IS NULL)
  OR (scope_kind = 'class' AND class_id IS NOT NULL AND class_id > 0 AND account_id IS NULL)
  OR (scope_kind = 'shift' AND class_id IS NULL AND account_id IS NULL
      AND scope_key ~ '^shift:2026:(MATUTINO|VESPERTINO|NOTURNO)$')
  OR (scope_kind = 'account' AND class_id IS NULL AND account_id IS NOT NULL)
);

-- Keep the durable auto-update floor on the same hierarchy as policy and publication reads.
-- Otherwise a class/school ON would keep promoting revisions behind a shift's explicit OFF,
-- or a shift ON would lose its last approved edition when switched back OFF.
CREATE OR REPLACE FUNCTION student_portal.pin_publication_auto_approval_v2() RETURNS void
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
  LEFT JOIN student_portal.academic_class_v1 c ON c.academic_year=2026 AND c.class_id=s.class_id
  LEFT JOIN student_portal.setting sh ON sh.scope_key='shift:2026:'||c.shift AND sh.field_key='autoUpdate'
  LEFT JOIN student_portal.setting sc ON sc.scope_key='class:2026:'||s.class_id::text AND sc.field_key='autoUpdate'
  LEFT JOIN student_portal.setting ss ON ss.scope_key='school:2026' AND ss.field_key='autoUpdate'
  WHERE h.academic_year=2026 AND s.class_id IS NOT NULL AND jsonb_array_length(s.payload_json->'bindings')=1
    AND (s.payload_json#>>'{bindings,0,status}' IS NULL OR (s.payload_json#>>'{bindings,0,status}')::integer IN(1,2,7))
    AND COALESCE(sa.value_json,sh.value_json,sc.value_json,ss.value_json,'false'::jsonb)='true'::jsonb
  ON CONFLICT(academic_year,student_id) DO UPDATE SET class_id=EXCLUDED.class_id,
    generation=EXCLUDED.generation,revision=EXCLUDED.revision;
END;
$$;
COMMIT;
