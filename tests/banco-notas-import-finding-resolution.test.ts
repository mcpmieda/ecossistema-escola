import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrations = [1, 2, 3, 4].map((number) => {
  const names = [
    '0001_banco_notas_foundation.sql',
    '0002_banco_notas_cross_year_integrity.sql',
    '0003_banco_notas_import_job_state_machine.sql',
    '0004_banco_notas_import_finding_resolution.sql',
  ];
  return readFileSync(join(root, 'infra/banco-notas/d1/migrations', names[number - 1]!), 'utf8');
});

function database(): DatabaseSync {
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

function fails(operation: () => void, pattern: RegExp): boolean {
  try {
    operation();
    return false;
  } catch (error) {
    return pattern.test(error instanceof Error ? error.message : String(error));
  }
}

describe('Banco de Notas import finding resolution migration', () => {
  it('keeps the migration free of product seed data', () => {
    expect(migrations[3]).not.toMatch(/INSERT\s+INTO/iu);
  });

  it('records resolution separately while keeping the original finding immutable', () => {
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

    expect(resolution).toMatchObject({
      resolved_by: 'actor',
      reason: 'Correspondência corrigida',
      resolved_at: '2026-08-25T23:00:00.000Z',
    });
    expect(
      fails(
        () => db.exec("UPDATE import_findings SET code = 'changed' WHERE id = 'finding-1'"),
        /import_findings are append-only/iu,
      ),
    ).toBe(true);
    expect(
      fails(
        () => db.exec("DELETE FROM import_finding_resolutions WHERE id = 'resolution-1'"),
        /import_finding_resolutions are append-only/iu,
      ),
    ).toBe(true);
    db.close();
  });

  it('prevents resolving the same finding twice', () => {
    const db = database();
    db.exec(`
      INSERT INTO import_finding_resolutions
        (id, import_finding_id, resolved_by, reason, resolved_at)
      VALUES ('resolution-1', 'finding-1', 'actor', 'Primeira resolução', '2026-08-25T23:00:00Z');
    `);
    expect(
      fails(
        () =>
          db.exec(`
            INSERT INTO import_finding_resolutions
              (id, import_finding_id, resolved_by, reason, resolved_at)
            VALUES ('resolution-2', 'finding-1', 'actor', 'Duplicada', '2026-08-25T23:01:00Z');
          `),
        /UNIQUE constraint failed/iu,
      ),
    ).toBe(true);
    db.close();
  });

  it('rejects a concurrent same-state re-entry', () => {
    const db = database();
    expect(
      fails(
        () => db.exec("UPDATE import_jobs SET state = 'analyzed' WHERE id = 'job-1'"),
        /import job state re-entry is not allowed/iu,
      ),
    ).toBe(true);
    db.close();
  });
});
