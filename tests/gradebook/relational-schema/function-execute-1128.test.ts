// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, expect, it } from 'vitest';

const root = 'migrations/gradebook-simplified/';
const migration = readFileSync(root + '0014_function_execute_hardening_v1.sql', 'utf8');
const signatures = [
  'gradebook.aluno_possui_vinculo_na_oferta(integer,integer)',
  'gradebook.preparar_conselho_anterior()',
  'gradebook.validar_fechamento_vinculo()',
  'gradebook.validar_nota_vinculo()',
];
const functionList = signatures.join(', ');
let pg: PGlite;

async function publicExecute() {
  return (
    await pg.query<{ signature: string; execute: boolean }>(
      `
    SELECT p.oid::regprocedure::text AS signature,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS execute
    FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[]) ORDER BY p.oid::regprocedure::text
  `,
      [signatures],
    )
  ).rows;
}

async function preservedCatalog() {
  return (
    await pg.query(`
    SELECT
      (SELECT jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner) ORDER BY p.oid)
        FROM pg_proc p WHERE p.pronamespace='gradebook'::regnamespace) AS functions,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='gradebook'::regnamespace) AS triggers,
      (SELECT jsonb_agg(jsonb_build_array(c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.oid)
        FROM pg_class c WHERE c.relnamespace='gradebook'::regnamespace) AS relations,
      (SELECT nspacl FROM pg_namespace WHERE nspname='gradebook') AS schema_acl,
      (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d) AS defaults,
      (SELECT jsonb_agg(to_jsonb(n) ORDER BY instrumento_id,aluno_id) FROM gradebook.nota n) AS notes,
      (SELECT jsonb_agg(to_jsonb(f) ORDER BY oferta_id,aluno_id) FROM gradebook.fechamento f) AS closures,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM gradebook.aluno a) AS students
  `)
  ).rows;
}

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync(root + '0001_current_schema.sql', 'utf8'));
  await pg.exec(`
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE student_portal_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE gradebook_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE synthetic_other_consumer NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE synthetic_function_caller NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA gradebook TO synthetic_function_caller;
  `);
  await pg.exec(readFileSync(root + 'application_role_grants.sql', 'utf8'));
  for (const file of [
    '0003_council_session_v3.sql',
    '0004_council_v3_least_privilege.sql',
    '0005_relational_bulletin_snapshot_v2.sql',
    '0006_import_diagnostic_treatment_v1.sql',
    '0007_multiyear_rr_v1.sql',
    '0008_year_reset_acl_v1.sql',
    '0009_granular_observations_names_v1.sql',
    '0010_qualitative_corrections_2026_v1.sql',
    '0011_gradebook_rls_v1.sql',
    '0012_current_state_cleanup_v1.sql',
    '0013_default_privileges_hardening_v1.sql',
  ])
    await pg.exec(readFileSync(root + file, 'utf8'));
  // 0001 already revokes PUBLIC. Reproduce only the four existing-object ACLs
  // observed in production, not a claim that today's bootstrap creates this drift.
  expect((await publicExecute()).every((row) => !row.execute)).toBe(true);
  await pg.exec(`GRANT EXECUTE ON FUNCTION ${functionList} TO PUBLIC`);
  await pg.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2090,60000,2);
    INSERT INTO gradebook.turma (id,ano,codigo,nome,etapa,turno) VALUES
      (1,2090,'S1','TURMA SINTETICA UM',6,'TESTE'),(2,2090,'S2','TURMA SINTETICA DOIS',6,'TESTE');
    INSERT INTO gradebook.professor (id,ano,nome) VALUES (1,2090,'DOCENTE SINTETICO');
    INSERT INTO gradebook.disciplina (id,ano,nome) VALUES (1,2090,'COMPONENTE SINTETICO');
    INSERT INTO gradebook.aluno (id,ano,nome) VALUES (1,2090,'ALUNO SINTETICO UM'),(2,2090,'ALUNO SINTETICO DOIS');
    INSERT INTO gradebook.vinculo (ano,turma_id,numero,aluno_id) VALUES (2090,1,1,1),(2090,2,1,2);
    INSERT INTO gradebook.oferta (id,ano,turma_id,professor_id,disciplina_id) VALUES (1,2090,1,1,1);
    INSERT INTO gradebook.instrumento (id,oferta_id,trimestre,slot,maximo) VALUES (1,1,1,1,10000);
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor) VALUES (1,1,0);
    INSERT INTO gradebook.fechamento (oferta_id,aluno_id,am1_fonte) VALUES (1,1,9000);
  `);
}, 30_000);

afterEach(async () => {
  await pg?.close();
});

it('proves observed PUBLIC true -> false without changing definitions, triggers, schema/table ACLs, defaults or facts', async () => {
  expect((await publicExecute()).map((row) => row.execute)).toEqual([true, true, true, true]);
  const before = await preservedCatalog();
  await pg.exec(migration);
  expect((await publicExecute()).map((row) => row.execute)).toEqual([false, false, false, false]);
  expect(await preservedCatalog()).toEqual(before);
  await pg.exec(migration); // Safe repeat; does not expand privileges.
  expect(await preservedCatalog()).toEqual(before);
});

it('keeps helper and all three trigger paths working as the restricted backend role', async () => {
  await pg.exec(migration);
  await pg.exec('SET ROLE gradebook_app');
  expect(
    (
      await pg.query(`SELECT current_user AS role,rolsuper,rolbypassrls,
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='gradebook'::regnamespace AND p.proowner=r.oid) AS owns_function
    FROM pg_roles r WHERE rolname=current_user`)
    ).rows,
  ).toEqual([
    { role: 'gradebook_app', rolsuper: false, rolbypassrls: false, owns_function: false },
  ]);
  expect(
    (
      await pg.query(`SELECT gradebook.aluno_possui_vinculo_na_oferta(1,1) AS valid,
    gradebook.aluno_possui_vinculo_na_oferta(2,1) AS invalid`)
    ).rows,
  ).toEqual([{ valid: true, invalid: false }]);
  await pg.exec('UPDATE gradebook.nota SET valor=5000 WHERE instrumento_id=1 AND aluno_id=1');
  await pg.exec('UPDATE gradebook.fechamento SET am1_fonte=9500 WHERE oferta_id=1 AND aluno_id=1');
  await pg.exec(
    "UPDATE gradebook.aluno SET conselho_anterior=true,conselho_anterior_por='00000000-0000-4000-8000-000000000001' WHERE id=1",
  );
  expect(
    (
      await pg.query(
        'SELECT conselho_anterior,conselho_anterior_em IS NOT NULL AS stamped FROM gradebook.aluno WHERE id=1',
      )
    ).rows,
  ).toEqual([{ conselho_anterior: true, stamped: true }]);
  await expect(
    pg.exec('INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor) VALUES (1,2,5000)'),
  ).rejects.toThrow(/nao possui vinculo/u);
  await expect(
    pg.exec('INSERT INTO gradebook.fechamento (oferta_id,aluno_id) VALUES (1,2)'),
  ).rejects.toThrow(/nao possui vinculo/u);
  await expect(
    pg.exec('UPDATE gradebook.aluno SET conselho_anterior=true WHERE id=2'),
  ).rejects.toThrow(/conselho_anterior_por/u);
  // Updating key columns still traverses both validation triggers.
  await pg.exec(
    'UPDATE gradebook.nota SET aluno_id=aluno_id WHERE instrumento_id=1 AND aluno_id=1',
  );
  await pg.exec(
    'UPDATE gradebook.fechamento SET aluno_id=aluno_id WHERE oferta_id=1 AND aluno_id=1',
  );
  await pg.exec('RESET ROLE');
});

it.each(['anon', 'authenticated', 'student_portal_app'])(
  'denies effective function EXECUTE to %s and retains the schema boundary',
  async (role) => {
    await pg.exec(migration);
    expect(
      (
        await pg.query<{ execute: boolean; usage: boolean }>(
          `
    SELECT has_function_privilege($1,p.oid,'EXECUTE') AS execute,
      has_schema_privilege($1,'gradebook','USAGE') AS usage
    FROM pg_proc p WHERE p.oid=ANY($2::regprocedure[])`,
          [role, signatures],
        )
      ).rows,
    ).toEqual(Array.from({ length: 4 }, () => ({ execute: false, usage: false })));
    await pg.exec(`SET ROLE ${role}`);
    await expect(
      pg.query('SELECT gradebook.aluno_possui_vinculo_na_oferta(1,1)'),
    ).rejects.toMatchObject({ code: '42501' });
    await pg.exec('RESET ROLE');
  },
);

it('denies direct EXECUTE even to a synthetic role with schema USAGE', async () => {
  await pg.exec(migration);
  await pg.exec('SET ROLE synthetic_function_caller');
  for (const signature of signatures) {
    const call = signature.replace('integer,integer', '1,1');
    await expect(pg.query(`SELECT ${call}`)).rejects.toThrow(/permission denied for function/u);
  }
  await pg.exec('RESET ROLE');
});

it('revokes optional explicit client grants while retaining other confirmed consumer grants and owner access', async () => {
  await pg.exec(
    `GRANT EXECUTE ON FUNCTION ${functionList} TO anon, authenticated, synthetic_other_consumer`,
  );
  await pg.exec(migration);
  for (const role of ['gradebook_app', 'postgres', 'synthetic_other_consumer']) {
    expect(
      (
        await pg.query<{ allowed: boolean }>(
          `
      SELECT bool_and(has_function_privilege($1,p.oid,'EXECUTE')) AS allowed
      FROM pg_proc p WHERE p.oid=ANY($2::regprocedure[])`,
          [role, signatures],
        )
      ).rows,
    ).toEqual([{ allowed: true }]);
  }
  for (const role of ['anon', 'authenticated']) {
    expect(
      (
        await pg.query<{ allowed: boolean }>(
          `
      SELECT bool_or(has_function_privilege($1,p.oid,'EXECUTE')) AS allowed
      FROM pg_proc p WHERE p.oid=ANY($2::regprocedure[])`,
          [role, signatures],
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  }
});

it('handles absent optional API roles and leaves other functions untouched', async () => {
  await pg.exec(`DROP ROLE anon; DROP ROLE authenticated;
    CREATE FUNCTION gradebook.synthetic_outside_scope() RETURNS integer LANGUAGE sql AS 'SELECT 1';
    GRANT EXECUTE ON FUNCTION gradebook.synthetic_outside_scope() TO PUBLIC;`);
  await pg.exec(migration);
  expect(
    (
      await pg.query(`SELECT has_function_privilege('student_portal_app',
    'gradebook.synthetic_outside_scope()','EXECUTE') AS outside_scope`)
    ).rows,
  ).toEqual([{ outside_scope: true }]);
});

it.each([
  [
    'missing signature',
    'ALTER FUNCTION gradebook.validar_nota_vinculo() RENAME TO synthetic_renamed',
    /missing exact signature/u,
  ],
  [
    'different owner',
    'ALTER FUNCTION gradebook.validar_nota_vinculo() OWNER TO synthetic_other_consumer',
    /owner\/kind\/return\/security drift/u,
  ],
  [
    'security definer drift',
    'ALTER FUNCTION gradebook.validar_nota_vinculo() SECURITY DEFINER',
    /owner\/kind\/return\/security drift/u,
  ],
  [
    'missing explicit backend grant',
    'REVOKE EXECUTE ON FUNCTION gradebook.validar_nota_vinculo() FROM gradebook_app',
    /missing explicit gradebook_app/u,
  ],
  [
    'privileged backend role',
    'ALTER ROLE gradebook_app BYPASSRLS',
    /non-superuser\/non-BYPASSRLS/u,
  ],
] as const)('fails before mutation for %s', async (_name, drift, error) => {
  await pg.exec(drift);
  const before = (
    await pg.query(
      "SELECT oid,proacl FROM pg_proc WHERE pronamespace='gradebook'::regnamespace ORDER BY oid",
    )
  ).rows;
  await expect(pg.exec(migration)).rejects.toThrow(error);
  await pg.exec('ROLLBACK');
  expect(
    (
      await pg.query(
        "SELECT oid,proacl FROM pg_proc WHERE pronamespace='gradebook'::regnamespace ORDER BY oid",
      )
    ).rows,
  ).toEqual(before);
});

it.each(['INHERIT', 'NOINHERIT'])(
  'rolls back all ACL changes when %s membership retains client EXECUTE',
  async (inherit) => {
    await pg.exec(`ALTER ROLE authenticated ${inherit}; GRANT gradebook_app TO authenticated`);
    const before = await publicExecute();
    await expect(pg.exec(migration)).rejects.toThrow(/effective\/SET ROLE EXECUTE remains/u);
    await pg.exec('ROLLBACK');
    expect(await publicExecute()).toEqual(before);
    expect((await publicExecute()).every((row) => row.execute)).toBe(true);
  },
);

it('does not silently revoke an unexpected Portal grant to force postflight success', async () => {
  await pg.exec(`GRANT EXECUTE ON FUNCTION ${signatures[0]} TO student_portal_app`);
  await expect(pg.exec(migration)).rejects.toThrow(
    /effective\/SET ROLE EXECUTE remains for student_portal_app/u,
  );
  await pg.exec('ROLLBACK');
  expect((await publicExecute()).every((row) => row.execute)).toBe(true);
});
