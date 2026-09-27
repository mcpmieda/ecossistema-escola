-- Agendamentos de acesso (owner decision 2026-09-27). Additive only.
-- `accessSchedule` holds a level's scheduled Abrir/Fechar actions, saved together with
-- `accessEnabled`. No row means the level still uses the Calendário access window, so no seed.
-- DEPLOY ORDER: deploy the Worker that reads `accessSchedule` as optional first, then apply this.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE student_portal.setting DROP CONSTRAINT student_portal_setting_field_v1;
ALTER TABLE student_portal.setting ADD CONSTRAINT student_portal_setting_field_v1 CHECK (
  field_key IN ('accessEnabled','accessSchedule','showPartials','autoUpdate','showFinalResult','showTermClosing','termClosingConclusive','allowedPeriods','risk','calendar')
);
COMMIT;
