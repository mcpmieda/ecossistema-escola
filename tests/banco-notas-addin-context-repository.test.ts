// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1BancoNotasAddinContextRepository } from '../server/banco-notas/d1-addin-context-repository';

const root = process.cwd();
const migrations = [
  '0001_banco_notas_foundation.sql',
  '0007_banco_notas_teacher_entra_identity.sql',
  '0008_banco_notas_sync_v1.sql',
].map((name) => readFileSync(join(root, 'infra/banco-notas/d1/migrations', name), 'utf8'));

class Prepared {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
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
  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new Prepared(this.database.prepare(sql));
  }
}

const ids = {
  year: '11111111-1111-4111-8111-111111111111',
  teacher: '22222222-2222-4222-8222-222222222222',
  classGroup: '33333333-3333-4333-8333-333333333333',
  component: '44444444-4444-4444-8444-444444444444',
  student: '55555555-5555-4555-8555-555555555555',
  source: '66666666-6666-4666-8666-666666666666',
  model: '77777777-7777-4777-8777-777777777777',
  version: '88888888-8888-4888-8888-888888888888',
  workbookModel: '99999999-9999-4999-8999-999999999999',
  relationship: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  oid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
const sourceHash = 'c'.repeat(64);

const query = {
  workbookModelId: ids.workbookModel,
  sourceHash,
  relationshipSnapshotId: ids.relationship,
  definitionVersion: 'definition-v1',
  layoutVersion: 'layout-v1',
  mappingVersion: 2,
  schoolYear: 2026,
  sheetKey: 'sheet-matematica',
} as const;

function seed(database: DatabaseSync) {
  const gradeKey = `2026|${ids.classGroup}|${ids.component}|${ids.student}`;
  database.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
      VALUES ('${ids.year}', 2026, 'Ano 2026', '2026-01-01', '2026-12-31');
    INSERT INTO teachers (id, display_name, status, entra_object_id)
      VALUES ('${ids.teacher}', 'Professor Sintético', 'active', '${ids.oid}');
    INSERT INTO class_groups (id, school_year_id, name)
      VALUES ('${ids.classGroup}', '${ids.year}', '2º Ano A');
    INSERT INTO components (id, school_year_id, name)
      VALUES ('${ids.component}', '${ids.year}', 'Matemática');
    INSERT INTO students (id, display_name) VALUES ('${ids.student}', 'Estudante Sintético 01');
    INSERT INTO teacher_assignments
      (id, school_year_id, teacher_id, class_group_id, component_id, effective_from, effective_to, status)
      VALUES ('assignment-context', '${ids.year}', '${ids.teacher}', '${ids.classGroup}', '${ids.component}', '2026-01-01', '2026-12-31', 'active');
    INSERT INTO data_sources (id, school_year_id, type, name, environment, created_by)
      VALUES ('${ids.source}', '${ids.year}', 'linked_teacher_model', 'Fonte sintética', 'homologation', 'test');
    INSERT INTO source_assignments
      (id, school_year_id, data_source_id, scope, authority, status, sync_enabled, effective_from, effective_to, operator_id, reason)
      VALUES ('authority-context', '${ids.year}', '${ids.source}', 'school_year_default', 'authoritative', 'active', 0, '2026-01-01', '2026-12-31', 'test', 'fixture');
    INSERT INTO teacher_models
      (id, school_year_id, teacher_id, state, sync_enabled, environment, updated_at)
      VALUES ('${ids.model}', '${ids.year}', '${ids.teacher}', 'connected', 0, 'homologation', '2026-08-29T01:00:00Z');
    INSERT INTO teacher_model_versions
      (id, teacher_model_id, version, model_hash, mapping_version, provenance_json)
      VALUES ('${ids.version}', '${ids.model}', 3, '${'d'.repeat(64)}', 2,
        json_object(
          'workbookModelId', '${ids.workbookModel}',
          'sourceHash', '${sourceHash}',
          'relationshipSnapshotId', '${ids.relationship}',
          'definitionVersion', 'definition-v1',
          'layoutVersion', 'layout-v1'
        ));
    INSERT INTO cell_mappings
      (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field)
      VALUES
        ('mapping-zero', '${ids.version}', '${gradeKey}', 'sheet-matematica', 'F12', 'NotaT1'),
        ('mapping-absent', '${ids.version}', '${gradeKey}', 'sheet-matematica', 'G12', 'NotaT2'),
        ('mapping-unknown', '${ids.version}', '${gradeKey}', 'sheet-matematica', 'H12', 'NotaT3');
    INSERT INTO grade_events
      (id, idempotency_key, payload_hash, correlation_id, event_type, status, grade_key, field,
       source_id, teacher_model_id, sequence, value_numeric, value_text, is_absent, provenance_json, occurred_at)
      VALUES
        ('event-zero', 'idem-zero', 'hash-zero', 'corr-zero', 'grade.changed', 'applied', '${gradeKey}', 'NotaT1', '${ids.source}', '${ids.model}', 1, 0, NULL, 0, '{}', '2026-08-29T01:10:00Z'),
        ('event-absent', 'idem-absent', 'hash-absent', 'corr-absent', 'grade.changed', 'applied', '${gradeKey}', 'NotaT2', '${ids.source}', '${ids.model}', 1, NULL, NULL, 1, '{}', '2026-08-29T01:20:00Z');
    INSERT INTO grade_snapshots
      (grade_key, field, event_id, source_id, sequence, value_numeric, value_text, is_absent, updated_at)
      VALUES
        ('${gradeKey}', 'NotaT1', 'event-zero', '${ids.source}', 1, 0, NULL, 0, '2026-08-29T01:10:00Z'),
        ('${gradeKey}', 'NotaT2', 'event-absent', '${ids.source}', 1, NULL, NULL, 1, '2026-08-29T01:20:00Z');
  `);
}

describe('Banco de Notas cotidiano add-in context repository', () => {
  let database: DatabaseSync;
  let repository: D1BancoNotasAddinContextRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    migrations.forEach((migration) => database.exec(migration));
    seed(database);
    repository = new D1BancoNotasAddinContextRepository(
      new TestD1(database) as unknown as D1Database,
    );
  });

  afterEach(() => database.close());

  it('returns owned minimal context, exact mapping and sync-off as a normal warning', async () => {
    const result = await repository.context(query, ids.oid);
    expect(result).toMatchObject({
      teacher: { label: 'Professor Sintético' },
      schoolYear: { label: 'Ano 2026' },
      assignment: { classGroupLabel: '2º Ano A', componentLabel: 'Matemática' },
      model: { version: 3, mappingVersion: 2, state: 'connected' },
      syncEnabled: false,
      lastActivityAt: '2026-08-29T01:20:00.000Z',
      preflight: {
        status: 'warning',
        reasons: ['baseline_unavailable', 'sync_disabled_by_administration'],
      },
    });
    expect(result?.mappings).toEqual([
      expect.objectContaining({
        cellAddress: 'F12',
        known: true,
        knownValue: 0,
        knownAbsent: false,
      }),
      expect.objectContaining({
        cellAddress: 'G12',
        known: true,
        knownValue: null,
        knownAbsent: true,
      }),
      expect.objectContaining({ cellAddress: 'H12', known: false }),
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/teacher_model_id|entra_object_id|workbookModelId|sourceHash/iu);
  });

  it('fails closed for ownership denial and unknown workbook identity', async () => {
    await expect(
      repository.context(query, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repository.context({ ...query, sourceHash: 'e'.repeat(64) }, ids.oid),
    ).resolves.toBeNull();
  });

  it('blocks suspended models, missing assignments and missing authority with structured reasons', async () => {
    database.exec(`
      UPDATE teacher_models SET state = 'suspended' WHERE id = '${ids.model}';
      UPDATE teacher_assignments SET status = 'inactive';
      UPDATE source_assignments SET status = 'inactive';
    `);
    const result = await repository.context(query, ids.oid);
    expect(result?.preflight.status).toBe('blocked');
    expect(result?.preflight.reasons).toEqual([
      'model_suspended',
      'assignment_missing',
      'authoritative_source_missing',
      'baseline_unavailable',
      'sync_disabled_by_administration',
    ]);
  });

  it('does not treat an enabled model alone as permission to synchronize', async () => {
    database.exec(`UPDATE teacher_models SET sync_enabled = 1 WHERE id = '${ids.model}';`);
    const result = await repository.context(query, ids.oid);
    expect(result?.syncEnabled).toBe(false);
    expect(result?.pending).toContainEqual(
      expect.objectContaining({ code: 'sync_disabled_by_administration', severity: 'info' }),
    );
  });

  it('enables the add-in action only when global, route, pilot, source and baseline gates pass', async () => {
    const gradeKey = `2026|${ids.classGroup}|${ids.component}|${ids.student}`;
    database.exec(`
      UPDATE teacher_models SET sync_enabled=1 WHERE id='${ids.model}';
      UPDATE source_assignments SET sync_enabled=1 WHERE id='authority-context';
      UPDATE sync_configuration SET sync_enabled=1,commit_route_enabled=1 WHERE id='global';
      INSERT INTO sync_pilot_eligibility(teacher_model_id,enabled,approved_by,reason)
        VALUES('${ids.model}',1,'test','synthetic pilot');
      INSERT INTO grade_events
        (id,idempotency_key,payload_hash,correlation_id,event_type,status,grade_key,field,source_id,teacher_model_id,sequence,value_numeric,is_absent,provenance_json,occurred_at)
        VALUES('event-third','idem-third','hash-third','corr-third','grade.changed','applied','${gradeKey}','NotaT3','${ids.source}','${ids.model}',1,7,0,'{}','2026-08-29T01:30:00Z');
      INSERT INTO grade_snapshots(grade_key,field,event_id,source_id,sequence,value_numeric,is_absent,updated_at)
        VALUES('${gradeKey}','NotaT3','event-third','${ids.source}',1,7,0,'2026-08-29T01:30:00Z');
    `);
    await expect(repository.context(query, ids.oid)).resolves.toMatchObject({
      syncEnabled: true,
      preflight: { status: 'ready', reasons: [] },
      mappings: [
        expect.objectContaining({ baselineEventId: 'event-zero', baselineSequence: 1 }),
        expect.objectContaining({ baselineEventId: 'event-absent', baselineSequence: 1 }),
        expect.objectContaining({ baselineEventId: 'event-third', baselineSequence: 1 }),
      ],
    });
    database.exec(
      `UPDATE sync_pilot_eligibility SET enabled=0 WHERE teacher_model_id='${ids.model}'`,
    );
    await expect(repository.context(query, ids.oid)).resolves.toMatchObject({
      syncEnabled: false,
      preflight: { status: 'warning', reasons: ['sync_disabled_by_administration'] },
    });
  });

  it('normalizes pilot bounds and preserves teacher-source precedence in the UI gate', async () => {
    database.exec(`
      UPDATE teacher_models SET sync_enabled=1 WHERE id='${ids.model}';
      UPDATE source_assignments SET sync_enabled=1,scope='teacher_override',teacher_id='${ids.teacher}'
        WHERE id='authority-context';
      UPDATE sync_configuration SET sync_enabled=1,commit_route_enabled=1 WHERE id='global';
      INSERT INTO sync_pilot_eligibility(teacher_model_id,enabled,starts_at,expires_at,approved_by,reason)
        VALUES('${ids.model}',1,
          strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 minute'),
          strftime('%Y-%m-%dT%H:%M:%SZ','now','+1 minute'),'test','iso pilot');
      INSERT INTO data_sources(id,school_year_id,type,name,environment,status,created_by)
        VALUES('global-source','${ids.year}','linked_teacher_model','Global','homologation','active','test');
      INSERT INTO source_assignments(id,school_year_id,data_source_id,scope,authority,status,sync_enabled,effective_from,operator_id,reason)
        VALUES('global-authority','${ids.year}','global-source','school_year_default','authoritative','active',1,'2026-01-01','test','fallback');
      UPDATE data_sources SET status='inactive' WHERE id='${ids.source}';
    `);
    await expect(repository.context(query, ids.oid)).resolves.toMatchObject({
      syncEnabled: false,
      preflight: {
        reasons: expect.arrayContaining(['authoritative_source_missing']),
      },
    });
    database.exec(`UPDATE data_sources SET status='active' WHERE id='${ids.source}'`);
    await expect(repository.context(query, ids.oid)).resolves.toMatchObject({
      syncEnabled: true,
      preflight: { reasons: ['baseline_unavailable'] },
    });
  });
});
