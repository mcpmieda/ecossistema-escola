-- #1128 / #1249 — CANDIDATO NAO APLICADO.
-- Changes only EXECUTE ACLs of the four existing functions below.
-- No data, function bodies, schema grants, default privileges or role memberships.
-- Production application requires its own authorization and the documented preflight.
-- Expected owner/consumer verified read-only on 2026-10-05: postgres/gradebook_app.
-- Run as the expected owner; do not weaken the checks to accommodate catalog drift.
BEGIN;

DO $hardening$
DECLARE
  v_signatures constant text[] := ARRAY[
    'gradebook.aluno_possui_vinculo_na_oferta(integer,integer)',
    'gradebook.preparar_conselho_anterior()',
    'gradebook.validar_fechamento_vinculo()',
    'gradebook.validar_nota_vinculo()'
  ];
  v_oids oid[] := ARRAY[]::oid[];
  v_signature text;
  v_oid oid;
  v_app oid;
  v_owner oid;
  v_role record;
  v_preserved_before text[];
  v_preserved_after text[];
BEGIN
  -- SET-role privilege inspection requires PostgreSQL 16+ (production: 17.6).
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'function-execute-v1 requires PostgreSQL 16 or newer';
  END IF;
  -- Validate the entire set before the first ACL mutation.
  SELECT n.nspowner INTO v_owner FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
  WHERE n.nspname = 'gradebook' AND r.rolname = current_user
    AND r.rolname NOT IN ('gradebook_app', 'student_portal_app', 'anon', 'authenticated');
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'function-execute-v1 requires the confirmed gradebook schema owner';
  END IF;

  SELECT oid INTO v_app FROM pg_roles
  WHERE rolname = 'gradebook_app' AND NOT rolsuper AND NOT rolbypassrls;
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'function-execute-v1 requires a non-superuser/non-BYPASSRLS gradebook_app';
  END IF;
  IF NOT has_schema_privilege(v_app, 'gradebook', 'USAGE') THEN
    RAISE EXCEPTION 'function-execute-v1 requires existing gradebook_app schema USAGE';
  END IF;

  FOREACH v_signature IN ARRAY v_signatures LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'function-execute-v1 missing exact signature: %', v_signature;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = v_oid AND p.proowner = v_owner
        AND p.prokind = 'f' AND NOT p.prosecdef
        AND p.prorettype = CASE WHEN v_signature = v_signatures[1]
          THEN 'boolean'::regtype ELSE 'trigger'::regtype END
    ) THEN
      RAISE EXCEPTION 'function-execute-v1 owner/kind/return/security drift: %', v_signature;
    END IF;
    -- PUBLIC or inherited access must not masquerade as the backend's own grant.
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p,
        LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = v_oid AND a.grantee = v_app AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'function-execute-v1 missing explicit gradebook_app EXECUTE: %', v_signature;
    END IF;
    v_oids := array_append(v_oids, v_oid);
  END LOOP;

  -- Preserve all explicit consumers other than the two revocation targets.
  -- Unknown legitimate ACLs are not silently removed or expanded.
  SELECT array_agg(format('%s:%s:%s:%s:%s', p.oid, a.grantor, a.grantee,
    a.privilege_type, a.is_grantable) ORDER BY p.oid, a.grantor, a.grantee,
    a.privilege_type, a.is_grantable)
  INTO v_preserved_before
  FROM pg_proc p,
    LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE p.oid = ANY(v_oids) AND a.grantee <> 0
    AND NOT EXISTS (SELECT 1 FROM pg_roles r
      WHERE r.oid = a.grantee AND r.rolname IN ('anon', 'authenticated'));

  FOREACH v_signature IN ARRAY v_signatures LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC RESTRICT', v_signature);
    FOR v_role IN SELECT rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated') LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I RESTRICT', v_signature, v_role.rolname);
    END LOOP;
  END LOOP;

  -- Postflight is in the same transaction: any failure rolls back every REVOKE.
  FOREACH v_oid IN ARRAY v_oids LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p,
        LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = v_oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'function-execute-v1 PUBLIC EXECUTE remains on %', v_oid::regprocedure;
    END IF;
    IF NOT has_function_privilege(v_app, v_oid, 'EXECUTE')
      OR NOT has_function_privilege(v_owner, v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'function-execute-v1 lost confirmed consumer/owner EXECUTE on %', v_oid::regprocedure;
    END IF;
    FOR v_role IN SELECT oid, rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'student_portal_app') LOOP
      -- Effective INHERIT privileges and NOINHERIT membership with SET ROLE
      -- both matter. Do not revoke memberships or other consumers to force a pass.
      IF has_function_privilege(v_role.oid, v_oid, 'EXECUTE') OR EXISTS (
        SELECT 1 FROM pg_roles reachable
        WHERE pg_has_role(v_role.oid, reachable.oid, 'SET')
          AND has_function_privilege(reachable.oid, v_oid, 'EXECUTE')
      ) THEN
        RAISE EXCEPTION 'function-execute-v1 effective/SET ROLE EXECUTE remains for % on %',
          v_role.rolname, v_oid::regprocedure;
      END IF;
    END LOOP;
  END LOOP;

  SELECT array_agg(format('%s:%s:%s:%s:%s', p.oid, a.grantor, a.grantee,
    a.privilege_type, a.is_grantable) ORDER BY p.oid, a.grantor, a.grantee,
    a.privilege_type, a.is_grantable)
  INTO v_preserved_after
  FROM pg_proc p,
    LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE p.oid = ANY(v_oids) AND a.grantee <> 0
    AND NOT EXISTS (SELECT 1 FROM pg_roles r
      WHERE r.oid = a.grantee AND r.rolname IN ('anon', 'authenticated'));
  IF v_preserved_after IS DISTINCT FROM v_preserved_before THEN
    RAISE EXCEPTION 'function-execute-v1 changed a preserved explicit consumer ACL';
  END IF;
END
$hardening$;

COMMIT;
