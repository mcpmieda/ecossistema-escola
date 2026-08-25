import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migration1 = readFileSync(
  join(process.cwd(), 'infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql'),
  'utf8',
);
const migration2 = readFileSync(
  join(process.cwd(), 'infra/banco-notas/d1/migrations/0002_banco_notas_cross_year_integrity.sql'),
  'utf8',
);
const expected = [
  'school_years',
  'teachers',
  'class_groups',
  'components',
  'students',
  'teacher_assignments',
  'data_sources',
  'source_assignments',
  'relationship_snapshots',
  'import_jobs',
  'import_findings',
  'teacher_models',
  'teacher_model_versions',
  'cell_mappings',
  'rulesets',
  'ruleset_versions',
  'grade_events',
  'grade_snapshots',
  'share_audit',
  'reconciliation_runs',
  'audit_events',
];

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(migration1);
  db.exec(migration2);
  return db;
}

function seedYearsAndSources(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES
      ('year-2026', 2026, '2026', '2026-01-01', '2026-12-31'),
      ('year-2027', 2027, '2027', '2027-01-01', '2027-12-31');

    INSERT INTO data_sources
      (id, school_year_id, type, name, description, created_by)
    VALUES
      ('source-a', 'year-2026', 'legacy_import', 'Legado A', '', 'actor'),
      ('source-b', 'year-2026', 'linked_teacher_model', 'Modelo B', '', 'actor'),
      ('source-2027', 'year-2027', 'legacy_import', 'Legado 2027', '', 'actor');
  `);
}

describe('Banco de Notas D1 migrations', () => {
  it('executes the complete Phase 1 schema without seed data', () => {
    const db = database();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name));

    for (const table of expected) expect(tables).toContain(table);
    expect(migration1).not.toMatch(/INSERT\s+INTO/iu);
    expect(migration2).not.toMatch(/INSERT\s+INTO/iu);
    db.close();
  });

  it('applies safe sync defaults and rejects cross-year source assignments', () => {
    const db = database();
    seedYearsAndSources(db);

    db.exec(`
      INSERT INTO source_assignments
        (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
      VALUES
        ('assignment-a', 'year-2026', 'source-a', 'school_year_default', 'authoritative', '2026-01-01', 'actor', 'configuração inicial');
    `);

    expect(
      db.prepare("SELECT sync_enabled FROM source_assignments WHERE id = 'assignment-a'").get(),
    ).toMatchObject({ sync_enabled: 0 });

    expect(() =>
      db.exec(`
        INSERT INTO source_assignments
          (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
        VALUES
          ('cross-year', 'year-2027', 'source-a', 'school_year_default', 'authoritative', '2027-01-01', 'actor', 'inválida');
      `),
    ).toThrow(/source assignment year mismatch/iu);

    db.close();
  });

  it('rejects overlapping authoritative periods while allowing explicit non-authoritative reference', () => {
    const db = database();
    seedYearsAndSources(db);

    db.exec(`
      INSERT INTO source_assignments
        (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
      VALUES
        ('assignment-a', 'year-2026', 'source-a', 'school_year_default', 'authoritative', '2026-01-01', 'actor', 'principal');
    `);

    expect(() =>
      db.exec(`
        INSERT INTO source_assignments
          (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
        VALUES
          ('assignment-b', 'year-2026', 'source-b', 'school_year_default', 'authoritative', '2026-06-01', 'actor', 'sobreposição');
      `),
    ).toThrow(/authoritative source assignment overlap/iu);

    expect(() =>
      db.exec(`
        INSERT INTO source_assignments
          (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
        VALUES
          ('reference-b', 'year-2026', 'source-b', 'school_year_default', 'reference_only', '2026-06-01', 'actor', 'referência explícita');
      `),
    ).not.toThrow();

    db.close();
  });

  it('enforces year consistency for teacher assignments and import jobs', () => {
    const db = database();
    seedYearsAndSources(db);
    db.exec(`
      INSERT INTO teachers (id, display_name) VALUES ('teacher-a', 'Professor sintético');
      INSERT INTO class_groups (id, school_year_id, name) VALUES ('class-2026', 'year-2026', 'Turma sintética');
      INSERT INTO components (id, school_year_id, name) VALUES ('component-2027', 'year-2027', 'Componente sintético');
    `);

    expect(() =>
      db.exec(`
        INSERT INTO teacher_assignments
          (id, school_year_id, teacher_id, class_group_id, component_id, effective_from)
        VALUES
          ('teacher-assignment-bad', 'year-2026', 'teacher-a', 'class-2026', 'component-2027', '2026-01-01');
      `),
    ).toThrow(/teacher assignment component year mismatch/iu);

    expect(() =>
      db.exec(`
        INSERT INTO import_jobs
          (id, school_year_id, data_source_id, idempotency_key, source_hash, provenance_json, requested_by)
        VALUES
          ('import-bad', 'year-2027', 'source-a', 'idem-import', 'hash-import', '{}', 'actor');
      `),
    ).toThrow(/import job source year mismatch/iu);

    db.close();
  });

  it('enforces idempotency, absence semantics and append-only event history', () => {
    const db = database();
    seedYearsAndSources(db);

    db.exec(`
      INSERT INTO grade_events
        (id, idempotency_key, correlation_id, event_type, status, grade_key, source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
      VALUES
        ('event-1', 'idem-1', 'corr-1', 'grade.changed', 'accepted', 'grade-a', 'source-a', 1, 0, 0, '{}', '2026-08-25T12:00:00Z');
    `);

    expect(() =>
      db.exec(`
        INSERT INTO grade_events
          (id, idempotency_key, correlation_id, event_type, status, grade_key, source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
        VALUES
          ('event-2', 'idem-1', 'corr-2', 'grade.changed', 'accepted', 'grade-a', 'source-a', 2, 1, 0, '{}', '2026-08-25T12:01:00Z');
      `),
    ).toThrow(/UNIQUE constraint failed/iu);

    expect(() =>
      db.exec(`
        INSERT INTO grade_events
          (id, idempotency_key, correlation_id, event_type, status, grade_key, source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
        VALUES
          ('event-invalid-absence', 'idem-absence', 'corr-3', 'grade.changed', 'accepted', 'grade-b', 'source-a', 1, 0, 1, '{}', '2026-08-25T12:02:00Z');
      `),
    ).toThrow(/CHECK constraint failed/iu);

    expect(() =>
      db.exec("UPDATE grade_events SET status = 'rejected' WHERE id = 'event-1';"),
    ).toThrow(/grade_events are append-only/iu);

    db.exec(`
      INSERT INTO audit_events
        (id, action, entity_type, entity_id, actor_id, correlation_id, details_json, occurred_at)
      VALUES
        ('audit-1', 'test', 'source', 'source-a', 'actor', 'corr-audit', '{}', '2026-08-25T12:03:00Z');
    `);
    expect(() => db.exec("DELETE FROM audit_events WHERE id = 'audit-1';")).toThrow(
      /audit_events are append-only/iu,
    );

    db.close();
  });
});
