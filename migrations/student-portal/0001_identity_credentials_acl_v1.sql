-- Portal do Aluno P1-02 / #704.
-- Additive PostgreSQL schema for account identity, credentials and sessions.
-- This migration intentionally does not touch academic facts and must not be replayed
-- against an already-created student_portal schema.
BEGIN;

CREATE SCHEMA student_portal;
REVOKE ALL ON SCHEMA student_portal FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'student_portal_app') THEN
    CREATE ROLE student_portal_app
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE student_portal_app
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA student_portal TO student_portal_app;

CREATE TABLE student_portal.account (
  id uuid PRIMARY KEY,
  academic_year smallint NOT NULL DEFAULT 2026,
  gradebook_student_id integer,
  auth_state text NOT NULL,
  eligibility text NOT NULL,
  blocked boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 0,
  security_version bigint NOT NULL DEFAULT 0,
  pin_version bigint NOT NULL DEFAULT 0,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_account_year_v1 CHECK (academic_year = 2026),
  CONSTRAINT student_portal_account_auth_state_v1
    CHECK (auth_state IN ('pending-activation', 'active', 'reset-required')),
  CONSTRAINT student_portal_account_eligibility_v1
    CHECK (eligibility IN ('eligible', 'exit', 'unresolved', 'unlinked')),
  CONSTRAINT student_portal_account_versions_v1
    CHECK (version >= 0 AND security_version >= 0 AND pin_version >= 0),
  CONSTRAINT student_portal_account_link_lifecycle_v1 CHECK (
    (gradebook_student_id IS NOT NULL AND closed_at IS NULL AND eligibility <> 'unlinked')
    OR
    (gradebook_student_id IS NULL AND closed_at IS NOT NULL AND eligibility = 'unlinked')
  ),
  CONSTRAINT student_portal_account_gradebook_fk_v1
    FOREIGN KEY (gradebook_student_id, academic_year)
    REFERENCES gradebook.aluno(id, ano)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX student_portal_account_live_link_uk_v1
  ON student_portal.account(academic_year, gradebook_student_id)
  WHERE gradebook_student_id IS NOT NULL AND closed_at IS NULL;
CREATE INDEX student_portal_account_state_idx_v1
  ON student_portal.account(academic_year, eligibility, blocked, auth_state);

CREATE TABLE student_portal.account_access_data (
  account_id uuid PRIMARY KEY REFERENCES student_portal.account(id) ON DELETE CASCADE,
  birth_year smallint,
  confirmation text,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_birth_year_v1
    CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2026),
  CONSTRAINT student_portal_birth_confirmation_v1 CHECK (
    (birth_year IS NULL AND confirmation IS NULL)
    OR
    (birth_year IS NOT NULL AND confirmation IN ('confirmed', 'unconfirmed-test'))
  ),
  CONSTRAINT student_portal_birth_version_v1 CHECK (version >= 0)
);

CREATE TABLE student_portal.qr_credential (
  credential_id text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES student_portal.account(id) ON DELETE CASCADE,
  key_version integer NOT NULL,
  state text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT student_portal_qr_id_v1
    CHECK (credential_id ~ '^[A-Za-z0-9_-]{32,128}$'),
  CONSTRAINT student_portal_qr_key_version_v1 CHECK (key_version > 0),
  CONSTRAINT student_portal_qr_state_v1 CHECK (
    (state = 'active' AND revoked_at IS NULL)
    OR
    (state = 'revoked' AND revoked_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX student_portal_qr_one_active_uk_v1
  ON student_portal.qr_credential(account_id) WHERE state = 'active';
CREATE INDEX student_portal_qr_account_idx_v1
  ON student_portal.qr_credential(account_id, state, issued_at DESC);

CREATE TABLE student_portal.password_credential (
  account_id uuid PRIMARY KEY REFERENCES student_portal.account(id) ON DELETE CASCADE,
  pin_verifier jsonb,
  password_verifier jsonb,
  pin_version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_password_pin_version_v1 CHECK (pin_version >= 0),
  CONSTRAINT student_portal_pin_verifier_shape_v1 CHECK (
    pin_verifier IS NULL OR (
      jsonb_typeof(pin_verifier) = 'object'
      AND pin_verifier ?& ARRAY['algorithm','parameters','salt','pepperVersion','digest']
    )
  ),
  CONSTRAINT student_portal_password_verifier_shape_v1 CHECK (
    password_verifier IS NULL OR (
      jsonb_typeof(password_verifier) = 'object'
      AND password_verifier ?& ARRAY['algorithm','parameters','salt','pepperVersion','digest']
    )
  )
);

CREATE TABLE student_portal.session (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES student_portal.account(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  security_version bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  persistent boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_session_version_v1 CHECK (security_version >= 0),
  CONSTRAINT student_portal_session_expiry_v1 CHECK (expires_at > created_at)
);
CREATE INDEX student_portal_session_account_idx_v1
  ON student_portal.session(account_id, revoked_at, expires_at);
CREATE INDEX student_portal_session_expiry_idx_v1
  ON student_portal.session(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE student_portal.auth_attempt (
  account_id uuid PRIMARY KEY REFERENCES student_portal.account(id) ON DELETE CASCADE,
  failures integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL,
  blocked_until timestamptz,
  version bigint NOT NULL DEFAULT 0,
  CONSTRAINT student_portal_auth_attempt_failures_v1 CHECK (failures >= 0),
  CONSTRAINT student_portal_auth_attempt_version_v1 CHECK (version >= 0)
);
CREATE INDEX student_portal_auth_attempt_blocked_idx_v1
  ON student_portal.auth_attempt(blocked_until) WHERE blocked_until IS NOT NULL;

CREATE TABLE student_portal.auth_challenge (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES student_portal.account(id) ON DELETE CASCADE,
  security_version bigint NOT NULL,
  pin_version bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_portal_auth_challenge_versions_v1
    CHECK (security_version >= 0 AND pin_version >= 0),
  CONSTRAINT student_portal_auth_challenge_expiry_v1 CHECK (expires_at > created_at),
  CONSTRAINT student_portal_auth_challenge_consumed_v1
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX student_portal_auth_challenge_account_idx_v1
  ON student_portal.auth_challenge(account_id, expires_at, consumed_at);
CREATE INDEX student_portal_auth_challenge_expiry_idx_v1
  ON student_portal.auth_challenge(expires_at) WHERE consumed_at IS NULL;

REVOKE ALL ON ALL TABLES IN SCHEMA student_portal FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  student_portal.account,
  student_portal.account_access_data,
  student_portal.qr_credential,
  student_portal.password_credential,
  student_portal.session,
  student_portal.auth_attempt,
  student_portal.auth_challenge
TO student_portal_app;

COMMIT;
