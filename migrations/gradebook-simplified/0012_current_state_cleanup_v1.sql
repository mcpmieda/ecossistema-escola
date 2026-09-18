-- #863: remove granular import history and current-state residues.
-- The authoritative import snapshot (#862) is now the source of truth.
BEGIN;

-- Block all gradebook writers that participate in the annual reset/import lock.
SELECT pg_advisory_xact_lock(613,0);

DO $$
DECLARE
  v_note_count_before bigint;
  v_note_numeric_before bigint;
  v_note_sum_before bigint;
  v_closure_count_before bigint;
  v_bulletin_count_before bigint;
  v_council_count_before bigint;
  v_empty_instruments integer;
  v_note_count_after bigint;
  v_note_numeric_after bigint;
  v_note_sum_after bigint;
  v_closure_count_after bigint;
  v_bulletin_count_after bigint;
  v_council_count_after bigint;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE valor IS NOT NULL),
    COALESCE(sum(valor) FILTER (WHERE valor IS NOT NULL),0)
  INTO v_note_count_before,v_note_numeric_before,v_note_sum_before
  FROM gradebook.nota;

  SELECT count(*) INTO v_closure_count_before FROM gradebook.fechamento;
  SELECT count(*) INTO v_bulletin_count_before FROM gradebook.boletim_snapshot;
  SELECT
    (SELECT count(*) FROM gradebook.conselho_decisao)
    +(SELECT count(*) FROM gradebook.conselho_sessao)
    +(SELECT count(*) FROM gradebook.conselho_fechamento)
  INTO v_council_count_before;

  -- These two histories are intentionally retired. Current marks/definitions are authoritative.
  DELETE FROM gradebook.nota_historico;
  DELETE FROM gradebook.instrumento_historico;

  -- A qualitative instrument with no definition and no observations is not current academic state.
  DELETE FROM gradebook.instrumento i
  WHERE i.slot BETWEEN 11 AND 20
    AND i.maximo IS NULL
    AND NULLIF(btrim(i.descricao),'') IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM gradebook.nota n WHERE n.instrumento_id=i.id
    );

  GET DIAGNOSTICS v_empty_instruments = ROW_COUNT;

  -- Current Audit context cannot retain treatment after the diagnostic disappears.
  DELETE FROM gradebook.importacao_diagnostico_tratamento a
  WHERE NOT EXISTS (
    SELECT 1
    FROM gradebook.importacao_diagnostico d
    WHERE d.ano=a.ano AND d.arquivo=a.arquivo AND d.chave=a.chave
  );

  -- Keep only import rows still required by retained binding/closure history.
  DELETE FROM gradebook.importacao i
  WHERE NOT EXISTS (
      SELECT 1 FROM gradebook.fechamento_historico h WHERE h.importacao_id=i.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM gradebook.vinculo_historico h WHERE h.importacao_id=i.id
    );

  IF EXISTS (SELECT 1 FROM gradebook.nota_historico) THEN
    RAISE EXCEPTION 'current-state-cleanup-863-note-history-not-empty';
  END IF;
  IF EXISTS (SELECT 1 FROM gradebook.instrumento_historico) THEN
    RAISE EXCEPTION 'current-state-cleanup-863-instrument-history-not-empty';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM gradebook.instrumento i
    WHERE i.slot BETWEEN 11 AND 20
      AND i.maximo IS NULL
      AND NULLIF(btrim(i.descricao),'') IS NULL
      AND NOT EXISTS (SELECT 1 FROM gradebook.nota n WHERE n.instrumento_id=i.id)
  ) THEN
    RAISE EXCEPTION 'current-state-cleanup-863-empty-instrument-remains';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM gradebook.importacao_diagnostico_tratamento a
    WHERE NOT EXISTS (
      SELECT 1 FROM gradebook.importacao_diagnostico d
      WHERE d.ano=a.ano AND d.arquivo=a.arquivo AND d.chave=a.chave
    )
  ) THEN
    RAISE EXCEPTION 'current-state-cleanup-863-orphan-audit-treatment-remains';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM gradebook.importacao i
    WHERE NOT EXISTS (
        SELECT 1 FROM gradebook.fechamento_historico h WHERE h.importacao_id=i.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM gradebook.vinculo_historico h WHERE h.importacao_id=i.id
      )
  ) THEN
    RAISE EXCEPTION 'current-state-cleanup-863-unreferenced-import-remains';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE valor IS NOT NULL),
    COALESCE(sum(valor) FILTER (WHERE valor IS NOT NULL),0)
  INTO v_note_count_after,v_note_numeric_after,v_note_sum_after
  FROM gradebook.nota;
  SELECT count(*) INTO v_closure_count_after FROM gradebook.fechamento;
  SELECT count(*) INTO v_bulletin_count_after FROM gradebook.boletim_snapshot;
  SELECT
    (SELECT count(*) FROM gradebook.conselho_decisao)
    +(SELECT count(*) FROM gradebook.conselho_sessao)
    +(SELECT count(*) FROM gradebook.conselho_fechamento)
  INTO v_council_count_after;

  IF v_note_count_after <> v_note_count_before
     OR v_note_numeric_after <> v_note_numeric_before
     OR v_note_sum_after <> v_note_sum_before THEN
    RAISE EXCEPTION 'current-state-cleanup-863-current-notes-changed';
  END IF;
  IF v_closure_count_after <> v_closure_count_before THEN
    RAISE EXCEPTION 'current-state-cleanup-863-closures-changed';
  END IF;
  IF v_bulletin_count_after <> v_bulletin_count_before THEN
    RAISE EXCEPTION 'current-state-cleanup-863-bulletins-changed';
  END IF;
  IF v_council_count_after <> v_council_count_before THEN
    RAISE EXCEPTION 'current-state-cleanup-863-council-changed';
  END IF;

  RAISE NOTICE 'current-state-cleanup-863 removed % empty qualitative instruments', v_empty_instruments;
END
$$;

-- Runtime may read/delete the legacy-empty relations for reset/recovery compatibility,
-- but can no longer create or mutate granular history.
REVOKE INSERT, UPDATE ON TABLE
  gradebook.nota_historico,
  gradebook.instrumento_historico
FROM gradebook_app;

COMMIT;
