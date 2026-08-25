import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql'),
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

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(sql);
  db.exec(
    "INSERT INTO school_years (id, year, name, starts_on, ends_on) VALUES ('year', 2026, 'Ano 2026', '2026-01-01', '2026-12-31'); INSERT INTO data_sources (id, school_year_id, type, name, created_by) VALUES ('source-a', 'year', 'legacy_import', 'Fonte A', 'actor'), ('source-b', 'year', 'linked_teacher_model', 'Fonte B', 'actor');",
  );
  return db;
}

describe('Banco de Notas D1 migration', () => {
  it('creates the complete Phase 1 schema', () => {
    const db = database();
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => String(row.name));
    expect(names).toEqual(expect.arrayContaining(expected));
  });
  it('rejects overlapping authoritative defaults', () => {
    const db = database();
    db.exec(
      "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason) VALUES ('one', 'year', 'source-a', 'school_year_default', 'authoritative', '2026-01-01', 'actor', 'test');",
    );
    expect(
      db.prepare("SELECT sync_enabled FROM source_assignments WHERE id = 'one'").get()
        ?.sync_enabled,
    ).toBe(0);
    expect(() =>
      db.exec(
        "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason) VALUES ('two', 'year', 'source-b', 'school_year_default', 'authoritative', '2026-02-01', 'actor', 'test');",
      ),
    ).toThrow(/overlap/iu);
  });
  it('keeps absence distinct from numeric zero and event streams append-only', () => {
    const db = database();
    db.exec(
      "INSERT INTO grade_events (id, idempotency_key, correlation_id, event_type, status, grade_key, source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at) VALUES ('zero', 'key-zero', 'corr', 'grade.changed', 'accepted', 'grade', 'source-a', 1, 0, 0, '{}', '2026-08-25T00:00:00Z'), ('absent', 'key-absent', 'corr', 'grade.changed', 'accepted', 'grade', 'source-a', 2, NULL, 1, '{}', '2026-08-25T00:01:00Z');",
    );
    expect(() => db.exec("UPDATE grade_events SET value_numeric = 5 WHERE id = 'zero'")).toThrow(
      /append-only/iu,
    );
    expect(() =>
      db.exec(
        "INSERT INTO grade_events (id, idempotency_key, correlation_id, event_type, status, grade_key, source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at) VALUES ('bad', 'key-bad', 'corr', 'grade.changed', 'accepted', 'other', 'source-a', 1, 0, 1, '{}', '2026-08-25T00:02:00Z')",
      ),
    ).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO grade_events (id, idempotency_key, correlation_id, event_type, status, grade_key, source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at) VALUES ('duplicate', 'key-zero', 'corr', 'grade.changed', 'accepted', 'other', 'source-a', 3, 5, 0, '{}', '2026-08-25T00:03:00Z')",
      ),
    ).toThrow();
  });
});
