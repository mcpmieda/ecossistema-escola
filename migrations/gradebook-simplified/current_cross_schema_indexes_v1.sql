-- Current-recovery bridge for Gradebook indexes originally introduced by
-- student-portal/0010_incremental_publication_v3.sql.
--
-- This file is NOT a production migration and must not be registered/applied remotely.
-- Production already contains these four indexes. It exists so an empty disposable
-- Gradebook reconstruction can reproduce the current physical catalog without
-- requiring the Student Portal schema or replaying a cross-domain migration.
BEGIN;

CREATE INDEX IF NOT EXISTS gradebook_nota_history_student_v3
  ON gradebook.nota_historico(aluno_id,importacao_id);
CREATE INDEX IF NOT EXISTS gradebook_nota_history_instrument_v3
  ON gradebook.nota_historico(instrumento_id);
CREATE INDEX IF NOT EXISTS gradebook_closing_history_student_v3
  ON gradebook.fechamento_historico(aluno_id,importacao_id);
CREATE INDEX IF NOT EXISTS gradebook_closing_history_offer_v3
  ON gradebook.fechamento_historico(oferta_id);

COMMIT;
