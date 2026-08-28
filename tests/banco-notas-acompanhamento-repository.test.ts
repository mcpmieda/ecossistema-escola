// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1AcompanhamentoRepository } from '../server/banco-notas/d1-acompanhamento-repository';

class PreparedStatement {
  private values: Array<string | number | bigint | Uint8Array | null> = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: Array<string | number | bigint | Uint8Array | null>) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }
}

class TestD1 {
  constructor(private readonly database: DatabaseSync) {}
  prepare(sql: string) {
    return new PreparedStatement(this.database.prepare(sql));
  }
}

const ids = {
  year: '11111111-1111-4111-8111-111111111111',
  teacherA: '22222222-2222-4222-8222-222222222222',
  teacherB: '33333333-3333-4333-8333-333333333333',
  classA: '44444444-4444-4444-8444-444444444444',
  classB: '55555555-5555-4555-8555-555555555555',
  component: '66666666-6666-4666-8666-666666666666',
  source: '77777777-7777-4777-8777-777777777777',
  student: '88888888-8888-4888-8888-888888888888',
  model: '99999999-9999-4999-8999-999999999999',
  version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

describe('D1 Acompanhamento repository', () => {
  let database: DatabaseSync;
  let repository: D1AcompanhamentoRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    for (let migration = 1; migration <= 7; migration += 1) {
      const name = String(migration).padStart(4, '0');
      const filename = readFileSync(
        join(
          process.cwd(),
          'infra/banco-notas/d1/migrations',
          `${name}_${
            [
              'banco_notas_foundation',
              'banco_notas_cross_year_integrity',
              'banco_notas_import_job_state_machine',
              'banco_notas_import_finding_resolution',
              'banco_notas_import_analysis',
              'banco_notas_import_analysis_profiles',
              'banco_notas_teacher_entra_identity',
            ][migration - 1]
          }.sql`,
        ),
        'utf8',
      );
      database.exec(filename);
    }
    database.exec(`
      INSERT INTO school_years (id, year, name, starts_on, ends_on, status)
      VALUES ('${ids.year}', 2026, 'Ano sintético 2026', '2026-01-01', '2026-12-31', 'active');
      INSERT INTO teachers (id, display_name, entra_object_id) VALUES
        ('${ids.teacherA}', 'Professora Sintética A', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        ('${ids.teacherB}', 'Professor Sintético B', NULL);
      INSERT INTO class_groups (id, school_year_id, name) VALUES
        ('${ids.classA}', '${ids.year}', 'Turma Sintética A'),
        ('${ids.classB}', '${ids.year}', 'Turma Sintética B');
      INSERT INTO components (id, school_year_id, name)
      VALUES ('${ids.component}', '${ids.year}', 'Componente Sintético');
      INSERT INTO teacher_assignments
        (id, school_year_id, teacher_id, class_group_id, component_id, effective_from)
      VALUES
        ('assignment-a', '${ids.year}', '${ids.teacherA}', '${ids.classA}', '${ids.component}', '2026-01-01'),
        ('assignment-b', '${ids.year}', '${ids.teacherB}', '${ids.classB}', '${ids.component}', '2026-01-01');
      INSERT INTO data_sources
        (id, school_year_id, type, name, description, created_by)
      VALUES ('${ids.source}', '${ids.year}', 'linked_teacher_model', 'Fonte Sintética', '', 'synthetic-actor');
      INSERT INTO source_assignments
        (id, school_year_id, data_source_id, scope, authority, sync_enabled, effective_from, operator_id, reason)
      VALUES ('source-assignment', '${ids.year}', '${ids.source}', 'school_year_default', 'authoritative', 0, '2026-01-01', 'synthetic-actor', 'fixture sintética');
      INSERT INTO teacher_models
        (id, school_year_id, teacher_id, state, sync_enabled, environment, last_reconciled_at)
      VALUES ('${ids.model}', '${ids.year}', '${ids.teacherA}', 'connected', 0, 'homologation', '2026-08-28T10:00:00Z');
      INSERT INTO teacher_model_versions
        (id, teacher_model_id, version, model_hash, mapping_version, provenance_json)
      VALUES ('${ids.version}', '${ids.model}', 1, '${'a'.repeat(64)}', 1, '{"definitionVersion":"1"}');
      INSERT INTO students (id, display_name) VALUES ('${ids.student}', 'Aluna Sintética');
      INSERT INTO cell_mappings
        (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field)
      VALUES
        ('mapping-1', '${ids.version}', '2026|${ids.classA}|${ids.component}|${ids.student}', 'synthetic-sheet', 'K7', 'NotaT1'),
        ('mapping-2', '${ids.version}', '2026|${ids.classA}|${ids.component}|${ids.student}', 'synthetic-sheet', 'L7', 'NotaT2');
      INSERT INTO grade_events
        (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
         source_id, teacher_model_id, sequence, value_numeric, is_absent, provenance_json, occurred_at)
      VALUES
        ('event-zero', 'idem-zero', 'hash-zero', 'corr-zero', 'grade.changed', 'applied',
         '2026|${ids.classA}|${ids.component}|${ids.student}', 'NotaT1', '${ids.source}', '${ids.model}', 1, 0, 0, '{}', '2026-08-28T10:01:00Z'),
        ('event-absent', 'idem-absent', 'hash-absent', 'corr-absent', 'grade.changed', 'applied',
         '2026|${ids.classA}|${ids.component}|${ids.student}', 'NotaT2', '${ids.source}', '${ids.model}', 1, NULL, 1, '{}', '2026-08-28T10:02:00Z');
      INSERT INTO grade_snapshots
        (grade_key, field, event_id, source_id, sequence, value_numeric, is_absent)
      VALUES
        ('2026|${ids.classA}|${ids.component}|${ids.student}', 'NotaT1', 'event-zero', '${ids.source}', 1, 0, 0),
        ('2026|${ids.classA}|${ids.component}|${ids.student}', 'NotaT2', 'event-absent', '${ids.source}', 1, NULL, 1);
      INSERT INTO import_jobs
        (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, state,
         provenance_json, requested_by)
      VALUES ('import-failed', '${ids.year}', '${ids.teacherB}', '${ids.source}', 'import-idem',
              '${'b'.repeat(64)}', 'failed', '{}', 'synthetic-actor');
      INSERT INTO import_findings
        (id, import_job_id, severity, code, location_json, details_json)
      VALUES ('finding-open', 'import-failed', 'error', 'synthetic_mapping_error', '{}', '{}');
    `);
    repository = new D1AcompanhamentoRepository(new TestD1(database) as unknown as D1Database);
  });

  afterEach(() => database.close());

  it('aggregates the operational summary without treating disabled sync as an error', async () => {
    const summary = await repository.summary();
    expect(summary).toMatchObject({
      classGroups: 2,
      trackedItems: 2,
      teachers: 2,
      models: 1,
      connectedModels: 1,
      syncEnabled: 0,
      openFindings: 1,
      needsAttention: 1,
    });
    expect(summary.filters.schoolYears).toEqual([{ id: ids.year, label: 'Ano sintético 2026' }]);
  });

  it('applies server-side filters, search and pagination', async () => {
    const normal = await repository.list({
      attention: 'normal',
      q: 'Sintética A',
      page: 1,
      pageSize: 20,
    });
    expect(normal.total).toBe(1);
    expect(normal.items[0]).toMatchObject({
      classGroupName: 'Turma Sintética A',
      teacherName: 'Professora Sintética A',
      modelState: 'connected',
      syncEnabled: false,
      attentionLevel: 'normal',
    });

    const attention = await repository.list({ attention: 'needs_attention', page: 1, pageSize: 1 });
    expect(attention.total).toBe(1);
    expect(attention.totalPages).toBe(1);
    expect(attention.items[0]?.attentionReasons).toContain('Importação com erro');
  });

  it('returns a class detail and preserves numeric zero versus explicit absence', async () => {
    const detail = await repository.detail(ids.classA);
    expect(detail?.students).toEqual([
      expect.objectContaining({
        displayName: 'Aluna Sintética',
        fieldsAvailable: 2,
        presentValues: 1,
        absentValues: 1,
        numericZeroValues: 1,
      }),
    ]);
    expect(detail?.notes).toMatchObject({
      snapshots: 2,
      presentValues: 1,
      absentValues: 1,
      numericZeroValues: 1,
      byField: [
        expect.objectContaining({
          field: 'NotaT1',
          snapshots: 1,
          presentValues: 1,
          absentValues: 0,
          numericZeroValues: 1,
        }),
        expect.objectContaining({
          field: 'NotaT2',
          snapshots: 1,
          presentValues: 0,
          absentValues: 1,
          numericZeroValues: 0,
        }),
      ],
    });
    await expect(repository.detail('ffffffff-ffff-4fff-8fff-ffffffffffff')).resolves.toBeNull();
  });
});
