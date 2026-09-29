-- Motivos de recusa e detalhes de entrada na auditoria (owner request 29/09/2026). Additive only.
-- A small, bounded JSON object per event: why a sign-in was refused, the step, attempt counters,
-- whether the student chose to stay connected and a coarse device family. Never a secret, a mark,
-- a full user agent or anything about another student. Old events keep NULL; no backfill.
-- DEPLOY ORDER: apply this BEFORE the Worker that writes detail_json.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE student_portal.audit_event
  ADD COLUMN detail_json jsonb,
  ADD CONSTRAINT student_portal_audit_detail_v1 CHECK (
    detail_json IS NULL OR (jsonb_typeof(detail_json) = 'object' AND octet_length(detail_json::text) <= 1024)
  );
COMMIT;
