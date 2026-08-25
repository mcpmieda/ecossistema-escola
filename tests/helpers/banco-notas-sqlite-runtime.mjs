import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const migration1 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql'),
  'utf8',
);
const migration2 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0002_banco_notas_cross_year_integrity.sql'),
  'utf8',
);

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(migration1);
  db.exec(migration2);
  return db;
}

function seedYearsAndSources(db) {
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

function rejects(operation, pattern) {
  try {
    operation();
    return false;
  } catch (error) {
    return pattern.test(error instanceof Error ? error.message : String(error));
  }
}

function numeric(db, sql, column) {
  const row = db.prepare(sql).get();
  return Number(row?.[column]);
}

const results = {};

{
  const db = database();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row.name));
  results.schemaCreated = [
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
  ].every((table) => tables.includes(table));
  db.close();
}

{
  const db = database();
  seedYearsAndSources(db);
  db.exec(`
    INSERT INTO source_assignments
      (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
    VALUES
      ('assignment-a', 'year-2026', 'source-a', 'school_year_default', 'authoritative', '2026-01-01', 'actor', 'configuração inicial');
  `);
  results.syncDefaultOff =
    numeric(
      db,
      "SELECT sync_enabled FROM source_assignments WHERE id = 'assignment-a'",
      'sync_enabled',
    ) === 0;
  results.crossYearSourceRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO source_assignments
          (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
        VALUES
          ('cross-year', 'year-2027', 'source-a', 'school_year_default', 'authoritative', '2027-01-01', 'actor', 'inválida');
      `),
    /source assignment year mismatch/iu,
  );
  results.authorityOverlapRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO source_assignments
          (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
        VALUES
          ('assignment-b', 'year-2026', 'source-b', 'school_year_default', 'authoritative', '2026-06-01', 'actor', 'sobreposição');
      `),
    /authoritative source assignment overlap/iu,
  );
  results.referenceSourceAllowed = !rejects(
    () =>
      db.exec(`
        INSERT INTO source_assignments
          (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
        VALUES
          ('reference-b', 'year-2026', 'source-b', 'school_year_default', 'reference_only', '2026-06-01', 'actor', 'referência explícita');
      `),
    /.*/u,
  );
  db.exec(`
    INSERT INTO teachers (id, display_name)
    VALUES ('teacher-a', 'Professor sintético');
  `);
  results.teacherOverrideAllowed = !rejects(
    () =>
      db.exec(`
        INSERT INTO source_assignments
          (id, school_year_id, data_source_id, teacher_id, scope, authority, effective_from, operator_id, reason)
        VALUES
          ('teacher-override', 'year-2026', 'source-b', 'teacher-a', 'teacher_override', 'authoritative', '2026-01-01', 'actor', 'exceção docente');
      `),
    /.*/u,
  );
  db.close();
}

{
  const db = database();
  seedYearsAndSources(db);
  db.exec(`
    INSERT INTO teachers (id, display_name) VALUES ('teacher-a', 'Professor sintético');
    INSERT INTO class_groups (id, school_year_id, name) VALUES ('class-2026', 'year-2026', 'Turma sintética');
    INSERT INTO components (id, school_year_id, name) VALUES ('component-2027', 'year-2027', 'Componente sintético');
  `);
  results.teacherAssignmentYearRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO teacher_assignments
          (id, school_year_id, teacher_id, class_group_id, component_id, effective_from)
        VALUES
          ('teacher-assignment-bad', 'year-2026', 'teacher-a', 'class-2026', 'component-2027', '2026-01-01');
      `),
    /teacher assignment component year mismatch/iu,
  );
  results.importYearRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO import_jobs
          (id, school_year_id, data_source_id, idempotency_key, source_hash, provenance_json, requested_by)
        VALUES
          ('import-bad', 'year-2027', 'source-a', 'idem-import', 'hash-import', '{}', 'actor');
      `),
    /import job source year mismatch/iu,
  );
  db.close();
}

