-- #863 / BN-DEC-039: retire granular note/instrument history and stale current-state residue.
-- Current grades/definitions are authoritative after #862. Closing/binding/Council/bulletin history is preserved.
BEGIN;

-- These two granular histories are intentionally retired. The application no longer writes them.
DELETE FROM gradebook.nota_historico;
DELETE FROM gradebook.instrumento_historico;

-- A qualitative placeholder with no definition and no current observation is not an assessment.
DELETE FROM gradebook.instrumento i
WHERE i.slot BETWEEN 11 AND 20
  AND i.maximo IS NULL
  AND NULLIF(btrim(i.descricao),'') IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM gradebook.nota n WHERE n.instrumento_id=i.id
  );

-- Human Audit context is current-state metadata under BN-DEC-038.
DELETE FROM gradebook.importacao_diagnostico_tratamento t
WHERE NOT EXISTS (
  SELECT 1
  FROM gradebook.importacao_diagnostico d
  WHERE d.ano=t.ano AND d.arquivo=t.arquivo AND d.chave=t.chave
);

-- Import receipts whose only purpose was retired granular history no longer have a consumer.
-- Preserve every receipt still referenced by closing or binding history.
DELETE FROM gradebook.importacao i
WHERE NOT EXISTS (
    SELECT 1 FROM gradebook.fechamento_historico f WHERE f.importacao_id=i.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM gradebook.vinculo_historico v WHERE v.importacao_id=i.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM gradebook.nota_historico n WHERE n.importacao_id=i.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM gradebook.instrumento_historico h WHERE h.importacao_id=i.id
  );

-- Defense in depth: even if a future code path tries to revive granular history,
-- the dedicated application role cannot mutate these tables.
REVOKE INSERT, UPDATE, DELETE
  ON TABLE gradebook.nota_historico, gradebook.instrumento_historico
  FROM gradebook_app;

DO $$
DECLARE
  v_writable integer;
BEGIN
  IF EXISTS (SELECT 1 FROM gradebook.nota_historico)
     OR EXISTS (SELECT 1 FROM gradebook.instrumento_historico) THEN
    RAISE EXCEPTION 'current-state-retention-863-history-not-empty';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM gradebook.instrumento i
    WHERE i.slot BETWEEN 11 AND 20
      AND i.maximo IS NULL
      AND NULLIF(btrim(i.descricao),'') IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM gradebook.nota n WHERE n.instrumento_id=i.id
      )
  ) THEN
    RAISE EXCEPTION 'current-state-retention-863-empty-instrument-remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM gradebook.importacao_diagnostico_tratamento t
    WHERE NOT EXISTS (
      SELECT 1 FROM gradebook.importacao_diagnostico d
      WHERE d.ano=t.ano AND d.arquivo=t.arquivo AND d.chave=t.chave
    )
  ) THEN
    RAISE EXCEPTION 'current-state-retention-863-orphan-audit-treatment-remains';
  END IF;

  SELECT count(*)::integer INTO v_writable
  FROM (VALUES ('nota_historico'),('instrumento_historico')) AS t(table_name)
  WHERE has_table_privilege(
    'gradebook_app',
    format('gradebook.%I',t.table_name),
    'INSERT,UPDATE,DELETE'
  );
  IF v_writable <> 0 THEN
    RAISE EXCEPTION 'current-state-retention-863-history-write-grant-remains';
  END IF;
END
$$;

COMMIT;
