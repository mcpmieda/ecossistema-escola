// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1PendenciasRepository } from '../server/banco-notas/d1-pendencias-repository';
import type { PendingSeverity } from '../shared/banco-notas-pendencias';

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
  teacherA: '22222222-2222-4222-8222-222222222221',
  teacherB: '22222222-2222-4222-8222-222222222222',
  teacherC: '22222222-2222-4222-8222-222222222223',
  teacherD: '22222222-2222-4222-8222-222222222224',
  teacherE: '22222222-2222-4222-8222-222222222225',
  classGroup: '33333333-3333-4333-8333-333333333331',
  component: '44444444-4444-4444-8444-444444444441',
  source: '55555555-5555-4555-8555-555555555551',
};

describe('D1 Central de Pendências repository', () => {
  let database: DatabaseSync;
  let repository: D1PendenciasRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    const migrations = [
      '0001_banco_notas_foundation.sql',
      '0002_banco_notas_cross_year_integrity.sql',
      '0003_banco_notas_import_job_state_machine.sql',
      '0004_banco_notas_import_finding_resolution.sql',
      '0005_banco_notas_import_analysis.sql',
      '0006_banco_notas_import_analysis_profiles.sql',
      '0007_banco_notas_teacher_entra_identity.sql',
      '0008_banco_notas_sync_v1.sql',
    ];
    migrations.forEach((name) =>
      database.exec(
        readFileSync(join(process.cwd(), 'infra/banco-notas/d1/migrations', name), 'utf8'),
      ),
    );
    database.exec(`
      INSERT INTO school_years (id, year, name, starts_on, ends_on, status) VALUES
        ('${ids.year}', 2026, 'Ano 2026', '2026-01-01', '2026-12-31', 'active');
      INSERT INTO teachers (id, display_name, status, entra_object_id) VALUES
        ('${ids.teacherA}', 'Professora Aurora', 'active', 'entra-object-sensitive'),
        ('${ids.teacherB}', 'Professor Bento', 'inactive', NULL),
        ('${ids.teacherC}', 'Professora Célia', 'active', NULL),
        ('${ids.teacherD}', 'Professor Dário', 'active', NULL),
        ('${ids.teacherE}', 'Professora Elisa', 'active', NULL);
      INSERT INTO class_groups (id, school_year_id, name) VALUES
        ('${ids.classGroup}', '${ids.year}', '6º A');
      INSERT INTO components (id, school_year_id, name) VALUES
        ('${ids.component}', '${ids.year}', 'Matemática');
      INSERT INTO data_sources (id, school_year_id, type, name, created_by) VALUES
        ('${ids.source}', '${ids.year}', 'linked_teacher_model', 'Fonte sintética', 'test');
      INSERT INTO teacher_assignments
        (id, school_year_id, teacher_id, class_group_id, component_id, effective_from, status, created_at, updated_at) VALUES
        ('assignment-a', '${ids.year}', '${ids.teacherA}', '${ids.classGroup}', '${ids.component}', '2026-01-01', 'active', '2026-08-28T08:00:00Z', '2026-08-28T08:00:00Z'),
        ('assignment-b', '${ids.year}', '${ids.teacherB}', '${ids.classGroup}', '${ids.component}', '2026-01-01', 'active', '2026-08-28T09:00:00Z', '2026-08-28T09:00:00Z'),
        ('assignment-c', '${ids.year}', '${ids.teacherC}', '${ids.classGroup}', '${ids.component}', '2026-01-01', 'active', '2026-08-28T10:00:00Z', '2026-08-28T10:00:00Z'),
        ('assignment-e', '${ids.year}', '${ids.teacherE}', '${ids.classGroup}', '${ids.component}', '2026-01-01', 'active', '2026-08-28T11:00:00Z', '2026-08-28T11:00:00Z');
      INSERT INTO source_assignments
        (id, school_year_id, data_source_id, teacher_id, scope, authority, effective_from, operator_id, reason, updated_at) VALUES
        ('source-a', '${ids.year}', '${ids.source}', '${ids.teacherA}', 'teacher_override', 'authoritative', '2026-01-01', 'test', 'fixture sintética', '2026-08-28T08:00:00Z');
      INSERT INTO teacher_models
        (id, school_year_id, teacher_id, state, sync_enabled, drive_item_id, created_at, updated_at) VALUES
        ('model-a', '${ids.year}', '${ids.teacherA}', 'connected', 0, 'drive-sensitive', '2026-08-28T08:00:00Z', '2026-08-28T08:00:00Z'),
        ('model-c', '${ids.year}', '${ids.teacherC}', 'validated', 0, NULL, '2026-08-28T10:00:00Z', '2026-08-28T10:00:00Z'),
        ('model-d', '${ids.year}', '${ids.teacherD}', 'draft', 0, NULL, '2026-08-28T12:00:00Z', '2026-08-28T12:00:00Z'),
        ('model-e', '${ids.year}', '${ids.teacherE}', 'suspended', 0, NULL, '2026-08-28T13:00:00Z', '2026-08-28T14:00:00Z');
      INSERT INTO import_jobs
        (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, state, provenance_json, requested_by, created_at, updated_at) VALUES
        ('job-failed', '${ids.year}', '${ids.teacherA}', '${ids.source}', 'failed-key', 'failed-hash', 'failed', '{}', 'test', '2026-08-28T07:00:00Z', '2026-08-28T15:00:00Z'),
        ('job-draft', '${ids.year}', '${ids.teacherA}', '${ids.source}', 'draft-key', 'draft-hash', 'draft', '{}', 'test', '2026-08-28T06:00:00Z', '2026-08-28T06:00:00Z');
      INSERT INTO import_findings
        (id, import_job_id, severity, code, location_json, details_json, created_at) VALUES
        ('finding-error', 'job-failed', 'error', 'COLUNA_INVALIDA', '{}', '{}', '2026-08-28T16:00:00Z'),
        ('finding-warning', 'job-failed', 'warning', 'CAMPO_AUSENTE', '{}', '{}', '2026-08-28T15:30:00Z'),
        ('finding-info', 'job-failed', 'info', 'FORMATO_RECONHECIDO', '{}', '{}', '2026-08-28T15:20:00Z'),
        ('finding-resolved', 'job-failed', 'warning', 'JA_RESOLVIDO', '{}', '{}', '2026-08-28T15:10:00Z');
      INSERT INTO import_finding_resolutions
        (id, import_finding_id, resolved_by, reason, resolved_at) VALUES
        ('resolution-1', 'finding-resolved', 'test', 'fixture', '2026-08-28T17:00:00Z');
    `);
    database.exec('PRAGMA foreign_keys = OFF;');
    database.exec(`
      INSERT INTO teacher_assignments
        (id, school_year_id, teacher_id, class_group_id, component_id, effective_from, status, created_at, updated_at) VALUES
        ('assignment-orphan', '${ids.year}', 'missing-teacher', '${ids.classGroup}', '${ids.component}', '2026-01-01', 'active', '2026-08-28T17:00:00Z', '2026-08-28T17:00:00Z');
    `);
    database.exec('PRAGMA foreign_keys = ON;');
    repository = new D1PendenciasRepository(new TestD1(database) as unknown as D1Database);
  });

  afterEach(() => database.close());

  it('summarizes factual error, warning and information items without technical PII', async () => {
    const summary = await repository.summary({});
    expect(summary).toMatchObject({ total: 16, error: 4, warning: 8, info: 4 });
    expect(summary.filters.schoolYears).toEqual([{ id: ids.year, label: 'Ano 2026' }]);

    const result = await repository.list({ page: 1, pageSize: 100 });
    expect(new Set(result.items.map((item) => item.id)).size).toBe(result.items.length);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('entra-object-sensitive');
    expect(serialized).not.toContain('drive-sensitive');
    expect(serialized).not.toMatch(/entra_object_id|drive_item_id|recipient_upn/iu);
  });

  it('orders severity and recency deterministically and excludes resolved findings', async () => {
    const result = await repository.list({ page: 1, pageSize: 100 });
    const order: Record<PendingSeverity, number> = { error: 0, warning: 1, info: 2 };
    expect(result.items.map((item) => order[item.severity])).toEqual(
      [...result.items.map((item) => order[item.severity])].sort((a, b) => a - b),
    );
    expect(result.items.map((item) => item.id)).not.toContain('finding_warning:finding-resolved');
    expect(result.items.filter((item) => item.severity === 'error')[0]?.id).toBe(
      'orphan_assignment:assignment-orphan',
    );
  });

  it('filters on the server by context, kind, severity and text and paginates', async () => {
    await expect(
      repository.list({
        teacherId: ids.teacherB,
        severity: 'warning',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ total: 3 });
    const type = await repository.list({
      schoolYearId: ids.year,
      classGroupId: ids.classGroup,
      componentId: ids.component,
      kind: 'source_missing',
      status: 'open',
      q: 'Bento',
      page: 1,
      pageSize: 1,
    });
    expect(type).toMatchObject({ total: 1, totalPages: 1 });
    expect(type.items[0]).toMatchObject({
      kind: 'source_missing',
      teacher: { id: ids.teacherB, label: 'Professor Bento' },
      classGroup: { id: ids.classGroup, label: '6º A' },
    });
  });

  it('returns a stable detail with safe evidence and contextual navigation', async () => {
    const item = await repository.detail('source_missing:assignment-b');
    expect(item).toMatchObject({
      severity: 'warning',
      status: 'open',
      title: 'Fonte autoritativa ausente',
      origin: 'Atribuição ativa sem autoridade vigente',
    });
    expect(item?.contextLinks.map((link) => link.kind)).toEqual([
      'professor',
      'turma',
      'acompanhamento',
    ]);
    await expect(repository.detail('finding_error:missing')).resolves.toBeNull();
  });

  it('exposes conflict, failed and stale sync facts without grade values', async () => {
    database.exec(`INSERT INTO sync_attempts
      (attempt_id,request_id,payload_hash,teacher_model_id,actor_id,status,change_count,conflict_count,reason_code,result_json,duration_ms)
      VALUES
      ('attempt-conflict','sync-conflict','hash','model-a','${ids.teacherA}','conflict',1,1,'CONFLICT','{}',12),
      ('attempt-conflict-null','sync-conflict-null','hash','model-a','${ids.teacherA}','conflict',1,1,NULL,'{}',13),
      ('attempt-failed','sync-failed','hash','model-a','${ids.teacherA}','failed',2,1,'INTERNAL_ERROR','{}',18),
      ('attempt-stale','sync-stale','hash','model-a','${ids.teacherA}','conflict',1,1,'BASELINE_STALE','{}',9),
      ('attempt-recovered-failed','sync-recovered','hash','model-a','${ids.teacherA}','failed',1,1,'INTERNAL_ERROR','{}',10),
      ('attempt-recovered-committed','sync-recovered','hash','model-a','${ids.teacherA}','committed',1,0,NULL,'{}',11)`);
    const result = await repository.list({ page: 1, pageSize: 100 });
    expect(result.items.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['sync_conflict', 'sync_failed', 'sync_rejected_stale']),
    );
    const syncItems = result.items.filter((item) => item.kind.startsWith('sync_'));
    expect(syncItems.map((item) => item.id)).toContain('sync_conflict:sync-conflict-null');
    expect(syncItems.map((item) => item.id)).not.toContain('sync_failed:sync-recovered');
    expect(JSON.stringify(syncItems)).not.toMatch(/value_numeric|value_text|valueAfter/iu);
  });
});
