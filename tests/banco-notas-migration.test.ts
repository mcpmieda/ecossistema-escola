import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('Banco de Notas D1 migration', () => {
  it('declares the complete Phase 1 schema without seed data', () => {
    for (const table of expected) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(sql).not.toMatch(/INSERT\s+INTO/iu);
  });
  it('encodes source authority, scope, period and safe sync defaults', () => {
    expect(sql).toContain("type IN ('legacy_import', 'linked_teacher_model')");
    expect(sql).toContain("scope IN ('school_year_default', 'teacher_override')");
    expect(sql).toContain("authority IN ('authoritative', 'reference_only')");
    expect(sql).toContain('sync_enabled INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('source_assignments_no_authority_overlap_insert');
    expect(sql).toContain("RAISE(ABORT, 'authoritative source assignment overlap')");
    expect(sql).toContain("COALESCE(current.effective_to, '9999-12-31')");
  });
  it('encodes idempotency, sequence, absence versus zero and immutable history', () => {
    expect(sql).toContain('idempotency_key TEXT NOT NULL UNIQUE');
    expect(sql).toContain('UNIQUE (source_id, grade_key, sequence)');
    expect(sql).toContain('is_absent = 1 AND value_numeric IS NULL AND value_text IS NULL');
    expect(sql).toContain('is_absent = 0 AND NOT');
    expect(sql).toContain('grade_events_append_only_update');
    expect(sql).toContain('audit_events_append_only_update');
    expect(sql).toContain('provenance_json TEXT NOT NULL');
  });
});
