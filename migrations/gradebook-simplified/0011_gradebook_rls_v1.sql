-- #856: defense-in-depth RLS for the private gradebook schema.
-- Existing gradebook_app grants remain the operation boundary; policies do not grant privileges.
BEGIN;

DO $$
DECLARE
  v_tables constant text[] := ARRAY[
    'aluno',
    'ano_letivo',
    'ano_letivo_historico',
    'boletim_snapshot',
    'conselho_anterior_historico',
    'conselho_decisao',
    'conselho_decisao_comando',
    'conselho_decisao_historico',
    'conselho_fechamento',
    'conselho_fechamento_item',
    'conselho_idempotencia',
    'conselho_sessao',
    'conselho_sessao_historico',
    'conselho_votacao',
    'conselho_votacao_historico',
    'disciplina',
    'fechamento',
    'fechamento_historico',
    'importacao',
    'importacao_diagnostico',
    'importacao_diagnostico_tratamento',
    'instrumento',
    'instrumento_historico',
    'nota',
    'nota_historico',
    'oferta',
    'professor',
    'turma',
    'vinculo',
    'vinculo_historico'
  ];
  v_actual text[];
  v_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gradebook_app') THEN
    RAISE EXCEPTION 'gradebook-rls-v1 requires the dedicated gradebook_app role';
  END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname='gradebook_app') THEN
    RAISE EXCEPTION 'gradebook-rls-v1 refuses a gradebook_app role with BYPASSRLS';
  END IF;

  SELECT array_agg(tablename ORDER BY tablename)
  INTO v_actual
  FROM pg_tables
  WHERE schemaname='gradebook';

  IF v_actual IS DISTINCT FROM v_tables THEN
    RAISE EXCEPTION 'gradebook-rls-v1 table set changed: expected %, found %', v_tables, v_actual;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE gradebook.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS gradebook_app_backend_v1 ON gradebook.%I', v_table);
    EXECUTE format(
      'CREATE POLICY gradebook_app_backend_v1 ON gradebook.%I FOR ALL TO gradebook_app USING (true) WITH CHECK (true)',
      v_table
    );
  END LOOP;
END
$$;

REVOKE ALL ON SCHEMA gradebook FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA gradebook FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA gradebook FROM PUBLIC;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated']::text[] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA gradebook FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA gradebook FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA gradebook FROM %I', v_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook REVOKE ALL ON TABLES FROM %I',
        v_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook REVOKE ALL ON SEQUENCES FROM %I',
        v_role
      );
    END IF;
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradebook REVOKE ALL ON SEQUENCES FROM PUBLIC;

COMMIT;
