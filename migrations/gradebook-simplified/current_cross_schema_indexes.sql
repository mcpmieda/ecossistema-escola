-- Reconstruction supplement for the current Gradebook catalog.
-- Authority: migrations/student-portal/0010_incremental_publication_v3.sql (#806).
-- These four indexes live physically in gradebook but were introduced by the Portal migration.
-- This file is NOT a production migration and must not be registered/applied independently.
-- It exists so disposable Gradebook replay/recovery can reconstruct the current physical catalog
-- without replaying the entire student_portal schema.
CREATE INDEX IF NOT EXISTS gradebook_nota_history_student_v3
  ON gradebook.nota_historico(aluno_id,importacao_id);
CREATE INDEX IF NOT EXISTS gradebook_nota_history_instrument_v3
  ON gradebook.nota_historico(instrumento_id);
CREATE INDEX IF NOT EXISTS gradebook_closing_history_student_v3
  ON gradebook.fechamento_historico(aluno_id,importacao_id);
CREATE INDEX IF NOT EXISTS gradebook_closing_history_offer_v3
  ON gradebook.fechamento_historico(oferta_id);
