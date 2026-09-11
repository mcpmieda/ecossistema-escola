-- #654: immutable relational bulletin snapshots for the fixed 2026 context.
-- Additive only: no backfill and no write to academic facts.
BEGIN;

CREATE TABLE gradebook.boletim_snapshot (
  snapshot_id uuid NOT NULL,
  versao integer NOT NULL,
  chave_serie text NOT NULL,
  ano smallint NOT NULL,
  turma_id integer NOT NULL,
  aluno_id integer NOT NULL,
  emitido_em timestamp with time zone NOT NULL,
  emitido_por_oid text NOT NULL,
  data_version text NOT NULL,
  periodo_json jsonb NOT NULL,
  detalhe text NOT NULL,
  apresentacao_json jsonb NOT NULL,
  snapshot_json jsonb NOT NULL,
  CONSTRAINT boletim_snapshot_pk PRIMARY KEY (snapshot_id, versao),
  CONSTRAINT boletim_snapshot_serie_versao_uk UNIQUE (chave_serie, versao),
  CONSTRAINT boletim_snapshot_ano_fk FOREIGN KEY (ano)
    REFERENCES gradebook.ano_letivo(ano),
  CONSTRAINT boletim_snapshot_turma_ano_fk FOREIGN KEY (turma_id, ano)
    REFERENCES gradebook.turma(id, ano),
  CONSTRAINT boletim_snapshot_aluno_ano_fk FOREIGN KEY (aluno_id, ano)
    REFERENCES gradebook.aluno(id, ano),
  CONSTRAINT boletim_snapshot_ano_2026_ck CHECK (ano = 2026),
  CONSTRAINT boletim_snapshot_versao_ck CHECK (versao > 0),
  CONSTRAINT boletim_snapshot_chave_ck CHECK (btrim(chave_serie) <> ''),
  CONSTRAINT boletim_snapshot_emissor_ck CHECK (btrim(emitido_por_oid) <> ''),
  CONSTRAINT boletim_snapshot_data_version_ck CHECK (btrim(data_version) <> ''),
  CONSTRAINT boletim_snapshot_detalhe_ck CHECK (detalhe IN ('summary', 'detailed')),
  CONSTRAINT boletim_snapshot_periodo_json_ck CHECK (jsonb_typeof(periodo_json) = 'object'),
  CONSTRAINT boletim_snapshot_apresentacao_json_ck CHECK (jsonb_typeof(apresentacao_json) = 'object'),
  CONSTRAINT boletim_snapshot_json_ck CHECK (jsonb_typeof(snapshot_json) = 'object'),
  CONSTRAINT boletim_snapshot_payload_identidade_ck CHECK (
    snapshot_json ->> 'snapshotId' = snapshot_id::text
    AND (snapshot_json ->> 'snapshotVersion')::integer = versao
    AND snapshot_json ->> 'dataVersion' = data_version
    AND (snapshot_json -> 'model' ->> 'year')::smallint = ano
    AND (snapshot_json -> 'model' -> 'classGroup' ->> 'id')::integer = turma_id
    AND (snapshot_json -> 'model' -> 'student' ->> 'id')::integer = aluno_id
    AND snapshot_json -> 'model' -> 'period' = periodo_json
    AND snapshot_json -> 'presentation' = apresentacao_json
  )
);

CREATE INDEX boletim_snapshot_turma_emitido_idx
  ON gradebook.boletim_snapshot (ano, turma_id, emitido_em DESC);
CREATE INDEX boletim_snapshot_aluno_emitido_idx
  ON gradebook.boletim_snapshot (ano, aluno_id, emitido_em DESC);

REVOKE ALL ON TABLE gradebook.boletim_snapshot FROM PUBLIC;
REVOKE ALL ON TABLE gradebook.boletim_snapshot FROM gradebook_app;
GRANT SELECT, INSERT ON TABLE gradebook.boletim_snapshot TO gradebook_app;

COMMIT;
