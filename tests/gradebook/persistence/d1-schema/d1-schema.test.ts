import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { GRADEBOOK_D1_MIGRATIONS } from '../../../../server/gradebook/persistence/d1/schema/migrations';

const migrationDirectory = join(process.cwd(), 'migrations', 'gradebook');
const instant = '2026-08-31T18:00:00.000Z';
const yearId = 'academic-year:synthetic:2026';
const sha256 = 'a'.repeat(64);

let databases: DatabaseSync[] = [];
let DatabaseSyncConstructor: typeof DatabaseSync;

beforeAll(async () => {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  DatabaseSyncConstructor = sqlite.DatabaseSync;
});

function openDatabase(): DatabaseSync {
  const database = new DatabaseSyncConstructor(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  databases.push(database);
  return database;
}

function applyMigrations(database: DatabaseSync): void {
  for (const migration of GRADEBOOK_D1_MIGRATIONS) {
    database.exec(readFileSync(join(migrationDirectory, migration.fileName), 'utf8'));
  }
}

function migratedDatabase(): DatabaseSync {
  const database = openDatabase();
  applyMigrations(database);
  return database;
}

function insertAcademicYear(database: DatabaseSync, id = yearId, year = 2026): void {
  database
    .prepare(
      `INSERT INTO academic_years (
        academic_year_id, school_id, year, current_version, created_at
      ) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(id, `school:synthetic:${year}`, year, instant);
  database
    .prepare(
      `INSERT INTO academic_year_configuration_versions (
        academic_year_id, configuration_id, version, previous_version,
        evaluation_profile_id, payload_json, recorded_at
      ) VALUES (?, 'configuration:synthetic:v1', 1, NULL, 'evaluation-profile:v1', '{}', ?)`,
    )
    .run(id, instant);
  database
    .prepare(
      `INSERT INTO academic_year_versions (
        academic_year_id, version, previous_version, status, starts_on, ends_on,
        active_evaluation_profile_id, configuration_id, configuration_version,
        payload_json, recorded_at
      ) VALUES (
        ?, 1, NULL, 'active', '2026-02-01', '2026-12-20',
        'evaluation-profile:v1', 'configuration:synthetic:v1', 1, '{}', ?
      )`,
    )
    .run(id, instant);
}

function insertEntityStream(
  database: DatabaseSync,
  kind: string,
  id: string,
  academicYearId = yearId,
): void {
  database
    .prepare(
      `INSERT INTO academic_entity_streams (
        academic_year_id, entity_kind, entity_id, current_version, created_at
      ) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(academicYearId, kind, id, instant);
}

function insertSourceFile(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO source_file_streams (
        academic_year_id, manifest_id, current_version, current_sha256, created_at
      ) VALUES (?, 'manifest:synthetic:001', 1, ?, ?)`,
    )
    .run(yearId, sha256, instant);
  database
    .prepare(
      `INSERT INTO source_file_versions (
        academic_year_id, manifest_id, version, previous_version, file_name, extension,
        reported_mime_type, size_bytes, last_modified_at, sha256,
        source_contract_version, parser_version, read_at, suggested_academic_year,
        confirmed_academic_year_id, suggested_teacher_name, confirmed_teacher_id,
        logical_source_state, confirmed_logical_source_id, payload_json, recorded_at
      ) VALUES (
        ?, 'manifest:synthetic:001', 1, NULL, 'synthetic-gradebook.xlsx', 'xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 512, ?, ?,
        1, 'synthetic-parser-v1', ?, 2026, ?, 'Synthetic Teacher', NULL,
        'unmatched', NULL, '{}', ?
      )`,
    )
    .run(yearId, instant, sha256, instant, yearId, instant);
}

function insertImportBatch(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO import_batch_streams (
        academic_year_id, import_batch_id, current_version, created_at
      ) VALUES (?, 'import-batch:synthetic:001', 1, ?)`,
    )
    .run(yearId, instant);
  database
    .prepare(
      `INSERT INTO import_batch_versions (
        academic_year_id, import_batch_id, version, previous_version, status,
        received_at, updated_at, summary_json, payload_json, recorded_at
      ) VALUES (
        ?, 'import-batch:synthetic:001', 1, NULL, 'review-required',
        ?, ?, '{}', '{}', ?
      )`,
    )
    .run(yearId, instant, instant, instant);
}

function insertAcademicRecordContext(database: DatabaseSync): void {
  insertEntityStream(database, 'student', 'student:synthetic:001');
  insertEntityStream(database, 'enrollment', 'enrollment:synthetic:001');
  insertEntityStream(database, 'teaching-assignment', 'assignment:synthetic:001');
  insertEntityStream(database, 'assessment-component', 'component:synthetic:001');
}

afterEach(() => {
  for (const database of databases) database.close();
  databases = [];
});

describe('gradebook D1 schema migrations', () => {
  it('registers ordered migrations and reapplies them safely', () => {
    expect(GRADEBOOK_D1_MIGRATIONS.map(({ version }) => version)).toEqual([1, 2]);
    expect(GRADEBOOK_D1_MIGRATIONS.map(({ fileName }) => fileName)).toEqual([
      '0001_gradebook_context_entities_imports_v1.sql',
      '0002_gradebook_records_audit_v1.sql',
    ]);

    const database = migratedDatabase();
    applyMigrations(database);

    expect(
      database
        .prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version')
        .all(),
    ).toEqual([
      { version: 1, name: 'gradebook_context_entities_imports_v1' },
      { version: 2, name: 'gradebook_records_audit_v1' },
    ]);
  });

  it('creates the complete V1 table catalogue without destructive cascades', () => {
    const database = migratedDatabase();
    const tableNames = database
      .prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map(({ name }) => name);

    expect(tableNames).toEqual([
      'academic_entity_streams',
      'academic_entity_versions',
      'academic_record_streams',
      'academic_record_versions',
      'academic_year_configuration_versions',
      'academic_year_versions',
      'academic_years',
      'audit_occurrence_transitions',
      'audit_record_streams',
      'audit_record_versions',
      'gradebook_schema_migrations',
      'import_batch_files',
      'import_batch_streams',
      'import_batch_versions',
      'import_diagnostics',
      'logical_sources',
      'source_file_logical_source_candidates',
      'source_file_streams',
      'source_file_versions',
    ]);

    for (const tableName of tableNames) {
      const escapedName = String(tableName).replaceAll('"', '""');
      const foreignKeys = database.prepare(`PRAGMA foreign_key_list("${escapedName}")`).all();
      expect(foreignKeys.every(({ on_delete }) => on_delete === 'NO ACTION')).toBe(true);
    }
  });

  it('supports append-only versions and compare-and-set through the stream pointer', () => {
    const database = migratedDatabase();
    insertAcademicYear(database);
    insertEntityStream(database, 'teacher', 'teacher:synthetic:001');

    database
      .prepare(
        `INSERT INTO academic_entity_versions (
          academic_year_id, entity_kind, entity_id, version, previous_version,
          payload_json, recorded_at
        ) VALUES (?, 'teacher', 'teacher:synthetic:001', 1, NULL, '{"status":"active"}', ?)`,
      )
      .run(yearId, instant);

    const compareAndSet = database
      .prepare(
        `UPDATE academic_entity_streams SET current_version = 2
         WHERE academic_year_id = ? AND entity_kind = 'teacher'
           AND entity_id = 'teacher:synthetic:001' AND current_version = 1`,
      )
      .run(yearId);
    expect(compareAndSet.changes).toBe(1);

    database
      .prepare(
        `INSERT INTO academic_entity_versions (
          academic_year_id, entity_kind, entity_id, version, previous_version,
          payload_json, recorded_at
        ) VALUES (?, 'teacher', 'teacher:synthetic:001', 2, 1, '{"status":"inactive"}', ?)`,
      )
      .run(yearId, instant);

    const staleCompareAndSet = database
      .prepare(
        `UPDATE academic_entity_streams SET current_version = 3
         WHERE academic_year_id = ? AND entity_kind = 'teacher'
           AND entity_id = 'teacher:synthetic:001' AND current_version = 1`,
      )
      .run(yearId);
    expect(staleCompareAndSet.changes).toBe(0);
    expect(() =>
      database
        .prepare(
          `INSERT INTO academic_entity_versions (
            academic_year_id, entity_kind, entity_id, version, previous_version,
            payload_json, recorded_at
          ) VALUES (?, 'teacher', 'teacher:synthetic:001', 3, 1, '{}', ?)`,
        )
        .run(yearId, instant),
    ).toThrow(/CHECK constraint failed/);
    expect(
      database
        .prepare(
          `SELECT version, payload_json FROM academic_entity_versions
           WHERE academic_year_id = ? AND entity_kind = 'teacher'
           ORDER BY version`,
        )
        .all(yearId),
    ).toEqual([
      { version: 1, payload_json: '{"status":"active"}' },
      { version: 2, payload_json: '{"status":"inactive"}' },
    ]);
    expect(() =>
      database
        .prepare(
          `DELETE FROM academic_entity_streams
           WHERE academic_year_id = ? AND entity_kind = 'teacher'`,
        )
        .run(yearId),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('isolates typed academic relationships by academic year', () => {
    const database = migratedDatabase();
    const otherYearId = 'academic-year:synthetic:2027';
    insertAcademicYear(database);
    insertAcademicYear(database, otherYearId, 2027);
    insertEntityStream(database, 'student', 'student:synthetic:cross-year', otherYearId);
    insertEntityStream(database, 'class-group', 'class-group:synthetic:001');
    insertEntityStream(database, 'enrollment', 'enrollment:synthetic:invalid');

    expect(() =>
      database
        .prepare(
          `INSERT INTO academic_entity_versions (
            academic_year_id, entity_kind, entity_id, version, previous_version,
            student_ref_kind, student_id, class_group_ref_kind, class_group_id,
            payload_json, recorded_at
          ) VALUES (
            ?, 'enrollment', 'enrollment:synthetic:invalid', 1, NULL,
            'student', 'student:synthetic:cross-year', 'class-group',
            'class-group:synthetic:001', '{}', ?
          )`,
        )
        .run(yearId, instant),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('uses SHA-256 identity while preserving renamed file versions and source candidates', () => {
    const database = migratedDatabase();
    insertAcademicYear(database);
    insertSourceFile(database);
    database
      .prepare(
        `INSERT INTO logical_sources (
          academic_year_id, logical_source_id, source_context, created_at
        ) VALUES (?, 'logical-source:synthetic:001', 'teacher-year-context', ?)`,
      )
      .run(yearId, instant);

    database
      .prepare(
        `UPDATE source_file_streams SET current_version = 2
         WHERE academic_year_id = ? AND manifest_id = 'manifest:synthetic:001'
           AND current_version = 1`,
      )
      .run(yearId);
    database
      .prepare(
        `INSERT INTO source_file_versions (
          academic_year_id, manifest_id, version, previous_version, file_name, extension,
          size_bytes, sha256, source_contract_version, parser_version, read_at,
          logical_source_state, payload_json, recorded_at
        ) VALUES (
          ?, 'manifest:synthetic:001', 2, 1, 'renamed-synthetic-gradebook.xlsx', 'xlsx',
          512, ?, 1, 'synthetic-parser-v1', ?, 'candidate', '{}', ?
        )`,
      )
      .run(yearId, sha256, instant, instant);
    database
      .prepare(
        `INSERT INTO source_file_logical_source_candidates (
          academic_year_id, manifest_id, source_file_version, logical_source_id
        ) VALUES (?, 'manifest:synthetic:001', 2, 'logical-source:synthetic:001')`,
      )
      .run(yearId);

    expect(
      database
        .prepare(
          `SELECT file_name, sha256 FROM source_file_versions
           WHERE academic_year_id = ? AND manifest_id = 'manifest:synthetic:001'
           ORDER BY version`,
        )
        .all(yearId),
    ).toEqual([
      { file_name: 'synthetic-gradebook.xlsx', sha256 },
      { file_name: 'renamed-synthetic-gradebook.xlsx', sha256 },
    ]);
    expect(() =>
      database
        .prepare(
          `INSERT INTO source_file_streams (
            academic_year_id, manifest_id, current_version, current_sha256, created_at
          ) VALUES (?, 'manifest:synthetic:duplicate', 1, ?, ?)`,
        )
        .run(yearId, sha256, instant),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('preserves batch, file and diagnostic provenance with enforced links', () => {
    const database = migratedDatabase();
    insertAcademicYear(database);
    insertSourceFile(database);
    insertImportBatch(database);
    database
      .prepare(
        `INSERT INTO import_batch_files (
          academic_year_id, import_batch_id, batch_version, import_file_id,
          manifest_id, manifest_version, status, file_name, extension, size_bytes, payload_json
        ) VALUES (
          ?, 'import-batch:synthetic:001', 1, 'import-file:synthetic:001',
          'manifest:synthetic:001', 1, 'review-required',
          'synthetic-gradebook.xlsx', 'xlsx', 512, '{}'
        )`,
      )
      .run(yearId);
    database
      .prepare(
        `INSERT INTO import_diagnostics (
          academic_year_id, import_batch_id, batch_version, diagnostic_id,
          import_file_id, manifest_id, manifest_version, severity, code, message,
          location_kind, sheet_name, cell_address, source_evidence_json, payload_json
        ) VALUES (
          ?, 'import-batch:synthetic:001', 1, 'diagnostic:synthetic:001',
          'import-file:synthetic:001', 'manifest:synthetic:001', 1,
          'warning', 'SYNTHETIC-CELL', 'Synthetic diagnostic',
          'cell', 'Synthetic1º', 'R10', '{}', '{}'
        )`,
      )
      .run(yearId);

    expect(
      database
        .prepare(
          `SELECT d.diagnostic_id, f.import_file_id, v.sha256
           FROM import_diagnostics d
           JOIN import_batch_files f USING (
             academic_year_id, import_batch_id, batch_version, import_file_id
           )
           JOIN source_file_versions v
             ON v.academic_year_id = d.academic_year_id
            AND v.manifest_id = d.manifest_id
            AND v.version = d.manifest_version`,
        )
        .get(),
    ).toEqual({
      diagnostic_id: 'diagnostic:synthetic:001',
      import_file_id: 'import-file:synthetic:001',
      sha256,
    });
    expect(() =>
      database
        .prepare(
          `INSERT INTO import_diagnostics (
            academic_year_id, import_batch_id, batch_version, diagnostic_id,
            import_file_id, severity, code, message, location_kind, payload_json
          ) VALUES (
            ?, 'import-batch:synthetic:001', 1, 'diagnostic:synthetic:orphan',
            'import-file:synthetic:missing', 'warning', 'ORPHAN',
            'Synthetic orphan', 'file', '{}'
          )`,
        )
        .run(yearId),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('enforces academic stream shape and uses the current-page cursor index', () => {
    const database = migratedDatabase();
    insertAcademicYear(database);
    insertAcademicRecordContext(database);
    database
      .prepare(
        `INSERT INTO academic_record_streams (
          academic_year_id, record_kind, stream_key, current_version,
          student_id, enrollment_id, assessment_component_ref_kind,
          assessment_component_id, created_at
        ) VALUES (
          ?, 'grade-entry', 'student:001|enrollment:001|component:001', 1,
          'student:synthetic:001', 'enrollment:synthetic:001',
          'assessment-component', 'component:synthetic:001', ?
        )`,
      )
      .run(yearId, instant);
    database
      .prepare(
        `INSERT INTO academic_record_versions (
          academic_year_id, record_kind, stream_key, version, previous_version,
          record_id, authority_mode, rule_version, payload_json, recorded_at
        ) VALUES (
          ?, 'grade-entry', 'student:001|enrollment:001|component:001', 1, NULL,
          'grade-entry:synthetic:001', 'imported-source', 'grade-entry-v1', '{}', ?
        )`,
      )
      .run(yearId, instant);

    expect(() =>
      database
        .prepare(
          `INSERT INTO academic_record_streams (
            academic_year_id, record_kind, stream_key, current_version,
            student_id, enrollment_id, teaching_assignment_ref_kind,
            teaching_assignment_id, term, created_at
          ) VALUES (
            ?, 'term-result', 'invalid-term-stream', 1,
            'student:synthetic:001', 'enrollment:synthetic:001',
            'teaching-assignment', 'assignment:synthetic:001', NULL, ?
          )`,
        )
        .run(yearId, instant),
    ).toThrow(/CHECK constraint failed/);

    const queryPlan = database
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT stream_key FROM academic_record_streams
         WHERE academic_year_id = ? AND record_kind = ?
           AND student_id = ? AND enrollment_id = ? AND stream_key > ?
         ORDER BY student_id, enrollment_id, stream_key LIMIT ?`,
      )
      .all(yearId, 'grade-entry', 'student:synthetic:001', 'enrollment:synthetic:001', '', 50)
      .map(({ detail }) => String(detail));
    expect(
      queryPlan.some((detail) => detail.includes('idx_academic_record_streams_current_page')),
    ).toBe(true);
  });

  it('versions reconciliations and preserves validated occurrence transitions', () => {
    const database = migratedDatabase();
    insertAcademicYear(database);
    insertSourceFile(database);
    insertImportBatch(database);
    insertAcademicRecordContext(database);
    database
      .prepare(
        `INSERT INTO academic_record_streams (
          academic_year_id, record_kind, stream_key, current_version,
          student_id, enrollment_id, assessment_component_ref_kind,
          assessment_component_id, created_at
        ) VALUES (
          ?, 'grade-entry', 'grade-stream:synthetic:001', 1,
          'student:synthetic:001', 'enrollment:synthetic:001',
          'assessment-component', 'component:synthetic:001', ?
        )`,
      )
      .run(yearId, instant);
    database
      .prepare(
        `INSERT INTO audit_record_streams (
          academic_year_id, audit_kind, audit_record_id, current_version, created_at
        ) VALUES (?, 'occurrence', 'occurrence:synthetic:001', 1, ?)`,
      )
      .run(yearId, instant);
    database
      .prepare(
        `INSERT INTO audit_record_streams (
          academic_year_id, audit_kind, audit_record_id, current_version, created_at
        ) VALUES (?, 'reconciliation', 'reconciliation:synthetic:001', 1, ?)`,
      )
      .run(yearId, instant);
    database
      .prepare(
        `INSERT INTO audit_record_versions (
          academic_year_id, audit_kind, audit_record_id, version, previous_version,
          reconciliation_status, target_kind, target_record_id, target_stream_key,
          difference, tolerance, rule_version, payload_json, recorded_at
        ) VALUES (
          ?, 'reconciliation', 'reconciliation:synthetic:001', 1, NULL,
          'match', 'grade-entry', 'grade-entry:synthetic:001',
          'grade-stream:synthetic:001', 0, 0.01, 'reconciliation-v1', '{}', ?
        )`,
      )
      .run(yearId, instant);
    database
      .prepare(
        `INSERT INTO audit_record_versions (
          academic_year_id, audit_kind, audit_record_id, version, previous_version,
          import_batch_id, severity, category, occurrence_state,
          source_manifest_id, source_manifest_version, source_sheet_name,
          source_cell_address, payload_json, recorded_at
        ) VALUES (
          ?, 'occurrence', 'occurrence:synthetic:001', 1, NULL,
          'import-batch:synthetic:001', 'warning', 'synthetic-source', 'open',
          'manifest:synthetic:001', 1, 'Synthetic1º', 'R10', '{}', ?
        )`,
      )
      .run(yearId, instant);
    database
      .prepare(
        `INSERT INTO audit_occurrence_transitions (
          academic_year_id, occurrence_id, transition_sequence,
          previous_state, next_state, actor_id, occurred_at, note
        ) VALUES (
          ?, 'occurrence:synthetic:001', 1,
          'open', 'acknowledged', 'actor:synthetic:001', ?, 'Synthetic review'
        )`,
      )
      .run(yearId, instant);

    expect(() =>
      database
        .prepare(
          `INSERT INTO audit_occurrence_transitions (
            academic_year_id, occurrence_id, transition_sequence,
            previous_state, next_state, actor_id, occurred_at
          ) VALUES (
            ?, 'occurrence:synthetic:001', 2,
            'acknowledged', 'resolved', 'actor:synthetic:001', ?
          )`,
        )
        .run(yearId, instant),
    ).toThrow(/CHECK constraint failed/);
    expect(
      database
        .prepare(
          `SELECT v.audit_record_id, v.source_manifest_id, t.next_state, t.actor_id
           FROM audit_record_versions v
           JOIN audit_occurrence_transitions t
             ON t.academic_year_id = v.academic_year_id
            AND t.occurrence_id = v.audit_record_id
           WHERE v.academic_year_id = ? AND v.audit_kind = 'occurrence'`,
        )
        .get(yearId),
    ).toEqual({
      audit_record_id: 'occurrence:synthetic:001',
      source_manifest_id: 'manifest:synthetic:001',
      next_state: 'acknowledged',
      actor_id: 'actor:synthetic:001',
    });
    expect(
      database
        .prepare(
          `SELECT reconciliation_status, target_kind, target_record_id, difference, tolerance
           FROM audit_record_versions
           WHERE academic_year_id = ? AND audit_kind = 'reconciliation'`,
        )
        .get(yearId),
    ).toEqual({
      reconciliation_status: 'match',
      target_kind: 'grade-entry',
      target_record_id: 'grade-entry:synthetic:001',
      difference: 0,
      tolerance: 0.01,
    });
  });

  it('rejects non-UTC instants and exposes all critical indexes', () => {
    const database = migratedDatabase();

    expect(() =>
      database
        .prepare(
          `INSERT INTO academic_years (
            academic_year_id, school_id, year, current_version, created_at
          ) VALUES ('academic-year:invalid', 'school:synthetic', 2026, 1, '2026-08-31 18:00:00')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);

    const indexNames = new Set(
      database
        .prepare(
          `SELECT name FROM sqlite_schema
           WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`,
        )
        .all()
        .map(({ name }) => name),
    );
    for (const expectedIndex of [
      'idx_academic_entity_streams_page',
      'idx_source_file_streams_hash',
      'idx_source_file_versions_logical_source',
      'idx_import_batch_streams_page',
      'idx_import_diagnostics_file',
      'idx_academic_record_streams_current_page',
      'idx_academic_record_versions_history',
      'idx_audit_record_streams_page',
      'idx_audit_occurrences_state',
      'idx_reconciliations_target',
    ]) {
      expect(indexNames).toContain(expectedIndex);
    }
  });
});
