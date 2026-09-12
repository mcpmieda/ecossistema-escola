-- Portal do Aluno P1-02 / #704.
-- Policies, publication state, projections, durable jobs and revision coordination.
BEGIN;

CREATE TABLE student_portal.setting (
  scope_key text NOT NULL,
  field_key text NOT NULL,
  scope_kind text NOT NULL,
  academic_year smallint NOT NULL DEFAULT 2026,
  class_id integer,
  account_id uuid REFERENCES student_portal.account(id) ON DELETE CASCADE,
  value_json jsonb NOT NULL,
  source_scope_json jsonb NOT NULL,
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, field_key),
  CONSTRAINT student_portal_setting_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_setting_field_v1 CHECK (
    field_key IN ('accessEnabled','showPartials','autoUpdate','showFinalResult','allowedPeriods','risk','calendar')
  ),
  CONSTRAINT student_portal_setting_scope_v1 CHECK (
    (scope_kind = 'school' AND class_id IS NULL AND account_id IS NULL)
    OR (scope_kind = 'class' AND class_id IS NOT NULL AND class_id > 0 AND account_id IS NULL)
    OR (scope_kind = 'account' AND class_id IS NULL AND account_id IS NOT NULL)
  ),
  CONSTRAINT student_portal_setting_version_v1 CHECK (version >= 0),
  CONSTRAINT student_portal_setting_json_v1
    CHECK (jsonb_typeof(value_json) <> 'null' AND jsonb_typeof(source_scope_json) = 'object')
);
CREATE INDEX student_portal_setting_scope_idx_v1
  ON student_portal.setting(academic_year, scope_kind, class_id, account_id, version);

CREATE TABLE student_portal.publication (
  scope_key text NOT NULL,
  scope_kind text NOT NULL,
  academic_year smallint NOT NULL DEFAULT 2026,
  class_id integer,
  account_id uuid REFERENCES student_portal.account(id) ON DELETE CASCADE,
  period text NOT NULL,
  state text NOT NULL,
  available_revision text,
  published_revision text,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, period),
  CONSTRAINT student_portal_publication_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_publication_scope_v1 CHECK (
    (scope_kind = 'school' AND class_id IS NULL AND account_id IS NULL)
    OR (scope_kind = 'class' AND class_id IS NOT NULL AND class_id > 0 AND account_id IS NULL)
    OR (scope_kind = 'account' AND class_id IS NULL AND account_id IS NOT NULL)
  ),
  CONSTRAINT student_portal_publication_period_v1
    CHECK (period IN ('T1','T2','T3','REC1','REC2','REC3')),
  CONSTRAINT student_portal_publication_state_v1
    CHECK (state IN ('no-data','available','published','update-pending')),
  CONSTRAINT student_portal_publication_version_v1 CHECK (version >= 0),
  CONSTRAINT student_portal_publication_revisions_v1 CHECK (
    (available_revision IS NULL OR available_revision ~ '^[A-Za-z0-9:_-]{1,128}$')
    AND (published_revision IS NULL OR published_revision ~ '^[A-Za-z0-9:_-]{1,128}$')
  )
);
CREATE INDEX student_portal_publication_scope_idx_v1
  ON student_portal.publication(academic_year, scope_kind, class_id, account_id, state);

CREATE TABLE student_portal.published_projection (
  account_id uuid NOT NULL REFERENCES student_portal.account(id) ON DELETE CASCADE,
  academic_year smallint NOT NULL DEFAULT 2026,
  payload_json jsonb NOT NULL,
  data_version text NOT NULL,
  policy_version text NOT NULL,
  publication_version text NOT NULL,
  generated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, academic_year),
  CONSTRAINT student_portal_projection_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_projection_payload_v1 CHECK (jsonb_typeof(payload_json) = 'object'),
  CONSTRAINT student_portal_projection_revisions_v1 CHECK (
    data_version ~ '^[A-Za-z0-9:_-]{1,128}$'
    AND policy_version ~ '^[A-Za-z0-9:_-]{1,128}$'
    AND publication_version ~ '^[A-Za-z0-9:_-]{1,128}$'
  )
);
CREATE INDEX student_portal_projection_versions_idx_v1
  ON student_portal.published_projection(academic_year, data_version, policy_version, publication_version);

