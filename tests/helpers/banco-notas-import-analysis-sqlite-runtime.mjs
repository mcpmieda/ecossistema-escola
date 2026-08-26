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
].map((name) =>
  readFileSync(join(root, 'infra/banco-notas/d1/migrations', name), 'utf8'),
);

function database() {
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) db.exec(migration);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('year-2026', 2026, '2026', '2026-01-01', '2026-12-31');

    INSERT INTO teachers (id, display_name)
    VALUES ('teacher-2026', 'Pessoa sintética');

    INSERT INTO data_sources
      (id, school_year_id, type, name, description, created_by)
    VALUES ('source-2026', 'year-2026', 'legacy_import', 'Fonte sintética', '', 'actor');
  `);
  return db;
}

function insertJob(db, id, sourceFormat = 'xlsx') {
  db.prepare(
    `INSERT INTO import_jobs
     (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash,
      provenance_json, requested_by)
     VALUES (?, 'year-2026', 'teacher-2026', 'source-2026', ?, ?, ?, 'actor')`,
  ).run(id, `idem-${id}`, 'a'.repeat(64), JSON.stringify({ sourceFormat }));
}

function insertAnalysis(db, jobId, overrides = {}) {
  const row = {
    id: `analysis-${jobId}`,
    importJobId: jobId,
    analyzerId: 'synthetic-xlsx-analyzer',
    analysisVersion: 'analysis-1',
    sourceHash: 'a'.repeat(64),
    sourceFormat: 'xlsx',
    schoolYear: 2026,
    modelJson: JSON.stringify({ synthetic: true }),
    createdBy: 'actor',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO import_analyses
     (id, import_job_id, analyzer_id, analysis_version, source_hash, source_format,
      school_year, model_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.importJobId,
    row.analyzerId,
    row.analysisVersion,
    row.sourceHash,
    row.sourceFormat,
    row.schoolYear,
    row.modelJson,
    row.createdBy,
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
  results.analysisTableCreated =
    count(db, 'sqlite_master', "type = 'table' AND name = 'import_analyses'") === 1;
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-requires-analysis');
  results.analyzedWithoutArtifactRejected = rejects(
    () =>
      db.exec("UPDATE import_jobs SET state = 'analyzed' WHERE id = 'job-requires-analysis'"),
    /import job analysis artifact required/iu,
  );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-valid');
  insertAnalysis(db, 'job-valid');
  db.exec("UPDATE import_jobs SET state = 'analyzed' WHERE id = 'job-valid'");
  results.validAnalysisTransitionAllowed =
    String(db.prepare("SELECT state FROM import_jobs WHERE id = 'job-valid'").get()?.state) ===
    'analyzed';
  results.analysisAppendOnly =
    rejects(
      () =>
        db.exec(
          "UPDATE import_analyses SET analyzer_id = 'changed' WHERE import_job_id = 'job-valid'",
        ),
      /import_analyses are append-only/iu,
    ) &&
    rejects(
      () => db.exec("DELETE FROM import_analyses WHERE import_job_id = 'job-valid'"),
      /import_analyses are append-only/iu,
    );
  results.duplicateAnalysisRejected = rejects(
    () => insertAnalysis(db, 'job-valid', { id: 'analysis-duplicate' }),
    /UNIQUE constraint failed/iu,
  );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-hash-mismatch');
  results.analysisHashMismatchRejected = rejects(
    () => insertAnalysis(db, 'job-hash-mismatch', { sourceHash: 'b'.repeat(64) }),
    /import analysis provenance mismatch/iu,
  );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-format-mismatch');
  results.analysisFormatMismatchRejected = rejects(
    () => insertAnalysis(db, 'job-format-mismatch', { sourceFormat: 'xlsb' }),
    /import analysis provenance mismatch/iu,
  );
  db.close();
}

{
  const db = database();
  insertJob(db, 'job-rollback');
  let failed = false;
  try {
    db.exec('BEGIN');
    insertAnalysis(db, 'job-rollback');
    db.exec("UPDATE import_jobs SET state = 'generated' WHERE id = 'job-rollback'");
    db.exec('COMMIT');
  } catch {
    failed = true;
    db.exec('ROLLBACK');
  }
  results.analysisTransactionRollback =
    failed && count(db, 'import_analyses', "import_job_id = 'job-rollback'") === 0;
  db.close();
}

process.stdout.write(`${JSON.stringify(results)}\n`);
