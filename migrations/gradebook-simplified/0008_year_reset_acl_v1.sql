-- #688 — privilégio mínimo para o reset anual autenticado e transacional.
-- Não altera dados, tabelas, sequências, regras acadêmicas ou acesso público/cliente.
BEGIN;

REVOKE ALL ON TABLE
  gradebook.conselho_sessao,
  gradebook.conselho_sessao_historico,
  gradebook.conselho_idempotencia,
  gradebook.conselho_votacao,
  gradebook.conselho_votacao_historico,
  gradebook.conselho_decisao_comando,
  gradebook.conselho_fechamento,
  gradebook.conselho_fechamento_item,
  gradebook.boletim_snapshot,
  gradebook.importacao_diagnostico_tratamento
FROM PUBLIC;

GRANT DELETE ON TABLE
  gradebook.conselho_sessao,
  gradebook.conselho_sessao_historico,
  gradebook.conselho_idempotencia,
  gradebook.conselho_votacao,
  gradebook.conselho_votacao_historico,
  gradebook.conselho_decisao_comando,
  gradebook.conselho_fechamento,
  gradebook.conselho_fechamento_item,
  gradebook.boletim_snapshot,
  gradebook.importacao_diagnostico_tratamento
TO gradebook_app;

COMMIT;
