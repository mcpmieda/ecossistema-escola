-- #1114: one person identity shared by Gradebook and Portal.
-- Additive upgrade after the existing Gradebook/Portal baseline. Apply once, reviewed.
-- Account IDs, academic IDs, credentials, revisions and SharePoint references are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(613,0);
LOCK TABLE gradebook.aluno, student_portal.account IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE gradebook.student_identity (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
COMMENT ON TABLE gradebook.student_identity IS
  'Durable person identity, independent of annual academic rows and login credentials. Never match by name. Annual reset does not delete this registry.';
ALTER TABLE gradebook.student_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gradebook.student_identity FROM PUBLIC, gradebook_app, student_portal_app;
DO $$
DECLARE runtime_role text;
BEGIN
  FOR runtime_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON gradebook.student_identity FROM %I', runtime_role);
  END LOOP;
END
$$;
GRANT SELECT ON gradebook.student_identity TO gradebook_app;
CREATE POLICY student_identity_backend_read_v1 ON gradebook.student_identity
  FOR SELECT TO gradebook_app USING (true);

ALTER TABLE gradebook.aluno ADD COLUMN student_uid uuid;
ALTER TABLE student_portal.account ADD COLUMN student_uid uuid;

-- Existing account UUIDs become person UUIDs without renumbering any account or photo.
INSERT INTO gradebook.student_identity (id,created_at)
  SELECT id,created_at FROM student_portal.account;
UPDATE student_portal.account SET student_uid=id WHERE student_uid IS NULL;
UPDATE gradebook.aluno s SET student_uid=a.student_uid
  FROM student_portal.account a
  WHERE a.gradebook_student_id=s.id AND a.academic_year=s.ano;
UPDATE gradebook.aluno SET student_uid=gen_random_uuid() WHERE student_uid IS NULL;
INSERT INTO gradebook.student_identity (id)
  SELECT s.student_uid FROM gradebook.aluno s
  WHERE NOT EXISTS (SELECT 1 FROM gradebook.student_identity i WHERE i.id=s.student_uid);

ALTER TABLE gradebook.aluno
  ALTER COLUMN student_uid SET NOT NULL,
  ADD CONSTRAINT aluno_student_uid_fk_v1 FOREIGN KEY (student_uid)
    REFERENCES gradebook.student_identity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT aluno_student_uid_year_uk_v1 UNIQUE (student_uid,ano),
  ADD CONSTRAINT aluno_identity_reference_uk_v1 UNIQUE (id,ano,student_uid);
ALTER TABLE student_portal.account
  ALTER COLUMN student_uid SET NOT NULL,
  ADD CONSTRAINT account_student_uid_fk_v1 FOREIGN KEY (student_uid)
    REFERENCES gradebook.student_identity(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT account_student_uid_year_uk_v1 UNIQUE (academic_year,student_uid),
  ADD CONSTRAINT account_academic_identity_fk_v1
    FOREIGN KEY (gradebook_student_id,academic_year,student_uid)
    REFERENCES gradebook.aluno(id,ano,student_uid)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
COMMENT ON COLUMN gradebook.aluno.student_uid IS
  'Canonical person UUID. id/ano remain academic compatibility references, not cross-module identity.';
COMMENT ON COLUMN student_portal.account.student_uid IS
  'Same person UUID as the linked Gradebook row. Preserved when the annual link closes; account.id remains the credential/account reference.';

-- Check the effective writer BEFORE entering the privileged allocator. session_user
-- would incorrectly treat an owner connection using SET ROLE as a trusted restore.
-- No runtime reenrollment/merge workflow is enabled here. Only the actual table owner
-- may restore a supplied UID into a new row from an authorized snapshot.
CREATE FUNCTION gradebook.guard_student_uid_input_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.student_uid IS NULL THEN RETURN NEW; END IF;
  IF current_user=(SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid=TG_RELID) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM gradebook.aluno s
    WHERE s.id=NEW.id AND s.ano=NEW.ano AND s.student_uid=NEW.student_uid) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'student-identity-reuse-requires-owner-restore' USING ERRCODE='42501';
END
$$;
REVOKE ALL ON FUNCTION gradebook.guard_student_uid_input_v1() FROM PUBLIC, gradebook_app, student_portal_app;
-- PostgreSQL runs same-kind triggers alphabetically: input guard precedes allocator.
CREATE TRIGGER aluno_00_student_uid_input_v1
  BEFORE INSERT ON gradebook.aluno
  FOR EACH ROW EXECUTE FUNCTION gradebook.guard_student_uid_input_v1();

-- Narrow trigger boundary: no caller-controlled SQL/search_path or new public RPC.
-- Backend roles cannot create, mutate or delete registry rows directly.
CREATE FUNCTION gradebook.assign_student_uid_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  existing_uid uuid;
  integrity_error CONSTANT text := '23514';
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.student_uid IS DISTINCT FROM OLD.student_uid THEN
      RAISE EXCEPTION 'student-identity-immutable' USING ERRCODE=integrity_error;
    END IF;
    RETURN NEW;
  END IF;

  -- Sequential UPSERT/replay of the same academic row does not allocate another identity.
  SELECT s.student_uid INTO existing_uid FROM gradebook.aluno s WHERE s.id=NEW.id AND s.ano=NEW.ano;
  IF existing_uid IS NOT NULL THEN
    IF NEW.student_uid IS NOT NULL AND NEW.student_uid<>existing_uid THEN
      RAISE EXCEPTION 'student-identity-mismatch' USING ERRCODE=integrity_error;
    END IF;
    NEW.student_uid:=existing_uid;
  ELSIF NEW.student_uid IS NULL THEN
    NEW.student_uid:=gen_random_uuid();
    INSERT INTO gradebook.student_identity (id) VALUES (NEW.student_uid);
  ELSIF NOT EXISTS (SELECT 1 FROM gradebook.student_identity i WHERE i.id=NEW.student_uid) THEN
    RAISE EXCEPTION 'student-identity-not-found' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION gradebook.assign_student_uid_v1() FROM PUBLIC, gradebook_app, student_portal_app;
CREATE TRIGGER aluno_student_uid_v1
  BEFORE INSERT OR UPDATE OF student_uid ON gradebook.aluno
  FOR EACH ROW EXECUTE FUNCTION gradebook.assign_student_uid_v1();

CREATE FUNCTION student_portal.guard_student_uid_input_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  -- Linked accounts are checked against the exact academic identity by the allocator/FK.
  IF NEW.student_uid IS NULL OR NEW.gradebook_student_id IS NOT NULL THEN RETURN NEW; END IF;
  IF current_user=(SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid=TG_RELID) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM student_portal.account a
    WHERE a.id=NEW.id AND a.academic_year=NEW.academic_year AND a.student_uid=NEW.student_uid) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'student-identity-closed-account-reuse-forbidden' USING ERRCODE='42501';
