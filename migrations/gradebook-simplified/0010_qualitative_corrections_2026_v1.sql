-- #855: one-time audited cleanup of completed 2026 qualitative definitions.
-- T3 is intentionally excluded because it is still in progress.
BEGIN;

CREATE TEMP TABLE qualitative_correction_855_v1 (
  professor text NOT NULL,
  turma text NOT NULL,
  disciplina text NOT NULL,
  trimestre smallint NOT NULL,
  slot smallint NOT NULL,
  expected_max integer,
  expected_description text,
  next_max integer,
  next_description text,
  action text NOT NULL CHECK (action IN ('maximum','suppress'))
) ON COMMIT DROP;

INSERT INTO qualitative_correction_855_v1
  (professor,turma,disciplina,trimestre,slot,expected_max,expected_description,next_max,next_description,action)
VALUES
  ('CLEBER','6A','ÉTICA',2,12,3000,'2ª ATIVIDADE',6000,'2ª ATIVIDADE','maximum'),
  ('LURMÁRIA','6B','RELIGIÃO',1,16,NULL,'EX',NULL,NULL,'suppress'),
  ('LURMÁRIA','6D','RELIGIÃO',1,16,1000,'EX',NULL,NULL,'suppress'),
  ('LURMÁRIA','6D','RELIGIÃO',2,15,500,'EX',NULL,NULL,'suppress'),
  ('LURMÁRIA','7A','RELIGIÃO',1,16,NULL,'EX.P',NULL,NULL,'suppress'),
  ('LURMÁRIA','7B','RELIGIÃO',1,16,NULL,'EX',NULL,NULL,'suppress'),
  ('LURMÁRIA','7C','RELIGIÃO',2,14,4500,'P.D.',NULL,NULL,'suppress'),
  ('LURMÁRIA','7D','RELIGIÃO',1,15,1000,'EX.',NULL,NULL,'suppress'),
  ('LURMÁRIA','7D','RELIGIÃO',2,15,NULL,'EX.',NULL,NULL,'suppress'),
  ('LURMÁRIA','8A','RELIGIÃO',1,15,4500,'P.D.',NULL,NULL,'suppress'),
  ('LURMÁRIA','8B','RELIGIÃO',1,15,4500,'P.D',NULL,NULL,'suppress'),
  ('LURMÁRIA','8B','RELIGIÃO',1,16,1000,'EX',NULL,NULL,'suppress'),
  ('EDILMA','8C','CIÊNCIAS',1,13,3000,'II ATIV',NULL,NULL,'suppress');

CREATE TEMP TABLE qualitative_correction_855_resolved AS
SELECT
  c.*,
  i.id AS instrumento_id,
  o.id AS oferta_id,
  o.turma_id,
  i.maximo AS current_max,
  i.descricao AS current_description
FROM qualitative_correction_855_v1 c
JOIN gradebook.turma t
  ON t.ano=2026 AND t.codigo=c.turma
JOIN gradebook.disciplina d
  ON d.ano=2026 AND d.nome=c.disciplina
JOIN gradebook.professor p
  ON p.ano=2026 AND p.nome=c.professor
JOIN gradebook.oferta o
  ON o.ano=2026 AND o.turma_id=t.id AND o.disciplina_id=d.id AND o.professor_id=p.id
JOIN gradebook.instrumento i
  ON i.oferta_id=o.id AND i.trimestre=c.trimestre AND i.slot=c.slot
WHERE i.maximo IS NOT DISTINCT FROM c.expected_max
  AND i.descricao IS NOT DISTINCT FROM c.expected_description;

DO $$
DECLARE
  v_resolved integer;
  v_numeric_suppressed integer;
  v_bad_max integer;
  v_import_id integer;
  v_event_function regprocedure;
  v_student_ids integer[];
  v_bad_post integer;
