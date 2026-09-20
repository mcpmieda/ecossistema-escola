import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

import {
  applyCurrentGradebookSchemaV1,
  assertCurrentGradebookSchemaV1,
  GRADEBOOK_CURRENT_CATALOG_V1,
} from '../../server/gradebook/recovery/current-gradebook-schema-v1.ts';

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

type AclObjectV1 = {
  readonly object: string;
  readonly privileges: readonly string[];
};

function booleanValue(value: unknown, code: string): boolean {
  if (typeof value !== 'boolean') throw new Error(code);
  return value;
}

function aclObject(
  row: Record<string, unknown>,
  privilegeColumns: readonly (readonly [column: string, privilege: string])[],
): AclObjectV1 {
  const object = String(row.object ?? '');
  if (!object) throw new Error('gradebook-ci-postgres-acl-object-invalid');
  return {
    object,
    privileges: privilegeColumns
      .filter(([column]) =>
        booleanValue(row[column], `gradebook-ci-postgres-acl-${column}-invalid`),
      )
      .map(([, privilege]) => privilege),
  };
}

async function readGradebookAclMatrix(): Promise<{
  readonly tables: readonly AclObjectV1[];
  readonly sequences: readonly AclObjectV1[];
  readonly functions: readonly AclObjectV1[];
  readonly portalFunctions: readonly string[];
}> {
  const tableRows = Array.from(
    await sql.unsafe(`
      SELECT table_name AS object,
        has_table_privilege('gradebook_app',format('gradebook.%I',table_name),'SELECT') AS can_select,
        has_table_privilege('gradebook_app',format('gradebook.%I',table_name),'INSERT') AS can_insert,
        has_table_privilege('gradebook_app',format('gradebook.%I',table_name),'UPDATE') AS can_update,
        has_table_privilege('gradebook_app',format('gradebook.%I',table_name),'DELETE') AS can_delete
      FROM information_schema.tables
      WHERE table_schema='gradebook' AND table_type='BASE TABLE'
      ORDER BY table_name
    `),
  ) as Record<string, unknown>[];
  const tables = tableRows.map((row) =>
    aclObject(row, [
      ['can_select', 'SELECT'],
      ['can_insert', 'INSERT'],
      ['can_update', 'UPDATE'],
      ['can_delete', 'DELETE'],
    ]),
  );

  const sequenceRows = Array.from(
    await sql.unsafe(`
      SELECT sequencename AS object,
        has_sequence_privilege('gradebook_app',format('gradebook.%I',sequencename),'USAGE') AS can_usage,
        has_sequence_privilege('gradebook_app',format('gradebook.%I',sequencename),'SELECT') AS can_select,
        has_sequence_privilege('gradebook_app',format('gradebook.%I',sequencename),'UPDATE') AS can_update
      FROM pg_sequences
      WHERE schemaname='gradebook'
      ORDER BY sequencename
    `),
  ) as Record<string, unknown>[];
  const sequences = sequenceRows.map((row) =>
    aclObject(row, [
      ['can_usage', 'USAGE'],
      ['can_select', 'SELECT'],
      ['can_update', 'UPDATE'],
    ]),
  );

  const functionRows = Array.from(
    await sql.unsafe(`
      SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS object,
        has_function_privilege('gradebook_app',p.oid,'EXECUTE') AS can_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='gradebook'
      ORDER BY object
    `),
  ) as Record<string, unknown>[];
  const functions = functionRows.map((row) =>
    aclObject(row, [['can_execute', 'EXECUTE']]),
  );

  const portalFunctionRows = Array.from(
    await sql.unsafe(`
      SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS object
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='student_portal'
        AND has_function_privilege('gradebook_app',p.oid,'EXECUTE')
      ORDER BY object
    `),
  ) as Record<string, unknown>[];
  const portalFunctions = portalFunctionRows.map((row) => {
    const object = String(row.object ?? '');
    if (!object) throw new Error('gradebook-ci-postgres-portal-function-invalid');
    return object;
  });

  const boundary = await firstRow(`
    SELECT
      (SELECT count(*)::integer
       FROM information_schema.tables
       WHERE table_schema='student_portal'
         AND (
           has_table_privilege('gradebook_app',format('student_portal.%I',table_name),'SELECT')
           OR has_table_privilege('gradebook_app',format('student_portal.%I',table_name),'INSERT')
           OR has_table_privilege('gradebook_app',format('student_portal.%I',table_name),'UPDATE')
           OR has_table_privilege('gradebook_app',format('student_portal.%I',table_name),'DELETE')
         )) AS portal_table_privileges,
      (SELECT count(*)::integer
       FROM information_schema.tables
       WHERE table_schema='gradebook'
         AND (
           has_table_privilege('anon',format('gradebook.%I',table_name),'SELECT')
           OR has_table_privilege('anon',format('gradebook.%I',table_name),'INSERT')
           OR has_table_privilege('anon',format('gradebook.%I',table_name),'UPDATE')
           OR has_table_privilege('anon',format('gradebook.%I',table_name),'DELETE')
           OR has_table_privilege('authenticated',format('gradebook.%I',table_name),'SELECT')
           OR has_table_privilege('authenticated',format('gradebook.%I',table_name),'INSERT')
           OR has_table_privilege('authenticated',format('gradebook.%I',table_name),'UPDATE')
           OR has_table_privilege('authenticated',format('gradebook.%I',table_name),'DELETE')
         )) AS client_table_privileges,
      has_schema_privilege('anon','gradebook','USAGE') AS anon_schema_usage,
      has_schema_privilege('authenticated','gradebook','USAGE') AS authenticated_schema_usage
  `);
  if (Number(boundary.portal_table_privileges) !== 0) {
    throw new Error('gradebook-ci-postgres-portal-table-privilege-leak');
  }
  if (
    Number(boundary.client_table_privileges) !== 0 ||
    booleanValue(boundary.anon_schema_usage, 'gradebook-ci-postgres-anon-schema-usage-invalid') ||
    booleanValue(
      boundary.authenticated_schema_usage,
      'gradebook-ci-postgres-authenticated-schema-usage-invalid',
    )
  ) {
    throw new Error('gradebook-ci-postgres-client-privilege-leak');
  }

  return { tables, sequences, functions, portalFunctions };
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
    await applyCurrentGradebookSchemaV1(sql, process.cwd());
    await assertCurrentGradebookSchemaV1(sql);
    await seedSyntheticCurrentState();
    await installPortalCoordination();
    const acl = await readGradebookAclMatrix();
    if (
      acl.tables.length !== GRADEBOOK_CURRENT_CATALOG_V1.tables ||
      acl.sequences.length !== GRADEBOOK_CURRENT_CATALOG_V1.sequences ||
      acl.functions.length !== GRADEBOOK_CURRENT_CATALOG_V1.functions
    ) {
      throw new Error('gradebook-ci-postgres-acl-catalog-mismatch');
    }
    process.stdout.write(JSON.stringify({
      state: 'ready',
      database: 'gradebook_recovery_ci',
      postgres: '17.6',
      tables: GRADEBOOK_CURRENT_CATALOG_V1.tables,
      rlsTables: GRADEBOOK_CURRENT_CATALOG_V1.tables,
      syntheticOnly: true,
      portalCoordinationMigrations: 6,
      acl,
    }) + '\n');
  } finally {
    await sql.end({ timeout: 2 });
  }
}

await run();