END
$$;
REVOKE ALL ON FUNCTION student_portal.guard_student_uid_input_v1() FROM PUBLIC, gradebook_app, student_portal_app;
CREATE TRIGGER account_00_student_uid_input_v1
  BEFORE INSERT ON student_portal.account
  FOR EACH ROW EXECUTE FUNCTION student_portal.guard_student_uid_input_v1();

CREATE FUNCTION student_portal.assign_student_uid_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  expected_uid uuid;
  integrity_error CONSTANT text := '23514';
BEGIN
  IF TG_OP='UPDATE' AND NEW.student_uid IS DISTINCT FROM OLD.student_uid THEN
    RAISE EXCEPTION 'student-identity-immutable' USING ERRCODE=integrity_error;
  END IF;
  IF NEW.gradebook_student_id IS NOT NULL THEN
    SELECT s.student_uid INTO expected_uid FROM gradebook.aluno s
      WHERE s.id=NEW.gradebook_student_id AND s.ano=NEW.academic_year;
    IF expected_uid IS NULL THEN
      RAISE EXCEPTION 'student-identity-academic-reference-not-found' USING ERRCODE='23503';
    END IF;
    IF NEW.student_uid IS NOT NULL AND NEW.student_uid<>expected_uid THEN
      RAISE EXCEPTION 'student-identity-mismatch' USING ERRCODE=integrity_error;
    END IF;
    NEW.student_uid:=expected_uid;
  ELSIF TG_OP='INSERT' AND NEW.student_uid IS NULL THEN
    -- A newly created unlinked account cannot claim a known person by choosing its PK.
    -- Existing closed accounts already adopted their own UUID in the backfill above.
    NEW.student_uid:=gen_random_uuid();
    INSERT INTO gradebook.student_identity (id) VALUES (NEW.student_uid);
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION student_portal.assign_student_uid_v1() FROM PUBLIC, gradebook_app, student_portal_app;
CREATE TRIGGER account_student_uid_v1
  BEFORE INSERT OR UPDATE OF student_uid,gradebook_student_id,academic_year ON student_portal.account
  FOR EACH ROW EXECUTE FUNCTION student_portal.assign_student_uid_v1();

-- Explicitly remove inherited direct execution grants in environments with Supabase roles.
DO $$
DECLARE runtime_role text;
BEGIN
  FOR runtime_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION gradebook.assign_student_uid_v1() FROM %I', runtime_role);
    EXECUTE format('REVOKE ALL ON FUNCTION student_portal.assign_student_uid_v1() FROM %I', runtime_role);
    EXECUTE format('REVOKE ALL ON FUNCTION gradebook.guard_student_uid_input_v1() FROM %I', runtime_role);
    EXECUTE format('REVOKE ALL ON FUNCTION student_portal.guard_student_uid_input_v1() FROM %I', runtime_role);
  END LOOP;
END
$$;

-- No FK from identity to an annual row: unlink/reset can retain the person and existing photos.
-- No mutation of account.id, gradebook.aluno.id, account versions, auth state or academic facts.
COMMIT;
