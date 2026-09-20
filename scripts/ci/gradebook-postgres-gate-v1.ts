import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const connectionString = process.env.GRADEBOOK_RECOVERY_DATABASE_URL ?? '';

function validatedTarget(): URL {
  let target: URL;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error('gradebook-ci-postgres-url-invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('gradebook-ci-postgres-protocol-invalid');
  }
  const host = target.hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    throw new Error('gradebook-ci-postgres-not-loopback');
  }
  if (decodeURIComponent(target.pathname) !== '/gradebook_recovery_ci') {
    throw new Error('gradebook-ci-postgres-database-invalid');
  }
  if (target.search || target.hash) {
    throw new Error('gradebook-ci-postgres-url-components-invalid');
  }
  return target;
}

const expectedTables = [
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
  'vinculo_historico',
] as const;

const schemaPlan = [
  '0001_current_schema.sql',
  'application_role_grants.sql',
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
  'current_cross_schema_indexes_v1.sql',
] as const;

const sql = postgres(validatedTarget().toString(), {
  max: 1,
  prepare: true,
  ssl: false,
  onnotice: () => undefined,
});

async function firstRow(query: string): Promise<Record<string, unknown>> {
  const rows = await sql.unsafe(query);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error('gradebook-ci-postgres-result-missing');
  return row;
}

async function provisionRoles(): Promise<void> {
  await sql.unsafe("DO $$ BEGIN\n" +
    "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gradebook_app') THEN " +
    "CREATE ROLE gradebook_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;\n" +
    "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN " +
    "CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;\n" +
    "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN " +
    "CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;\n" +
    "END $$");
}

async function replaySchema(): Promise<void> {
  const existing = await firstRow(
    "SELECT count(*)::integer AS count FROM information_schema.schemata WHERE schema_name='gradebook'",
  );
  if (Number(existing.count) !== 0) throw new Error('gradebook-ci-postgres-target-not-empty');
  await provisionRoles();
  for (const file of schemaPlan) {
    const source = await readFile('migrations/gradebook-simplified/' + file, 'utf8');
    await sql.unsafe(source);
  }
}

async function validateCatalog(): Promise<void> {
  const catalog = await firstRow(
    "SELECT " +
      "(SELECT count(*)::integer FROM information_schema.tables WHERE table_schema='gradebook' AND table_type='BASE TABLE') AS tables," +
      "(SELECT count(*)::integer FROM information_schema.columns WHERE table_schema='gradebook') AS columns," +
      "(SELECT count(*)::integer FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='gradebook' AND c.contype<>'n') AS constraints," +
      "(SELECT count(*)::integer FROM pg_indexes WHERE schemaname='gradebook') AS indexes," +
      "(SELECT count(*)::integer FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='gradebook' AND c.contype='f') AS foreign_keys," +
      "(SELECT count(*)::integer FROM pg_sequences WHERE schemaname='gradebook') AS sequences," +
      "(SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='gradebook') AS functions," +
      "(SELECT count(*)::integer FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='gradebook' AND NOT t.tgisinternal) AS triggers",
  );
  const expected: Record<string, number> = {
    tables: 30,
    columns: 251,
    constraints: 223,
    indexes: 70,
    foreign_keys: 52,
    sequences: 13,
    functions: 4,
    triggers: 3,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (Number(catalog[key]) !== value) throw new Error('gradebook-ci-postgres-catalog-' + key + '-mismatch: expected=' + String(value) + ', actual=' + String(catalog[key]));
  }

  const tableRows = await sql.unsafe("SELECT tablename FROM pg_tables WHERE schemaname='gradebook' ORDER BY tablename");
  const actualTables = tableRows.map((row) => String(row.tablename));
  if (JSON.stringify(actualTables) !== JSON.stringify([...expectedTables].sort((left, right) => left.localeCompare(right, 'en')))) {
    throw new Error('gradebook-ci-postgres-table-set-mismatch');
  }

  const rls = await firstRow(
    "SELECT " +
      "(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='gradebook' AND c.relkind='r' AND c.relrowsecurity) AS enabled," +
      "(SELECT count(*)::integer FROM pg_policies WHERE schemaname='gradebook' AND policyname='gradebook_app_backend_v1') AS policies",
  );
  if (Number(rls.enabled) !== 30 || Number(rls.policies) !== 30) {
    throw new Error('gradebook-ci-postgres-rls-mismatch');
  }

  const role = await firstRow(
    "SELECT rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='gradebook_app'",
  );
  if (role.rolsuper === true || role.rolbypassrls === true || role.rolinherit === true) {
    throw new Error('gradebook-ci-postgres-role-unsafe');
  }

  const clientAcl = await firstRow(
    "SELECT " +
      "has_schema_privilege('anon','gradebook','USAGE') AS anon_schema," +
      "has_schema_privilege('authenticated','gradebook','USAGE') AS authenticated_schema," +
      "(SELECT count(*)::integer FROM information_schema.table_privileges WHERE table_schema='gradebook' AND grantee='PUBLIC') AS public_tables",
  );
  if (clientAcl.anon_schema === true || clientAcl.authenticated_schema === true || Number(clientAcl.public_tables) !== 0) {
    throw new Error('gradebook-ci-postgres-client-acl-mismatch');
  }
}

