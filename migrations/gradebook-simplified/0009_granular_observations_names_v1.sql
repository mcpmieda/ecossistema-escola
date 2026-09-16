-- #817: explicit source observations and institutional assessment labels.
-- No backfill: historical discarded zeros/blank cells cannot be reconstructed.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(613, 0);
ALTER TABLE gradebook.nota ALTER COLUMN valor DROP NOT NULL;
ALTER TABLE gradebook.nota_historico
  ADD COLUMN nao_feito_anterior boolean NOT NULL DEFAULT false,
  ADD COLUMN nao_feito_novo boolean NOT NULL DEFAULT false,
  DROP CONSTRAINT nota_historico_delta_real_ck,
  ADD CONSTRAINT nota_historico_delta_real_ck CHECK (
    valor_anterior IS DISTINCT FROM valor_novo OR nao_feito_anterior <> nao_feito_novo
  ),
  ADD CONSTRAINT nota_historico_observacao_ck CHECK (
    (NOT nao_feito_anterior OR valor_anterior IS NULL)
    AND (NOT nao_feito_novo OR valor_novo IS NULL)
  );
ALTER TABLE gradebook.ano_letivo
  ADD COLUMN nomes_avaliacoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN nomes_avaliacoes_versao bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT ano_letivo_nomes_avaliacoes_v1 CHECK (
    jsonb_typeof(nomes_avaliacoes) = 'object'
    AND octet_length(nomes_avaliacoes::text) <= 4096
    AND nomes_avaliacoes - ARRAY['1:1','1:2','2:1','2:2','3:1','3:2']::text[] = '{}'::jsonb
    AND nomes_avaliacoes_versao >= 0
  );
COMMIT;
