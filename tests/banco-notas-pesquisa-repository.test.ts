// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1BancoNotasSearchRepository } from '../server/banco-notas/d1-search-repository';

class PreparedStatement {
  private values: Array<string | number | bigint | Uint8Array | null> = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: Array<string | number | bigint | Uint8Array | null>) {
    this.values = values;
    return this;
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
  teacherAna: '22222222-2222-4222-8222-222222222221',
  teacherPrefix: '22222222-2222-4222-8222-222222222222',
  teacherContains: '22222222-2222-4222-8222-222222222223',
  teacherContext: '22222222-2222-4222-8222-222222222224',
  groupA: '33333333-3333-4333-8333-333333333331',
  groupB: '33333333-3333-4333-8333-333333333332',
  componentMath: '44444444-4444-4444-8444-444444444441',
  componentScience: '44444444-4444-4444-8444-444444444442',
  studentAna: '55555555-5555-4555-8555-555555555551',
  studentLoose: '55555555-5555-4555-8555-555555555552',
  model: '66666666-6666-4666-8666-666666666661',
  version: '77777777-7777-4777-8777-777777777771',
};

describe('D1 Pesquisa Global repository', () => {
  let database: DatabaseSync;
  let repository: D1BancoNotasSearchRepository;

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
      INSERT INTO school_years (id, year, name, starts_on, ends_on, status)
        VALUES ('${ids.year}', 2026, 'Ano 2026', '2026-01-01', '2026-12-31', 'active');
      INSERT INTO teachers (id, display_name) VALUES
        ('${ids.teacherAna}', 'Ana'),
        ('${ids.teacherPrefix}', 'Ana Beatriz'),
        ('${ids.teacherContains}', 'Professora Ana'),
        ('${ids.teacherContext}', 'Professora Célia');
      INSERT INTO class_groups (id, school_year_id, name) VALUES
        ('${ids.groupA}', '${ids.year}', 'Turma Árvore'),
        ('${ids.groupB}', '${ids.year}', '7º B');
      INSERT INTO components (id, school_year_id, name) VALUES
        ('${ids.componentMath}', '${ids.year}', 'Matemática'),
        ('${ids.componentScience}', '${ids.year}', 'Ciências');
      INSERT INTO teacher_assignments
        (id, school_year_id, teacher_id, class_group_id, component_id, effective_from, status) VALUES
        ('assignment-ana-a', '${ids.year}', '${ids.teacherAna}', '${ids.groupA}', '${ids.componentMath}', '2026-01-01', 'active'),
        ('assignment-ana-b', '${ids.year}', '${ids.teacherAna}', '${ids.groupA}', '${ids.componentScience}', '2026-01-01', 'active'),
        ('assignment-context', '${ids.year}', '${ids.teacherContext}', '${ids.groupB}', '${ids.componentMath}', '2026-01-01', 'active');
      INSERT INTO students (id, external_id, display_name) VALUES
        ('${ids.studentAna}', 'SYNTHETIC-01', 'Ána Clara'),
        ('${ids.studentLoose}', 'SYNTHETIC-02', 'Aluno sem turma');
      INSERT INTO teacher_models (id, school_year_id, teacher_id, state)
        VALUES ('${ids.model}', '${ids.year}', '${ids.teacherAna}', 'connected');
      INSERT INTO teacher_model_versions
        (id, teacher_model_id, version, model_hash, mapping_version, provenance_json)
        VALUES ('${ids.version}', '${ids.model}', 1, '${'a'.repeat(64)}', 1, '{}');
      INSERT INTO cell_mappings
        (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field) VALUES
        ('map-a', '${ids.version}', '2026|${ids.groupA}|${ids.componentMath}|${ids.studentAna}', 's', 'A1', 'NotaT1'),
        ('map-b', '${ids.version}', '2026|${ids.groupA}|${ids.componentScience}|${ids.studentAna}', 's', 'A2', 'NotaT2');
    `);
    repository = new D1BancoNotasSearchRepository(new TestD1(database) as unknown as D1Database);
  });

  afterEach(() => database.close());

  it('normalizes accents, case and spaces while deduplicating canonical contexts', async () => {
    const result = await repository.search({ q: '  ANA   CLARA ', limitPerType: 6 });
    expect(result.normalizedQuery).toBe('ana clara');
    expect(result.results.students.items).toEqual([
      { id: ids.studentAna, displayName: 'Ána Clara', classGroups: ['Turma Árvore'] },
    ]);
  });

  it('ranks exact, prefix, contains and context matches deterministically', async () => {
    const names = (
      await repository.search({ q: 'ana', types: ['teachers'], limitPerType: 6 })
    ).results.teachers.items.map((item) => item.displayName);
    expect(names).toEqual(['Ana', 'Ana Beatriz', 'Professora Ana']);

    const context = await repository.search({
      q: 'matematica',
      types: ['teachers'],
      limitPerType: 6,
    });
    expect(context.results.teachers.items.map((item) => item.displayName)).toEqual([
      'Ana',
      'Professora Célia',
    ]);
  });

  it('returns stable totals and bounded buckets without querying unselected types', async () => {
    const result = await repository.search({ q: 'an', types: ['teachers'], limitPerType: 1 });
    expect(result.results.teachers).toMatchObject({ total: 3, hasMore: true });
    expect(result.results.teachers.items).toHaveLength(1);
    expect(result.results.students).toEqual({ items: [], total: 0, hasMore: false });
    expect(result.results.classGroups).toEqual({ items: [], total: 0, hasMore: false });
  });

  it('finds class groups by context and preserves only safe minimal DTO fields', async () => {
    const result = await repository.search({ q: 'celia', limitPerType: 6 });
    expect(result.results.classGroups.items[0]).toMatchObject({
      id: ids.groupB,
      name: '7º B',
      teachers: ['Professora Célia'],
      components: ['Matemática'],
      acompanhamentoAvailable: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC-|entra|drive|oid|notaT1/iu);
  });

  it('keeps an unassigned student discoverable without inventing a class group', async () => {
    const result = await repository.search({ q: 'sem turma', limitPerType: 6 });
    expect(result.results.students.items).toEqual([
      { id: ids.studentLoose, displayName: 'Aluno sem turma', classGroups: [] },
    ]);
  });
});
