-- Portal do Aluno P1-02 / #704.
-- Audit, idempotency receipts, explicit link closure and the narrow Gradebook revision hook.
BEGIN;

CREATE TABLE student_portal.audit_event (
  event_id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  actor_id uuid NOT NULL,
  account_id uuid REFERENCES student_portal.account(id) ON DELETE SET NULL,
  scope_json jsonb NOT NULL,
  kind text NOT NULL,
  result text NOT NULL,
  request_id uuid NOT NULL,
  version bigint NOT NULL,
  masked_ip text,
  raw_ip inet,
  ip_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_audit_scope_v1 CHECK (jsonb_typeof(scope_json) = 'object'),
  CONSTRAINT student_portal_audit_kind_v1 CHECK (
    kind IN ('login','login-failed','activated','password-reset','account-reset','qr-issued','qr-reprinted',
             'qr-regenerated','blocked','unblocked','session-revoked','birth-changed','settings-changed',
             'published','unpublished','projection-updated','links-closed')
  ),
  CONSTRAINT student_portal_audit_result_v1 CHECK (result IN ('success','denied','failed')),
  CONSTRAINT student_portal_audit_version_v1 CHECK (version >= 0),
  CONSTRAINT student_portal_audit_ip_retention_v1 CHECK (
    (raw_ip IS NULL AND ip_expires_at IS NULL)
    OR (raw_ip IS NOT NULL AND ip_expires_at IS NOT NULL AND ip_expires_at >= occurred_at)
  )
);
CREATE INDEX student_portal_audit_time_idx_v1
  ON student_portal.audit_event(occurred_at DESC, event_id);
CREATE INDEX student_portal_audit_account_idx_v1
  ON student_portal.audit_event(account_id, occurred_at DESC) WHERE account_id IS NOT NULL;
CREATE INDEX student_portal_audit_kind_idx_v1
  ON student_portal.audit_event(kind, result, occurred_at DESC);
CREATE INDEX student_portal_audit_ip_expiry_idx_v1
  ON student_portal.audit_event(ip_expires_at) WHERE raw_ip IS NOT NULL;

CREATE TABLE student_portal.operation_receipt (
  idempotency_key text NOT NULL,
  actor_id text NOT NULL,
  request_digest text NOT NULL,
  operation_id uuid NOT NULL,
  version bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idempotency_key, actor_id),
  CONSTRAINT student_portal_receipt_key_v1
    CHECK (idempotency_key ~ '^[0-9a-fA-F-]{36}$'),
  CONSTRAINT student_portal_receipt_digest_v1
    CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT student_portal_receipt_version_v1 CHECK (version >= 0),
  CONSTRAINT student_portal_receipt_expiry_v1 CHECK (expires_at > created_at)
);
CREATE INDEX student_portal_receipt_expiry_idx_v1
  ON student_portal.operation_receipt(expires_at);

CREATE TABLE student_portal.link_closure (
  account_id uuid PRIMARY KEY REFERENCES student_portal.account(id) ON DELETE RESTRICT,
  academic_year smallint NOT NULL,
  gradebook_student_id integer NOT NULL,
  closed_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT 'explicit-close',
  version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_link_closure_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_link_closure_student_v1 CHECK (gradebook_student_id > 0),
  CONSTRAINT student_portal_link_closure_reason_v1 CHECK (reason = 'explicit-close'),
  CONSTRAINT student_portal_link_closure_version_v1 CHECK (version >= 0),
  CONSTRAINT student_portal_link_closure_identity_uk_v1 UNIQUE (academic_year, gradebook_student_id)
);
CREATE INDEX student_portal_link_closure_time_idx_v1
  ON student_portal.link_closure(closed_at DESC);