CREATE TABLE student_portal.publication_job (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES student_portal.account(id) ON DELETE CASCADE,
  data_version text NOT NULL,
  policy_version text NOT NULL,
  publication_version text NOT NULL,
  state text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_publication_job_state_v1
    CHECK (state IN ('queued','running','done','failed')),
  CONSTRAINT student_portal_publication_job_attempts_v1 CHECK (attempts >= 0),
  CONSTRAINT student_portal_publication_job_revisions_v1 CHECK (
    data_version ~ '^[A-Za-z0-9:_-]{1,128}$'
    AND policy_version ~ '^[A-Za-z0-9:_-]{1,128}$'
    AND publication_version ~ '^[A-Za-z0-9:_-]{1,128}$'
  ),
  CONSTRAINT student_portal_publication_job_target_uk_v1
    UNIQUE (account_id, data_version, policy_version, publication_version)
);
CREATE INDEX student_portal_publication_job_queue_idx_v1
  ON student_portal.publication_job(state, next_attempt_at, lease_until);

CREATE TABLE student_portal.academic_revision (
  academic_year smallint PRIMARY KEY,
  academic_generation char(32) NOT NULL,
  academic_counter numeric(20,0) NOT NULL,
  reset_generation char(32) NOT NULL,
  reset_counter numeric(20,0) NOT NULL,
  portal_link_generation char(32) NOT NULL,
  portal_link_counter numeric(20,0) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_revision_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_revision_generations_v1 CHECK (
    academic_generation ~ '^[a-f0-9]{32}$'
    AND reset_generation ~ '^[a-f0-9]{32}$'
    AND portal_link_generation ~ '^[a-f0-9]{32}$'
  ),
  CONSTRAINT student_portal_revision_counters_v1 CHECK (
    academic_counter BETWEEN 1 AND 99999999999999999999::numeric
    AND reset_counter BETWEEN 1 AND 99999999999999999999::numeric
    AND portal_link_counter BETWEEN 1 AND 99999999999999999999::numeric
  )
);

INSERT INTO student_portal.academic_revision
  (academic_year, academic_generation, academic_counter, reset_generation, reset_counter,
   portal_link_generation, portal_link_counter)
VALUES
  (2026,
   replace(gen_random_uuid()::text, '-', ''), 1,
   replace(gen_random_uuid()::text, '-', ''), 1,
   replace(gen_random_uuid()::text, '-', ''), 1);

CREATE TABLE student_portal.revision_event (
  event_id uuid PRIMARY KEY,
  academic_year smallint NOT NULL,
  student_ids integer[] NOT NULL DEFAULT '{}',
  cause text NOT NULL,
  affects_academic boolean NOT NULL,
  affects_reset boolean NOT NULL,
  data_version text NOT NULL,
  reset_version text NOT NULL,
  portal_link_version text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_revision_event_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_revision_event_cause_v1 CHECK (
    cause IN ('relation','marks','council','academic-policy','diagnostics','audit-treatment','bulletin-snapshot','portal-link')
  ),
  CONSTRAINT student_portal_revision_event_versions_v1 CHECK (
    data_version ~ '^[a-f0-9]{32}:[1-9][0-9]{0,19}$'
    AND reset_version ~ '^[a-f0-9]{32}:[1-9][0-9]{0,19}$'
    AND portal_link_version ~ '^[a-f0-9]{32}:[1-9][0-9]{0,19}$'
  )
);
CREATE INDEX student_portal_revision_event_year_idx_v1
  ON student_portal.revision_event(academic_year, occurred_at DESC);