{
  const db = database();
  seedYearsAndSources(db);
  db.exec(`
    INSERT INTO grade_events
      (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
       source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
    VALUES
      ('event-1', 'idem-1', 'hash-1', 'corr-1', 'grade.changed', 'applied', 'grade-a', 'NotaT1',
       'source-a', 1, 0, 0, '{}', '2026-08-25T12:00:00Z');
  `);
  results.zeroIsValidValue =
    numeric(db, "SELECT value_numeric FROM grade_events WHERE id = 'event-1'", 'value_numeric') ===
    0;
  results.idempotencyRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO grade_events
          (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
           source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
        VALUES
          ('event-2', 'idem-1', 'hash-2', 'corr-2', 'grade.changed', 'applied', 'grade-a', 'NotaT1',
           'source-a', 2, 1, 0, '{}', '2026-08-25T12:01:00Z');
      `),
    /UNIQUE constraint failed/iu,
  );
  results.appliedSequenceCollisionRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO grade_events
          (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
           source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
        VALUES
          ('event-sequence-applied', 'idem-sequence-applied', 'hash-seq-a', 'corr-sequence-a',
           'grade.changed', 'applied', 'grade-a', 'NotaT1', 'source-a', 1, 2, 0, '{}',
           '2026-08-25T12:01:30Z');
      `),
    /UNIQUE constraint failed/iu,
  );
  results.staleSequenceAuditAllowed = !rejects(
    () =>
      db.exec(`
        INSERT INTO grade_events
          (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
           source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
        VALUES
          ('event-sequence-stale', 'idem-sequence-stale', 'hash-seq-s', 'corr-sequence-s',
           'grade.changed', 'stale', 'grade-a', 'NotaT1', 'source-a', 1, 2, 0, '{}',
           '2026-08-25T12:01:45Z');
      `),
    /.*/u,
  );
  results.absenceWithValueRejected = rejects(
    () =>
      db.exec(`
        INSERT INTO grade_events
          (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
           source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
        VALUES
          ('event-invalid-absence', 'idem-absence', 'hash-absence', 'corr-3', 'grade.changed',
           'applied', 'grade-b', 'NotaT1', 'source-a', 1, 0, 1, '{}',
           '2026-08-25T12:02:00Z');
      `),
    /CHECK constraint failed/iu,
  );
  db.exec(`
    INSERT INTO grade_events
      (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
       source_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
    VALUES
      ('event-field-2', 'idem-field-2', 'hash-field-2', 'corr-field-2', 'grade.changed', 'applied',
       'grade-a', 'NotaT2', 'source-a', 1, 4, 0, '{}', '2026-08-25T12:02:10Z');

    INSERT INTO grade_snapshots
      (grade_key, field, event_id, source_id, sequence, value_numeric, is_absent)
    VALUES
      ('grade-a', 'NotaT1', 'event-1', 'source-a', 1, 0, 0),
      ('grade-a', 'NotaT2', 'event-field-2', 'source-a', 1, 4, 0);
  `);
  results.snapshotCompositeIdentity =
    numeric(
      db,
      "SELECT COUNT(*) AS total FROM grade_snapshots WHERE grade_key = 'grade-a'",
      'total',
    ) === 2;
  results.gradeEventsAppendOnly = rejects(
    () => db.exec("UPDATE grade_events SET status = 'rejected' WHERE id = 'event-1';"),
    /grade_events are append-only/iu,
  );
  db.exec(`
    INSERT INTO audit_events
      (id, action, entity_type, entity_id, actor_id, correlation_id, details_json, occurred_at)
    VALUES
      ('audit-1', 'test', 'source', 'source-a', 'actor', 'corr-audit', '{}', '2026-08-25T12:03:00Z');
  `);
  results.auditEventsAppendOnly = rejects(
    () => db.exec("DELETE FROM audit_events WHERE id = 'audit-1';"),
    /audit_events are append-only/iu,
  );
  db.close();
}

{
  const db = database();
  seedYearsAndSources(db);
  let failed = false;
  try {
    db.exec('BEGIN');
    db.exec(`
      INSERT INTO source_assignments
        (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
      VALUES
        ('transaction-valid', 'year-2026', 'source-a', 'school_year_default', 'authoritative', '2026-01-01', 'actor', 'transação');
    `);
    db.exec(`
      INSERT INTO source_assignments
        (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason)
      VALUES
        ('transaction-invalid', 'year-2027', 'source-a', 'school_year_default', 'authoritative', '2027-01-01', 'actor', 'transação inválida');
    `);
    db.exec('COMMIT');
  } catch {
    failed = true;
    db.exec('ROLLBACK');
  }
  results.transactionRollback =
    failed &&
    numeric(
      db,
      "SELECT COUNT(*) AS total FROM source_assignments WHERE id = 'transaction-valid'",
      'total',
    ) === 0;
  db.close();
}

process.stdout.write(`${JSON.stringify(results)}\n`);
