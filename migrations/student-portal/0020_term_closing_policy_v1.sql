-- #1132: policy fields of the Fechamento do trimestre. Additive only.
-- `showTermClosing` (off) turns the feature on; `termClosingConclusive` (on) chooses past-tense
-- closings of ended trimesters, or (off) a present-tense reading of the trimester in progress.
-- Seeds the school defaults at the current school epoch, so the "one epoch per school" invariant
-- holds. Class/account scopes store only their own overrides.
-- DEPLOY ORDER: deploy the Worker that tolerates 7 to 9 school fields first, then apply this.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE student_portal.setting DROP CONSTRAINT student_portal_setting_field_v1;
ALTER TABLE student_portal.setting ADD CONSTRAINT student_portal_setting_field_v1 CHECK (
  field_key IN ('accessEnabled','showPartials','autoUpdate','showFinalResult','showTermClosing','termClosingConclusive','allowedPeriods','risk','calendar')
);
INSERT INTO student_portal.setting
  (scope_key,field_key,scope_kind,academic_year,class_id,account_id,value_json,source_scope_json,version)
SELECT 'school:2026',d.field_key,'school',2026,NULL,NULL,d.value_json,s.source_scope_json,s.version
  FROM student_portal.setting s
 CROSS JOIN (VALUES ('showTermClosing','false'::jsonb),('termClosingConclusive','true'::jsonb)) d(field_key,value_json)
 WHERE s.scope_key='school:2026' AND s.field_key='accessEnabled'
ON CONFLICT (scope_key,field_key) DO NOTHING;
COMMIT;
