// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1ProfessoresRepository } from '../server/banco-notas/d1-professores-repository';

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
  year2026: '11111111-1111-4111-8111-111111111111',
  year2025: '11111111-1111-4111-8111-111111111112',
  ana: '22222222-2222-4222-8222-222222222221',
  bruno: '22222222-2222-4222-8222-222222222222',
  carla: '22222222-2222-4222-8222-222222222223',
  davi: '22222222-2222-4222-8222-222222222224',
  ema: '22222222-2222-4222-8222-222222222225',
  groupA: '33333333-3333-4333-8333-333333333331',
  groupB: '33333333-3333-4333-8333-333333333332',
  groupOld: '33333333-3333-4333-8333-333333333333',
  componentMath: '44444444-4444-4444-8444-444444444441',
  componentScience: '44444444-4444-4444-8444-444444444442',
  componentOld: '44444444-4444-4444-8444-444444444443',
  source: '55555555-5555-4555-8555-555555555551',
  modelAna2026: '66666666-6666-4666-8666-666666666661',
  modelAna2025: '66666666-6666-4666-8666-666666666662',
  modelCarla: '66666666-6666-4666-8666-666666666663',
  modelDavi: '66666666-6666-4666-8666-666666666664',
};

describe('D1 Professores repository', () => {
  let database: DatabaseSync;
  let repository: D1ProfessoresRepository;

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
      INSERT INTO school_years (id, year, name, starts_on, ends_on, status) VALUES
        ('${ids.year2026}', 2026, 'Ano 2026', '2026-01-01', '2026-12-31', 'active'),
        ('${ids.year2025}', 2025, 'Ano 2025', '2025-01-01', '2025-12-31', 'closed');
      INSERT INTO teachers (id, display_name, status, entra_object_id) VALUES
        ('${ids.ana}', 'Professora Aurora', 'active', 'entra-object-synthetic'),
        ('${ids.bruno}', 'Professor Bento', 'active', NULL),
        ('${ids.carla}', 'Professora Célia', 'inactive', NULL),
        ('${ids.davi}', 'Professor Dário', 'active', NULL),
        ('${ids.ema}', 'Professora Elisa', 'active', NULL);
      INSERT INTO class_groups (id, school_year_id, name) VALUES
        ('${ids.groupA}', '${ids.year2026}', '6º A'),
        ('${ids.groupB}', '${ids.year2026}', '7º B'),
        ('${ids.groupOld}', '${ids.year2025}', '5º A');
      INSERT INTO components (id, school_year_id, name) VALUES
        ('${ids.componentMath}', '${ids.year2026}', 'Matemática'),
        ('${ids.componentScience}', '${ids.year2026}', 'Ciências'),
        ('${ids.componentOld}', '${ids.year2025}', 'História');
      INSERT INTO teacher_assignments
        (id, school_year_id, teacher_id, class_group_id, component_id, effective_from, status) VALUES
        ('assignment-ana-a', '${ids.year2026}', '${ids.ana}', '${ids.groupA}', '${ids.componentMath}', '2026-01-01', 'active'),
        ('assignment-ana-b', '${ids.year2026}', '${ids.ana}', '${ids.groupB}', '${ids.componentScience}', '2026-01-01', 'active'),
        ('assignment-ana-old', '${ids.year2025}', '${ids.ana}', '${ids.groupOld}', '${ids.componentOld}', '2025-01-01', 'active'),
        ('assignment-carla', '${ids.year2026}', '${ids.carla}', '${ids.groupA}', '${ids.componentScience}', '2026-01-01', 'active'),
        ('assignment-ema', '${ids.year2026}', '${ids.ema}', '${ids.groupB}', '${ids.componentMath}', '2026-01-01', 'active');
      INSERT INTO data_sources (id, school_year_id, type, name, created_by) VALUES
        ('${ids.source}', '${ids.year2026}', 'linked_teacher_model', 'Fonte institucional', 'test');
      INSERT INTO source_assignments
        (id, school_year_id, data_source_id, teacher_id, scope, authority, effective_from, operator_id, reason, updated_at) VALUES
        ('source-ana', '${ids.year2026}', '${ids.source}', '${ids.ana}', 'teacher_override', 'authoritative', '2026-01-01', 'test', 'fixture sintética', '2026-08-28T08:00:00Z');
      INSERT INTO teacher_models
        (id, school_year_id, teacher_id, state, sync_enabled, drive_item_id, last_reconciled_at, updated_at) VALUES
        ('${ids.modelAna2026}', '${ids.year2026}', '${ids.ana}', 'connected', 0, 'drive-synthetic', '2026-08-27T10:00:00Z', '2026-08-27T10:00:00Z'),
        ('${ids.modelAna2025}', '${ids.year2025}', '${ids.ana}', 'draft', 0, NULL, NULL, '2025-06-01T10:00:00Z'),
        ('${ids.modelCarla}', '${ids.year2026}', '${ids.carla}', 'suspended', 0, NULL, NULL, '2026-08-26T10:00:00Z'),
        ('${ids.modelDavi}', '${ids.year2026}', '${ids.davi}', 'draft', 0, NULL, NULL, '2026-08-25T10:00:00Z');
      INSERT INTO teacher_model_versions
        (id, teacher_model_id, version, model_hash, mapping_version, provenance_json) VALUES
        ('version-ana-1', '${ids.modelAna2026}', 1, '${'a'.repeat(64)}', 1, '{}'),
        ('version-ana-2', '${ids.modelAna2026}', 2, '${'b'.repeat(64)}', 2, '{}');
      INSERT INTO import_jobs
        (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, state, provenance_json, requested_by, updated_at) VALUES
        ('job-ana', '${ids.year2026}', '${ids.ana}', '${ids.source}', 'job-ana', 'hash-ana', 'analyzed', '{}', 'test', '2026-08-28T09:00:00Z');
      INSERT INTO import_findings
        (id, import_job_id, severity, code, location_json, details_json, created_at) VALUES
        ('finding-ana', 'job-ana', 'warning', 'COLUNA_INCOMPLETA', '{}', '{}', '2026-08-28T09:05:00Z');
      INSERT INTO reconciliation_runs
        (id, teacher_model_id, status, correlation_id, started_at) VALUES
        ('reconciliation-ana', '${ids.modelAna2026}', 'matched', 'corr-ana', '2026-08-28T10:00:00Z');
      INSERT INTO grade_events
        (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field, source_id, teacher_model_id, sequence, value_numeric, is_absent, provenance_json, occurred_at) VALUES
        ('event-ana', 'event-ana', 'hash-event', 'corr-event', 'grade.changed', 'applied', '2026|${ids.groupA}|${ids.componentMath}|student', 'NotaT1', '${ids.source}', '${ids.modelAna2026}', 1, 8, 0, '{}', '2026-08-28T11:00:00Z');
    `);
    repository = new D1ProfessoresRepository(new TestD1(database) as unknown as D1Database);
  });

  afterEach(() => database.close());

  it('lists canonical teachers once with stable aggregates and operational attention', async () => {
    const result = await repository.list({ page: 1, pageSize: 20 });
    expect(result.total).toBe(5);
    const ana = result.items.find((item) => item.id === ids.ana);
    expect(ana).toMatchObject({
      displayName: 'Professora Aurora',
      identityState: 'linked',
      classGroups: 3,
      components: 3,
      assignments: 3,
      models: 2,
      connectedModels: 1,
      openFindings: 1,
      attentionLevel: 'warning',
      lastActivityAt: '2026-08-28T11:00:00Z',
    });
    expect(ana?.modelStates).toEqual(expect.arrayContaining(['connected', 'draft']));
    expect(result.items.find((item) => item.id === ids.bruno)).toMatchObject({
      assignments: 0,
      models: 0,
      identityState: 'missing',
      attentionLevel: 'info',
      attentionReasons: ['Sem atribuição no período selecionado'],
    });
    expect(result.items.find((item) => item.id === ids.carla)).toMatchObject({
      attentionLevel: 'error',
    });
    expect(result.items.find((item) => item.id === ids.davi)?.attentionReasons).toContain(
      'Modelo sem atribuição no período',
    );
  });

  it('paginates and applies every supported filter on the server', async () => {
    await expect(repository.list({ page: 1, pageSize: 2 })).resolves.toMatchObject({
      page: 1,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
    const result = await repository.list({
      schoolYearId: ids.year2026,
      status: 'active',
      classGroupId: ids.groupA,
      componentId: ids.componentMath,
      identity: 'linked',
      modelState: 'connected',
      assignment: 'with',
      attention: 'needs_attention',
      q: 'aurora',
      page: 1,
      pageSize: 20,
    });
    expect(result.items.map((item) => item.id)).toEqual([ids.ana]);
    const missing = await repository.list({
      schoolYearId: ids.year2026,
      modelState: 'missing',
      page: 1,
      pageSize: 20,
    });
    expect(missing.items.map((item) => item.id)).toContain(ids.ema);
    const without = await repository.list({
      schoolYearId: ids.year2026,
      assignment: 'without',
      attention: 'normal',
      page: 1,
      pageSize: 20,
    });
    expect(without.items.map((item) => item.id)).toContain(ids.bruno);
  });

  it('returns filters and factual diagnostics without fixing inconsistencies', async () => {
    const filters = await repository.filters();
    expect(filters.schoolYears).toHaveLength(2);
    expect(filters.classGroups).toHaveLength(3);
    expect(filters.components).toHaveLength(3);
    expect(filters.diagnostics).toEqual({
      orphanAssignments: 0,
      modelsWithoutAssignments: 1,
      inactiveTeachersWithActiveAssignments: 1,
      assignmentsWithoutSource: 3,
    });
  });

  it('details assignments, latest model version, safe identity, findings and factual activity', async () => {
    const detail = await repository.detail(ids.ana, { schoolYearId: ids.year2026 });
    expect(detail?.summary).toEqual({
      classGroups: 2,
      components: 2,
      assignments: 2,
      models: 1,
      connectedModels: 1,
      openFindings: 1,
    });
    expect(detail?.contexts).toHaveLength(2);
    expect(detail?.contexts[0]).toMatchObject({
      modelState: 'connected',
      modelVersion: 2,
      sourceName: 'Fonte institucional',
      modelSyncEnabled: false,
    });
    expect(detail?.models[0]).toMatchObject({
      currentVersion: 2,
      fileAvailable: true,
      syncEnabled: false,
    });
    expect(detail?.pending[0]).toMatchObject({ code: 'COLUNA_INCOMPLETA', status: 'open' });
    expect(detail?.activity.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['grade', 'reconciliation', 'import', 'model', 'source']),
    );
    expect(JSON.stringify(detail)).not.toContain('entra-object-synthetic');
    expect(JSON.stringify(detail)).not.toContain('drive-synthetic');
  });

  it('keeps a teacher without assignments visible and returns null for an unknown teacher', async () => {
    await expect(repository.detail(ids.bruno, {})).resolves.toMatchObject({
      teacher: { identityState: 'missing', attentionLevel: 'info' },
      contexts: [],
      models: [],
    });
    await expect(repository.detail('ffffffff-ffff-4fff-8fff-ffffffffffff', {})).resolves.toBeNull();
  });
});
