-- #648 — neutraliza grants padrão do proprietário e fixa a ACL efetiva do Conselho V3.
-- Não altera tabelas, dados, sequências ou autoridade acadêmica.
BEGIN;

REVOKE ALL ON gradebook.conselho_sessao, gradebook.conselho_sessao_historico,
  gradebook.conselho_idempotencia, gradebook.conselho_votacao, gradebook.conselho_votacao_historico,
  gradebook.conselho_decisao_comando, gradebook.conselho_fechamento,
  gradebook.conselho_fechamento_item FROM gradebook_app;
REVOKE ALL ON SEQUENCE gradebook.conselho_sessao_historico_id_seq,
  gradebook.conselho_votacao_historico_id_seq,
  gradebook.conselho_decisao_comando_id_seq,
  gradebook.conselho_fechamento_id_seq FROM gradebook_app;

GRANT SELECT, INSERT, UPDATE ON gradebook.conselho_sessao TO gradebook_app;
GRANT SELECT, INSERT ON gradebook.conselho_sessao_historico TO gradebook_app;
GRANT SELECT, INSERT ON gradebook.conselho_idempotencia TO gradebook_app;
GRANT SELECT, INSERT, UPDATE ON gradebook.conselho_votacao TO gradebook_app;
GRANT SELECT, INSERT ON gradebook.conselho_votacao_historico TO gradebook_app;
GRANT SELECT, INSERT ON gradebook.conselho_decisao_comando TO gradebook_app;
GRANT SELECT, INSERT ON gradebook.conselho_fechamento TO gradebook_app;
GRANT SELECT, INSERT ON gradebook.conselho_fechamento_item TO gradebook_app;
GRANT USAGE, SELECT ON SEQUENCE gradebook.conselho_sessao_historico_id_seq TO gradebook_app;
GRANT USAGE, SELECT ON SEQUENCE gradebook.conselho_votacao_historico_id_seq TO gradebook_app;
GRANT USAGE, SELECT ON SEQUENCE gradebook.conselho_decisao_comando_id_seq TO gradebook_app;
GRANT USAGE, SELECT ON SEQUENCE gradebook.conselho_fechamento_id_seq TO gradebook_app;

COMMIT;
