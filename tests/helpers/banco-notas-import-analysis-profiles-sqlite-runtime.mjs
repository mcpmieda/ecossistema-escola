import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const migrations = [
  '0001_banco_notas_foundation.sql',
  '0002_banco_notas_cross_year_integrity.sql',
  '0003_banco_notas_import_job_state_machine.sql',
  '0004_banco_notas_import_finding_resolution.sql',
  '0005_banco_notas_import_analysis.sql',
  '0006_banco_notas_import_analysis_profiles.sql',
].map((name) => readFileSync(join(root, 'infra/banco-notas/d1/migrations', name), 'utf8'));

function database() {
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) db.exec(migration);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES
      ('year-2026', 2026, '2026', '2026-01-01', '2026-12-31'),
      ('year-2027', 2027, '2027', '2027-01-01', '2027-12-31');

    INSERT INTO teachers (id, display_name)
    VALUES ('teacher-2026', 'Pessoa sintética');

    INSERT INTO data_sources
      (id, school_year_id, type, name, description, created_by)
    VALUES
      ('source-2026', 'year-2026', 'legacy_import', 'Fonte sintética 2026', '', 'actor'),
      ('source-2027', 'year-2027', 'legacy_import', 'Fonte sintética 2027', '', 'actor'),
      ('source-linked', 'year-2026', 'linked_teacher_model', 'Fonte vinculada', '', 'actor');
  `);
  return db;
}

function insertJob(db, id, sourceFormat = 'xlsx', sourceId = 'source-2026') {
  db.prepare(
    `INSERT INTO import_jobs
     (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash,
      provenance_json, requested_by)
     VALUES (?, 'year-2026', 'teacher-2026', ?, ?, ?, ?, 'actor')`,
  ).run(
    id,
    sourceId,
    `idem-${id}`,
    'a'.repeat(64),
    JSON.stringify({ sourceFormat }),
  );
}

function insertProfile(db, id, overrides = {}) {
  const row = {
    schoolYearId: 'year-2026',
    sourceId: 'source-2026',
    profileId: `profile-${id}`,
    analysisVersion: 'analysis-1',
    profileHash: `${id}`.padEnd(64, 'a').slice(0, 64),
    profileJson: JSON.stringify({ schemaVersion: 1, synthetic: true }),
    ...overrides,
  };
  db.prepare(
    `INSERT INTO import_analysis_profiles
     (id, school_year_id, data_source_id, source_format, profile_id, analysis_version,
      profile_hash, profile_json, created_by, reason)
     VALUES (?, ?, ?, 'xlsx', ?, ?, ?, ?, 'actor', 'configuração sintética')`,
  ).run(
    id,
    row.schoolYearId,
    row.sourceId,
    row.profileId,
    row.analysisVersion,
    row.profileHash,
    row.profileJson,
  );
}

function rejects(operation, pattern) {
  try {
    operation();
    return false;
  } catch (error) {
    return pattern.test(error instanceof Error ? error.message : String(error));
  }
}

function count(db, table, where = '1 = 1') {
  return Number(db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`).get()?.total);
}

const results = {};

{
  const db = database();
  results.tablesCreated =
    count(db, 'sqlite_master', "type = 'table' AND name = 'import_analysis_profiles'") === 1 &&
    count(db, 'sqlite_master', "type = 'table' AND name = 'import_job_analysis_profiles'") === 1;
  db.close();
}

{
  const db = database();
  insertProfile(db, 'profile-valid');
  results.profileAppendOnly =
    rejects(
      () =>
        db.exec(
          "UPDATE import_analysis_profiles SET reason = 'alterado' WHERE id = 'profile-valid'",
        ),
      /import_analysis_profiles are append-only/iu,
    ) &&
    rejects(
      () => db.exec("DELETE FROM import_analysis_profiles WHERE id = 'profile-valid'"),
      /import_analysis_profiles are append-only/iu,
    );
  db.close();
}

{
  const db = database();
  results.profileCrossYearRejected = rejects(
    () =>
      insertProfile(db, 'profile-cross-year', {
        schoolYearId: 'year-2027',
        sourceId: 'source-2026',
      }),
    /import analysis profile source mismatch/iu,
  );
  results.profileLinkedSourceRejected = rejects(
    () => insertProfile(db, 'profile-linked', { sourceId: 'source-linked' }),
    /import analysis profile source mismatch/iu,
  );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-xlsx');
  insertProfile(db, 'profile-xlsx');
  db.exec(`
    INSERT INTO import_job_analysis_profiles
      (import_job_id, analysis_profile_id, attached_by, reason)
    VALUES ('job-xlsx', 'profile-xlsx', 'actor', 'seleção sintética');
  `);
  results.xlsxAttachmentAllowed =
    count(db, 'import_job_analysis_profiles', "import_job_id = 'job-xlsx'") === 1;
  results.attachmentAppendOnly =
    rejects(
      () =>
        db.exec(
          "UPDATE import_job_analysis_profiles SET reason = 'alterado' WHERE import_job_id = 'job-xlsx'",
        ),
      /import_job_analysis_profiles are append-only/iu,
    ) &&
    rejects(
      () => db.exec("DELETE FROM import_job_analysis_profiles WHERE import_job_id = 'job-xlsx'"),
      /import_job_analysis_profiles are append-only/iu,
    );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-xlsb', 'xlsb');
  insertProfile(db, 'profile-for-xlsb');
  results.xlsbAttachmentRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO import_job_analysis_profiles
          (import_job_id, analysis_profile_id, attached_by, reason)
        VALUES ('job-xlsb', 'profile-for-xlsb', 'actor', 'seleção inválida');
      `),
    /import analysis profile job mismatch/iu,
  );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-source-a');
  insertProfile(db, 'profile-source-b', { sourceId: 'source-2027', schoolYearId: 'year-2027' });
  results.sourceMismatchAttachmentRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO import_job_analysis_profiles
          (import_job_id, analysis_profile_id, attached_by, reason)
        VALUES ('job-source-a', 'profile-source-b', 'actor', 'seleção inválida');
      `),
    /import analysis profile job mismatch/iu,
  );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-terminal');
  insertProfile(db, 'profile-terminal');
  db.exec("UPDATE import_jobs SET state = 'failed' WHERE id = 'job-terminal'");
  results.nonDraftAttachmentRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO import_job_analysis_profiles
          (import_job_id, analysis_profile_id, attached_by, reason)
        VALUES ('job-terminal', 'profile-terminal', 'actor', 'seleção tardia');
      `),
    /import analysis profile job mismatch/iu,
  );
  db.close();
}

process.stdout.write(`${JSON.stringify(results)}\n`);
