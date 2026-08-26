import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const migrationNames = [
  '0001_banco_notas_foundation.sql',
  '0002_banco_notas_cross_year_integrity.sql',
  '0003_banco_notas_import_job_state_machine.sql',
  '0004_banco_notas_import_finding_resolution.sql',
];
const migrations = migrationNames.map((name) =>
  readFileSync(join(root, 'infra/banco-notas/d1/migrations', name), 'utf8'),
);

function database() {
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) db.exec(migration);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('year-2026', 2026, '2026', '2026-01-01', '2026-12-31');
    INSERT INTO teachers (id, display_name)
    VALUES ('teacher-1', 'Pessoa sintética');
    INSERT INTO data_sources (id, school_year_id, type, name, description, created_by)
    VALUES ('source-1', 'year-2026', 'legacy_import', 'Origem sintética', '', 'actor');
    INSERT INTO import_jobs
      (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash,
       provenance_json, requested_by)
    VALUES
      ('job-1', 'year-2026', 'teacher-1', 'source-1', 'synthetic-idempotency',
       '${'a'.repeat(64)}', '{}', 'actor');
    UPDATE import_jobs SET state = 'analyzed' WHERE id = 'job-1';
    INSERT INTO import_findings
      (id, import_job_id, severity, code, location_json, details_json)
    VALUES ('finding-1', 'job-1', 'error', 'synthetic_blocker', '{}', '{}');
  `);
  return db;
}

function rejects(operation, pattern) {
  try {
    operation();
    return false;
  } catch (error) {
    return pattern.test(error instanceof Error ? error.message : String(error));
  }
}

const evidence = {
  migrationFreeOfSeed: !/INSERT\s+INTO/iu.test(migrations[3]),
  resolutionRecorded: false,
  findingImmutable: false,
  resolutionImmutable: false,
  duplicateResolutionRejected: false,
  stateReentryRejected: false,
};

{
  const db = database();
  db.exec(`
    INSERT INTO import_finding_resolutions
      (id, import_finding_id, resolved_by, reason, resolved_at)
    VALUES
      ('resolution-1', 'finding-1', 'actor', 'Correspondência corrigida',
       '2026-08-25T23:00:00.000Z');
  `);
  const resolution = db
    .prepare(
      `SELECT resolved_by, reason, resolved_at
       FROM import_finding_resolutions WHERE import_finding_id = 'finding-1'`,
    )
    .get();
  evidence.resolutionRecorded =
    resolution?.resolved_by === 'actor' &&
    resolution?.reason === 'Correspondência corrigida' &&
    resolution?.resolved_at === '2026-08-25T23:00:00.000Z';
  evidence.findingImmutable = rejects(
    () => db.exec("UPDATE import_findings SET code = 'changed' WHERE id = 'finding-1'"),
    /import_findings are append-only/iu,
  );
  evidence.resolutionImmutable = rejects(
    () => db.exec("DELETE FROM import_finding_resolutions WHERE id = 'resolution-1'"),
    /import_finding_resolutions are append-only/iu,
  );
  evidence.duplicateResolutionRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO import_finding_resolutions
          (id, import_finding_id, resolved_by, reason, resolved_at)
        VALUES ('resolution-2', 'finding-1', 'actor', 'Duplicada', '2026-08-25T23:01:00Z');
      `),
    /UNIQUE constraint failed/iu,
  );
  evidence.stateReentryRejected = rejects(
    () => db.exec("UPDATE import_jobs SET state = 'analyzed' WHERE id = 'job-1'"),
    /import job state re-entry is not allowed/iu,
  );
  db.close();
}

process.stdout.write(`${JSON.stringify(evidence)}\n`);