BEGIN
  SELECT count(*)::integer INTO v_resolved FROM qualitative_correction_855_resolved;

  -- Clean installs and already-corrected databases are deliberate no-ops.
  IF v_resolved = 0 THEN
    RETURN;
  END IF;

  IF v_resolved <> 13 THEN
    RAISE EXCEPTION 'qualitative-correction-855-source-drift: expected 13 exact definitions, found %', v_resolved;
  END IF;

  SELECT count(*)::integer INTO v_numeric_suppressed
  FROM qualitative_correction_855_resolved r
  JOIN gradebook.nota n ON n.instrumento_id=r.instrumento_id
  WHERE r.action='suppress' AND n.valor IS NOT NULL;
  IF v_numeric_suppressed <> 0 THEN
    RAISE EXCEPTION 'qualitative-correction-855-blocked: a suppressed slot contains a numeric grade';
  END IF;

  SELECT count(*)::integer INTO v_bad_max
  FROM qualitative_correction_855_resolved r
  JOIN gradebook.nota n ON n.instrumento_id=r.instrumento_id
  WHERE r.action='maximum'
    AND n.valor IS NOT NULL
    AND (n.valor > 6000 OR n.valor < 0);
  IF v_bad_max <> 0 THEN
    RAISE EXCEPTION 'qualitative-correction-855-blocked: corrected maximum does not contain current values';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM qualitative_correction_855_resolved r
    JOIN gradebook.nota n ON n.instrumento_id=r.instrumento_id
    WHERE r.action='maximum' AND n.valor > r.current_max AND n.valor <= r.next_max
  ) THEN
    RAISE EXCEPTION 'qualitative-correction-855-proof-missing: no value proves the current maximum is too small';
  END IF;

  INSERT INTO gradebook.importacao (ano,tipo,arquivo,hash)
  VALUES (
    2026,
    2,
    'CORRECAO QUALITATIVO #855 V1',
    decode(repeat('85',32),'hex')
  )
  RETURNING id INTO v_import_id;

  INSERT INTO gradebook.instrumento_historico
    (importacao_id,instrumento_id,maximo_anterior,maximo_novo,descricao_anterior,descricao_nova)
  SELECT
    v_import_id,
    instrumento_id,
    current_max,
    next_max,
    current_description,
    next_description
  FROM qualitative_correction_855_resolved;

  INSERT INTO gradebook.nota_historico
    (importacao_id,instrumento_id,aluno_id,valor_anterior,valor_novo,nao_feito_anterior,nao_feito_novo)
  SELECT
    v_import_id,
    r.instrumento_id,
    n.aluno_id,
    NULL,
    NULL,
    true,
    false
  FROM qualitative_correction_855_resolved r
  JOIN gradebook.nota n ON n.instrumento_id=r.instrumento_id
  WHERE r.action='suppress' AND n.valor IS NULL;

  DELETE FROM gradebook.nota n
  USING qualitative_correction_855_resolved r
  WHERE r.action='suppress'
    AND n.instrumento_id=r.instrumento_id
    AND n.valor IS NULL;

  UPDATE gradebook.instrumento i
  SET maximo=r.next_max,
      descricao=r.next_description
  FROM qualitative_correction_855_resolved r
  WHERE i.id=r.instrumento_id;

  -- The current diagnostics snapshot must stop showing the maximum that this
  -- transaction has just proved and corrected. Treatment history is separate.
  DELETE FROM gradebook.importacao_diagnostico
  WHERE ano=2026
    AND arquivo='NOTAS CLEBER 2026.xlsb'
    AND turma_codigo='6A'
    AND disciplina='ÉTICA'
    AND periodo='2º trimestre'
    AND codigo='above-maximum'
    AND rotulo='Atividade 2 — 2ª ATIVIDADE';

  SELECT array_agg(DISTINCT v.aluno_id ORDER BY v.aluno_id)
  INTO v_student_ids
  FROM qualitative_correction_855_resolved r
  JOIN gradebook.vinculo v ON v.ano=2026 AND v.turma_id=r.turma_id;

  v_event_function := to_regprocedure(
    'student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz)'
  );
  IF v_event_function IS NOT NULL THEN
    PERFORM *
    FROM student_portal.record_gradebook_change_v1(
      '00000855-0000-4000-8000-000000000001'::uuid,
      2026::smallint,
      'marks',
      true,
      COALESCE(v_student_ids, ARRAY[]::integer[]),
      statement_timestamp()
    );
  END IF;

  WITH corrected_terms AS (
    SELECT DISTINCT oferta_id,trimestre
    FROM qualitative_correction_855_resolved
  ),
  active_instruments AS (
    SELECT i.*
    FROM gradebook.instrumento i
    WHERE
      i.slot < 11
      OR i.maximo IS NOT NULL
      OR (
        NULLIF(btrim(i.descricao),'') IS NOT NULL
        AND NOT btrim(i.descricao) ~ ('^' || (i.slot - 10)::text || '([.,]0+)?$')
      )
      OR EXISTS (
        SELECT 1 FROM gradebook.nota evidence WHERE evidence.instrumento_id=i.id
      )
  ),
  totals AS (
    SELECT
      c.oferta_id,
      c.trimestre,
      sum(COALESCE(i.maximo,0)) FILTER (WHERE i.slot BETWEEN 11 AND 20) AS qualitative_max,
      count(*) FILTER (WHERE i.slot BETWEEN 11 AND 20 AND i.maximo IS NULL) AS unknown_max
    FROM corrected_terms c
    LEFT JOIN active_instruments i
      ON i.oferta_id=c.oferta_id AND i.trimestre=c.trimestre
    GROUP BY c.oferta_id,c.trimestre
  )
  SELECT count(*)::integer INTO v_bad_post
  FROM totals
  WHERE qualitative_max <> 16500 OR unknown_max <> 0;

  IF v_bad_post <> 0 THEN
    RAISE EXCEPTION 'qualitative-correction-855-postcondition-failed: % closed terms remain inconsistent', v_bad_post;
  END IF;
END
$$;

COMMIT;
