// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1TurmasAlunosRepository } from '../server/banco-notas/d1-turmas-alunos-repository';

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
  teacher: '22222222-2222-4222-8222-222222222222',
  group: '33333333-3333-4333-8333-333333333333',
  emptyGroup: '33333333-3333-4333-8333-333333333334',
  componentA: '44444444-4444-4444-8444-444444444444',
  componentB: '55555555-5555-4555-8555-555555555555',
  student: '66666666-6666-4666-8666-666666666666',
  ghost: '66666666-6666-4666-8666-666666666667',
  collision: '66666666-6666-4666-8666-66666666666a',
  source: '77777777-7777-4777-8777-777777777777',
  model: '88888888-8888-4888-8888-888888888888',
  oldVersion: '99999999-9999-4999-8999-999999999999',
  latestVersion: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

describe('D1 Turmas e Alunos repository', () => {
  let database: DatabaseSync;
  let repository: D1TurmasAlunosRepository;
  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    const names = [
      'banco_notas_foundation',
      'banco_notas_cross_year_integrity',
      'banco_notas_import_job_state_machine',
      'banco_notas_import_finding_resolution',
      'banco_notas_import_analysis',
      'banco_notas_import_analysis_profiles',
      'banco_notas_teacher_entra_identity',
    ];
    names.forEach((name, index) =>
      database.exec(
        readFileSync(
          join(
            process.cwd(),
            'infra/banco-notas/d1/migrations',
            `${String(index + 1).padStart(4, '0')}_${name}.sql`,
          ),
          'utf8',
        ),
      ),
    );
    database.exec(`
      INSERT INTO school_years (id, year, name, starts_on, ends_on, status) VALUES ('${ids.year}', 2026, 'Ano 2026', '2026-01-01', '2026-12-31', 'active');
      INSERT INTO teachers (id, display_name) VALUES ('${ids.teacher}', 'Professora Ana');
      INSERT INTO class_groups (id, school_year_id, name) VALUES
        ('${ids.group}', '${ids.year}', '6º A'), ('${ids.emptyGroup}', '${ids.year}', '7º B sem mappings');
      INSERT INTO components (id, school_year_id, name) VALUES ('${ids.componentA}', '${ids.year}', 'Matemática'), ('${ids.componentB}', '${ids.year}', 'Ciências');
      INSERT INTO teacher_assignments (id, school_year_id, teacher_id, class_group_id, component_id, effective_from) VALUES
        ('assignment-a', '${ids.year}', '${ids.teacher}', '${ids.group}', '${ids.componentA}', '2026-01-01'),
        ('assignment-b', '${ids.year}', '${ids.teacher}', '${ids.group}', '${ids.componentB}', '2026-01-01'),
        ('assignment-empty', '${ids.year}', '${ids.teacher}', '${ids.emptyGroup}', '${ids.componentA}', '2026-01-01');
      INSERT INTO students (id, external_id, display_name) VALUES
        ('${ids.student}', 'MAT-01', 'Aluna Real'), ('${ids.ghost}', NULL, 'Aluno apenas antigo'), ('${ids.collision}', NULL, 'Aluno colisão');
      INSERT INTO teacher_models (id, school_year_id, teacher_id, state) VALUES ('${ids.model}', '${ids.year}', '${ids.teacher}', 'connected');
      INSERT INTO teacher_model_versions (id, teacher_model_id, version, model_hash, mapping_version, provenance_json) VALUES
        ('${ids.oldVersion}', '${ids.model}', 1, '${'a'.repeat(64)}', 1, '{}'),
        ('${ids.latestVersion}', '${ids.model}', 2, '${'b'.repeat(64)}', 2, '{}');
      INSERT INTO cell_mappings (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field) VALUES
        ('old', '${ids.oldVersion}', '2026|${ids.group}|${ids.componentA}|${ids.ghost}', 'old', 'A1', 'NotaT1'),
        ('real-a1', '${ids.latestVersion}', '2026|${ids.group}|${ids.componentA}|${ids.student}', 'latest', 'A1', 'NotaT1'),
        ('real-a2', '${ids.latestVersion}', '2026|${ids.group}|${ids.componentA}|${ids.student}', 'latest', 'A2', 'NotaT2'),
        ('real-b1', '${ids.latestVersion}', '2026|${ids.group}|${ids.componentB}|${ids.student}', 'latest', 'B1', 'NotaT1'),
        ('collision', '${ids.latestVersion}', '2026|${ids.group}|${ids.componentA}|prefix-${ids.collision}', 'latest', 'C1', 'NotaT1');
      INSERT INTO data_sources (id, school_year_id, type, name, created_by) VALUES ('${ids.source}', '${ids.year}', 'linked_teacher_model', 'Fonte', 'test');
      INSERT INTO grade_events (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field, source_id, teacher_model_id, sequence, value_numeric, is_absent, provenance_json, occurred_at) VALUES
        ('event-zero', 'zero', 'hash-zero', 'corr-zero', 'grade.changed', 'applied', '2026|${ids.group}|${ids.componentA}|${ids.student}', 'NotaT1', '${ids.source}', '${ids.model}', 1, 0, 0, '{}', '2026-08-28T10:00:00Z'),
        ('event-absent', 'absent', 'hash-absent', 'corr-absent', 'grade.changed', 'applied', '2026|${ids.group}|${ids.componentA}|${ids.student}', 'NotaT2', '${ids.source}', '${ids.model}', 1, NULL, 1, '{}', '2026-08-28T11:00:00Z');
      INSERT INTO grade_snapshots (grade_key, field, event_id, source_id, sequence, value_numeric, is_absent) VALUES
        ('2026|${ids.group}|${ids.componentA}|${ids.student}', 'NotaT1', 'event-zero', '${ids.source}', 1, 0, 0),
        ('2026|${ids.group}|${ids.componentA}|${ids.student}', 'NotaT2', 'event-absent', '${ids.source}', 1, NULL, 1);
    `);
    repository = new D1TurmasAlunosRepository(new TestD1(database) as unknown as D1Database);
  });
  afterEach(() => database.close());

  it('uses only the latest model version, exact keys and deduplicates across components', async () => {
    const list = await repository.listTurmas({ page: 1, pageSize: 20 });
    expect(list.items[0]).toMatchObject({
      name: '6º A',
      students: 1,
      components: 2,
      teachers: 1,
      mappedFields: 3,
      models: 1,
      connectedModels: 1,
      openFindings: 0,
      attentionLevel: 'normal',
      lastUpdatedAt: expect.any(String),
    });
    const detail = await repository.turmaDetail(ids.group);
    expect(detail?.students).toHaveLength(1);
    expect(detail?.students[0]).toMatchObject({
      id: ids.student,
      mappedFields: 3,
      presentValues: 1,
      absentValues: 1,
      numericZeroValues: 1,
    });
    expect(detail?.students[0]?.components).toEqual(
      expect.arrayContaining(['Matemática', 'Ciências']),
    );
    expect(detail?.assignments).toHaveLength(2);
    expect((await repository.alunoDetail(ids.student))?.contexts[0]?.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'NotaT1', valueNumeric: 0, isAbsent: false }),
        expect.objectContaining({ field: 'NotaT2', valueNumeric: null, isAbsent: true }),
      ]),
    );
    expect((await repository.alunoDetail(ids.student))?.contexts[0]?.openFindings).toBe(0);
  });

  it('filters turmas by every supported server-side dimension', async () => {
    const matching = await repository.listTurmas({
      schoolYearId: ids.year,
      teacherId: ids.teacher,
      componentId: ids.componentA,
      status: 'active',
      attention: 'normal',
      q: '6º',
      page: 1,
      pageSize: 20,
    });
    expect(matching.total).toBe(1);
    await expect(
      repository.listTurmas({ status: 'inactive', page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({ total: 0, items: [] });
  });

  it('keeps a class without canonical mappings visible without inventing students', async () => {
    const detail = await repository.turmaDetail(ids.emptyGroup);
    expect(detail?.students).toEqual([]);
    const list = await repository.listTurmas({ q: 'sem mappings', page: 1, pageSize: 20 });
    expect(list.items[0]).toMatchObject({
      id: ids.emptyGroup,
      students: 0,
      components: 1,
      teachers: 1,
    });
  });

  it('lists every registered student globally but scopes filters to canonical relationships', async () => {
    const all = await repository.listAlunos({ page: 1, pageSize: 2 });
    expect(all.total).toBe(3);
    expect(all.totalPages).toBe(2);
    const scoped = await repository.listAlunos({ classGroupId: ids.group, page: 1, pageSize: 20 });
    expect(scoped.items.map((item) => item.id)).toEqual([ids.student]);
    expect(scoped.items[0]?.snapshots).toBe(2);
    expect((await repository.alunoDetail(ids.ghost))?.contexts).toEqual([]);
    const search = await repository.listAlunos({
      schoolYearId: ids.year,
      status: 'active',
      relationship: 'related',
      snapshots: 'present',
      q: 'real',
      page: 1,
      pageSize: 20,
    });
    expect(search.items.map((item) => item.id)).toEqual([ids.student]);
    const unrelated = await repository.listAlunos({
      relationship: 'unrelated',
      snapshots: 'none',
      page: 1,
      pageSize: 20,
    });
    expect(unrelated.total).toBe(2);
  });

  it('returns null for missing detail records', async () => {
    await expect(
      repository.turmaDetail('ffffffff-ffff-4fff-8fff-ffffffffffff'),
    ).resolves.toBeNull();
    await expect(
      repository.alunoDetail('ffffffff-ffff-4fff-8fff-ffffffffffff'),
    ).resolves.toBeNull();
  });
});