CREATE TABLE student_portal.year_reset_preview_proof (
  token_digest text PRIMARY KEY,
  actor_digest text NOT NULL,
  academic_year smallint NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  academic_revision text NOT NULL,
  reset_revision text NOT NULL,
  portal_link_revision text NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_reset_proof_digest_v1 CHECK (
    token_digest ~ '^[a-f0-9]{64}$' AND actor_digest ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT student_portal_reset_proof_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_reset_proof_window_v1 CHECK (
    expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes'
  ),
  CONSTRAINT student_portal_reset_proof_versions_v1 CHECK (
    academic_revision ~ '^[a-f0-9]{32}:[1-9][0-9]{0,19}$'
    AND reset_revision ~ '^[a-f0-9]{32}:[1-9][0-9]{0,19}$'
    AND portal_link_revision ~ '^[a-f0-9]{32}:[1-9][0-9]{0,19}$'
  ),
  CONSTRAINT student_portal_reset_proof_consumed_v1 CHECK (
    consumed_at IS NULL OR consumed_at >= issued_at
  )
);
CREATE INDEX student_portal_reset_proof_expiry_idx_v1
  ON student_portal.year_reset_preview_proof(expires_at) WHERE consumed_at IS NULL;

-- Gradebook writers call only this function after acquiring the #703 common locks.
-- The function is idempotent by event_id and cannot write academic facts or credentials.
CREATE FUNCTION student_portal.record_gradebook_change_v1(
  p_event_id uuid,
  p_academic_year smallint,
  p_cause text,
  p_affects_academic boolean,
  p_student_ids integer[],
  p_occurred_at timestamptz
)
RETURNS TABLE(data_version text, reset_version text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, student_portal
AS $$
DECLARE
  v_row student_portal.academic_revision%ROWTYPE;
  v_existing student_portal.revision_event%ROWTYPE;
BEGIN
  IF p_academic_year <> 2026 THEN
    RAISE EXCEPTION 'student-portal-year-not-supported' USING ERRCODE = '22023';
  END IF;
  IF p_cause NOT IN ('relation','marks','council','academic-policy','diagnostics','audit-treatment','bulletin-snapshot') THEN
    RAISE EXCEPTION 'student-portal-revision-cause-invalid' USING ERRCODE = '22023';
  END IF;
  IF p_student_ids IS NULL OR EXISTS (SELECT 1 FROM unnest(p_student_ids) AS id WHERE id IS NULL OR id <= 0) THEN
    RAISE EXCEPTION 'student-portal-student-ids-invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM student_portal.revision_event
  WHERE event_id = p_event_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.data_version, v_existing.reset_version;
    RETURN;
  END IF;

  UPDATE student_portal.academic_revision
  SET academic_counter = academic_counter + CASE WHEN p_affects_academic THEN 1 ELSE 0 END,
      reset_counter = reset_counter + 1,
      updated_at = p_occurred_at
  WHERE academic_year = p_academic_year
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student-portal-revision-state-missing' USING ERRCODE = '55000';
  END IF;

  INSERT INTO student_portal.revision_event
    (event_id, academic_year, student_ids, cause, affects_academic, affects_reset,
     data_version, reset_version, portal_link_version, occurred_at)
  VALUES
    (p_event_id, p_academic_year, p_student_ids, p_cause, p_affects_academic, true,
     v_row.academic_generation || ':' || v_row.academic_counter::text,
     v_row.reset_generation || ':' || v_row.reset_counter::text,
     v_row.portal_link_generation || ':' || v_row.portal_link_counter::text,
     p_occurred_at);

  RETURN QUERY SELECT
    v_row.academic_generation || ':' || v_row.academic_counter::text,
    v_row.reset_generation || ':' || v_row.reset_counter::text;
END
$$;

REVOKE ALL ON FUNCTION student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_portal.record_gradebook_change_v1(uuid,smallint,text,boolean,integer[],timestamptz) TO gradebook_app;

REVOKE ALL ON ALL TABLES IN SCHEMA student_portal FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  student_portal.audit_event,
  student_portal.operation_receipt,
  student_portal.year_reset_preview_proof
TO student_portal_app;
GRANT SELECT, INSERT ON student_portal.link_closure TO student_portal_app;

COMMIT;