-- Narrow academic read surface. The runtime role receives SELECT on these views,
-- never DML or direct table privileges in gradebook.
CREATE VIEW student_portal.academic_student_v1 WITH (security_barrier = true) AS
SELECT a.id AS student_id, a.ano AS academic_year, a.nome AS name
FROM gradebook.aluno a
WHERE a.ano = 2026;

CREATE VIEW student_portal.academic_binding_v1 WITH (security_barrier = true) AS
SELECT v.ano AS academic_year, v.aluno_id AS student_id, v.turma_id AS class_id,
       t.codigo AS class_code, t.nome AS class_name, v.numero AS class_number,
       v.situacao AS status, v.turma_relacionada_id AS related_class_id
FROM gradebook.vinculo v
JOIN gradebook.turma t ON t.id = v.turma_id AND t.ano = v.ano
WHERE v.ano = 2026;

CREATE VIEW student_portal.academic_offer_v1 WITH (security_barrier = true) AS
SELECT o.id AS offer_id, o.ano AS academic_year, o.turma_id AS class_id,
       o.disciplina_id AS subject_id, d.nome AS subject_label
FROM gradebook.oferta o
JOIN gradebook.disciplina d ON d.id = o.disciplina_id AND d.ano = o.ano
WHERE o.ano = 2026;

CREATE VIEW student_portal.academic_instrument_v1 WITH (security_barrier = true) AS
SELECT i.id AS assessment_id, i.oferta_id AS offer_id, i.trimestre AS term,
       i.slot, i.maximo AS maximum, i.descricao AS label
FROM gradebook.instrumento i
JOIN gradebook.oferta o ON o.id = i.oferta_id
WHERE o.ano = 2026;

CREATE VIEW student_portal.academic_mark_v1 WITH (security_barrier = true) AS
SELECT n.instrumento_id AS assessment_id, n.aluno_id AS student_id, n.valor AS value
FROM gradebook.nota n
JOIN gradebook.instrumento i ON i.id = n.instrumento_id
JOIN gradebook.oferta o ON o.id = i.oferta_id
JOIN gradebook.aluno a ON a.id = n.aluno_id AND a.ano = o.ano
WHERE o.ano = 2026;

CREATE VIEW student_portal.academic_closure_v1 WITH (security_barrier = true) AS
SELECT f.oferta_id AS offer_id, f.aluno_id AS student_id,
       f.am1_fonte, f.am2_fonte, f.am3_fonte,
       f.rec1, f.rec2, f.rec3, f.rec_nc_mask, f.rec_rr_mask, f.u_fonte
FROM gradebook.fechamento f
JOIN gradebook.oferta o ON o.id = f.oferta_id
JOIN gradebook.aluno a ON a.id = f.aluno_id AND a.ano = o.ano
WHERE o.ano = 2026;

CREATE VIEW student_portal.academic_council_decision_v1 WITH (security_barrier = true) AS
SELECT c.aluno_id AS student_id, a.ano AS academic_year, c.decisao AS decision
FROM gradebook.conselho_decisao c
JOIN gradebook.aluno a ON a.id = c.aluno_id
WHERE a.ano = 2026;

CREATE VIEW student_portal.academic_year_policy_v1 WITH (security_barrier = true) AS
SELECT ano AS academic_year, minimo_aprovacao AS minimum_approval,
       max_componentes_conselho AS max_council_components
FROM gradebook.ano_letivo
WHERE ano = 2026;

REVOKE ALL ON ALL TABLES IN SCHEMA student_portal FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  student_portal.setting,
  student_portal.publication,
  student_portal.published_projection,
  student_portal.publication_job,
  student_portal.academic_revision,
  student_portal.revision_event
TO student_portal_app;
GRANT SELECT ON
  student_portal.academic_student_v1,
  student_portal.academic_binding_v1,
  student_portal.academic_offer_v1,
  student_portal.academic_instrument_v1,
  student_portal.academic_mark_v1,
  student_portal.academic_closure_v1,
  student_portal.academic_council_decision_v1,
  student_portal.academic_year_policy_v1
TO student_portal_app;

COMMIT;
