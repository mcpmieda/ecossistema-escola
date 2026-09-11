-- #676 — anos materializados pela Relação e marcador terminal R/R.
-- Migração aditiva: não reinterpreta notas nem altera fatos acadêmicos existentes.
BEGIN;

ALTER TABLE gradebook.fechamento
  ADD COLUMN rec_rr_mask SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE gradebook.fechamento
  ADD CONSTRAINT fechamento_rec_rr_mask_ck CHECK (rec_rr_mask BETWEEN 0 AND 7),
  ADD CONSTRAINT fechamento_rec1_rr_ck CHECK (((rec_rr_mask::integer & 1) = 0) OR rec1 IS NULL),
  ADD CONSTRAINT fechamento_rec2_rr_ck CHECK (((rec_rr_mask::integer & 2) = 0) OR rec2 IS NULL),
  ADD CONSTRAINT fechamento_rec3_rr_ck CHECK (((rec_rr_mask::integer & 4) = 0) OR rec3 IS NULL),
  ADD CONSTRAINT fechamento_rec_masks_disjuntos_ck CHECK ((rec_nc_mask::integer & rec_rr_mask::integer) = 0);

ALTER TABLE gradebook.fechamento_historico
  DROP CONSTRAINT fechamento_historico_estado_anterior_ck,
  DROP CONSTRAINT fechamento_historico_estado_novo_ck,
  DROP CONSTRAINT fechamento_historico_nc_so_rec_anterior_ck,
  DROP CONSTRAINT fechamento_historico_nc_so_rec_novo_ck,
  DROP CONSTRAINT fechamento_historico_valor_estado_anterior_ck,
  DROP CONSTRAINT fechamento_historico_valor_estado_novo_ck;

ALTER TABLE gradebook.fechamento_historico
  ADD CONSTRAINT fechamento_historico_estado_anterior_ck CHECK (estado_anterior BETWEEN 0 AND 3),
  ADD CONSTRAINT fechamento_historico_estado_novo_ck CHECK (estado_novo BETWEEN 0 AND 3),
  ADD CONSTRAINT fechamento_historico_marcador_so_rec_anterior_ck CHECK (estado_anterior NOT IN (2, 3) OR campo IN (4, 5, 6)),
  ADD CONSTRAINT fechamento_historico_marcador_so_rec_novo_ck CHECK (estado_novo NOT IN (2, 3) OR campo IN (4, 5, 6)),
  ADD CONSTRAINT fechamento_historico_valor_estado_anterior_ck CHECK (
    (estado_anterior = 1 AND valor_anterior IS NOT NULL AND valor_anterior >= 0)
    OR (estado_anterior IN (0, 2, 3) AND valor_anterior IS NULL)
  ),
  ADD CONSTRAINT fechamento_historico_valor_estado_novo_ck CHECK (
    (estado_novo = 1 AND valor_novo IS NOT NULL AND valor_novo >= 0)
    OR (estado_novo IN (0, 2, 3) AND valor_novo IS NULL)
  );

ALTER TABLE gradebook.boletim_snapshot
  DROP CONSTRAINT boletim_snapshot_ano_2026_ck;

ALTER TABLE gradebook.importacao_diagnostico_tratamento
  DROP CONSTRAINT importacao_diagnostico_tratamento_ano_ck;

COMMIT;