async function seedSyntheticCurrentState(): Promise<void> {
  await sql.unsafe(
    "INSERT INTO gradebook.ano_letivo (ano,minimo_aprovacao,max_componentes_conselho) VALUES (2026,60000,2);" +
    "INSERT INTO gradebook.turma (id,ano,codigo,nome,etapa,turno) VALUES (10,2026,'CI6A','6º ANO CI',6,'M');" +
    "INSERT INTO gradebook.professor (id,ano,nome) VALUES (1,2026,'DOCENTE SINTÉTICO CI');" +
    "INSERT INTO gradebook.disciplina (id,ano,nome) VALUES (1,2026,'PORTUGUÊS'),(2,2026,'MATEMÁTICA');" +
    "INSERT INTO gradebook.oferta (id,ano,turma_id,professor_id,disciplina_id) VALUES (10,2026,10,1,1),(20,2026,10,1,2);" +
    "INSERT INTO gradebook.aluno (id,ano,nome) VALUES (1,2026,'ALUNO SINTÉTICO CI A'),(2,2026,'ALUNO SINTÉTICO CI B');" +
    "INSERT INTO gradebook.vinculo (ano,turma_id,numero,aluno_id,situacao) VALUES (2026,10,1,1,NULL),(2026,10,2,2,NULL);" +
    "INSERT INTO gradebook.instrumento (id,oferta_id,trimestre,slot,maximo,descricao) " +
      "SELECT oferta_id*1000+trimestre*100+slot,oferta_id,trimestre,slot," +
      "CASE WHEN slot=11 THEN CASE WHEN trimestre=3 THEN 22000 ELSE 16500 END ELSE CASE WHEN trimestre=3 THEN 9000 ELSE 6750 END END," +
      "CASE slot WHEN 1 THEN 'AV1' WHEN 2 THEN 'AV2' ELSE 'ATIVIDADE' END " +
      "FROM (VALUES (10),(20)) oferta(oferta_id) CROSS JOIN generate_series(1,3) trimestre CROSS JOIN (VALUES (1),(2),(11)) instrumento(slot);" +
    "INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor) " +
      "SELECT id,aluno_id,CASE WHEN aluno_id=1 THEN maximo ELSE maximo/2 END FROM gradebook.instrumento CROSS JOIN (VALUES (1),(2)) aluno(aluno_id);" +
    "INSERT INTO gradebook.fechamento (oferta_id,aluno_id,am1_fonte,am2_fonte,am3_fonte,rec_nc_mask,rec_rr_mask,u_fonte) VALUES " +
      "(10,1,30000,30000,40000,0,0,100000),(20,1,30000,30000,40000,0,0,100000)," +
      "(10,2,15000,15000,20000,0,0,50000),(20,2,15000,15000,20000,0,0,50000);",
  );
}

async function installPortalCoordination(): Promise<void> {
  const migrations = [
    '0001_identity_credentials_acl_v1.sql',
    '0002_policy_publication_revision_v1.sql',
    '0003_audit_receipts_closure_integration_v1.sql',
    '0004_gradebook_integration_usage_v1.sql',
    '0005_year_reset_protocol_v1.sql',
    '0006_gradebook_revision_year_range_v1.sql',
  ] as const;

  for (const file of migrations) {
    const source = await readFile('migrations/student-portal/' + file, 'utf8');
    await sql.unsafe(source);
  }

  const revision = await firstRow(
    "SELECT academic_year::integer AS academic_year, academic_counter::integer AS academic_counter, reset_counter::integer AS reset_counter FROM student_portal.academic_revision WHERE academic_year=2026",
  );
  if (
    Number(revision.academic_year) !== 2026 ||
    Number(revision.academic_counter) !== 1 ||
    Number(revision.reset_counter) !== 1
  ) {
    throw new Error('gradebook-ci-postgres-portal-coordination-mismatch');
  }
}

async function run(): Promise<void> {
  try {
    await replaySchema();
    await validateCatalog();
    await seedSyntheticCurrentState();
    await installPortalCoordination();
    process.stdout.write(JSON.stringify({
      state: 'ready',
      database: 'gradebook_recovery_ci',
      postgres: '17.6',
      tables: 30,
      rlsTables: 30,
      syntheticOnly: true,
      portalCoordinationMigrations: 6,
    }) + '\n');
  } finally {
    await sql.end({ timeout: 2 });
  }
}

await run();
