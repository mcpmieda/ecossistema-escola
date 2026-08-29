// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1BancoNotasSyncService } from '../server/banco-notas/d1-sync-service';
import type { SyncCommitRequest, SyncPreflightRequest } from '../shared/banco-notas-sync';

class Prepared {
  private values: SQLInputValue[] = [];
  constructor(private readonly s: StatementSync) {}
  bind(...v: SQLInputValue[]) {
    this.values = v;
    return this;
  }
  async first<T>() {
    return (this.s.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return { results: this.s.all(...this.values) as T[] };
  }
  async run() {
    return this.s.run(...this.values);
  }
}
class D1 {
  prepareCount = 0;
  constructor(readonly database: DatabaseSync) {}
  prepare(sql: string) {
    this.prepareCount += 1;
    return new Prepared(this.database.prepare(sql));
  }
  async batch(ss: Prepared[]) {
    this.database.exec('BEGIN');
    try {
      const r = [];
      for (const s of ss) r.push(await s.run());
      this.database.exec('COMMIT');
      return r;
    } catch (e) {
      this.database.exec('ROLLBACK');
      throw e;
    }
  }
}

const ids = {
  year: '11111111-1111-4111-8111-111111111111',
  teacher: '22222222-2222-4222-8222-222222222222',
  class: '33333333-3333-4333-8333-333333333333',
  component: '44444444-4444-4444-8444-444444444444',
  student: '55555555-5555-4555-8555-555555555555',
  assignment: '66666666-6666-4666-8666-666666666666',
  source: '77777777-7777-4777-8777-777777777777',
  sourceAssignment: '88888888-8888-4888-8888-888888888888',
  model: '99999999-9999-4999-8999-999999999999',
  version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  mapping: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  baseline: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  oid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  request: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};
const gradeKey = `2026|${ids.class}|${ids.component}|${ids.student}`;
let db: DatabaseSync;
let service: D1BancoNotasSyncService;
let runtime: D1;
const migrations = [
  '0001_banco_notas_foundation.sql',
  '0007_banco_notas_teacher_entra_identity.sql',
  '0008_banco_notas_sync_v1.sql',
];
function seed() {
  db.exec(`INSERT INTO school_years(id,year,name,status,starts_on,ends_on) VALUES('${ids.year}',2026,'2026','active','2026-01-01','2026-12-31');
  INSERT INTO teachers(id,display_name,status,entra_object_id) VALUES('${ids.teacher}','Professor','active','${ids.oid}');
  INSERT INTO class_groups(id,school_year_id,name) VALUES('${ids.class}','${ids.year}','Turma');
  INSERT INTO components(id,school_year_id,name) VALUES('${ids.component}','${ids.year}','Matemática');
  INSERT INTO students(id,display_name) VALUES('${ids.student}','Aluno');
  INSERT INTO teacher_assignments(id,school_year_id,teacher_id,class_group_id,component_id,effective_from,status) VALUES('${ids.assignment}','${ids.year}','${ids.teacher}','${ids.class}','${ids.component}','2026-01-01','active');
  INSERT INTO data_sources(id,school_year_id,type,name,environment,status,created_by) VALUES('${ids.source}','${ids.year}','linked_teacher_model','Modelo','production','active','test');
  INSERT INTO source_assignments(id,school_year_id,data_source_id,teacher_id,scope,authority,status,sync_enabled,effective_from,operator_id,reason) VALUES('${ids.sourceAssignment}','${ids.year}','${ids.source}','${ids.teacher}','teacher_override','authoritative','active',1,'2026-01-01','test','pilot');
  INSERT INTO teacher_models(id,school_year_id,teacher_id,state,sync_enabled,environment) VALUES('${ids.model}','${ids.year}','${ids.teacher}','connected',1,'production');
  INSERT INTO teacher_model_versions(id,teacher_model_id,version,model_hash,mapping_version,provenance_json) VALUES('${ids.version}','${ids.model}',1,'hash',1,'{"workbookModelId":"12111111-1111-4111-8111-111111111111","sourceHash":"${'a'.repeat(64)}","relationshipSnapshotId":"13111111-1111-4111-8111-111111111111","definitionVersion":"1","layoutVersion":"1"}');
  INSERT INTO cell_mappings(id,teacher_model_version_id,grade_key,sheet_key,cell_address,field) VALUES('${ids.mapping}','${ids.version}','${gradeKey}','sheet-1','B2','NotaT1');
  INSERT INTO grade_events(id,idempotency_key,payload_hash,correlation_id,event_type,status,grade_key,field,source_id,teacher_model_id,sequence,value_numeric,is_absent,provenance_json,occurred_at,received_at) VALUES('${ids.baseline}','baseline','hash','${ids.baseline}','grade.changed','applied','${gradeKey}','NotaT1','${ids.source}','${ids.model}',1,7,0,'{}','2026-08-29T00:00:00Z','2026-08-29T00:00:00Z');
  INSERT INTO grade_snapshots(grade_key,field,event_id,source_id,sequence,value_numeric,is_absent,updated_at) VALUES('${gradeKey}','NotaT1','${ids.baseline}','${ids.source}',1,7,0,'2026-08-29T00:00:00Z');
  UPDATE sync_configuration SET sync_enabled=1,commit_route_enabled=1 WHERE id='global';
  INSERT INTO sync_pilot_eligibility(teacher_model_id,enabled,approved_by,reason) VALUES('${ids.model}',1,'test','pilot');`);
}
function request(requestId = ids.request): SyncPreflightRequest {
  return {
    schemaVersion: 1,
    requestId,
    workbook: {
      workbookModelId: '12111111-1111-4111-8111-111111111111',
      sourceHash: 'a'.repeat(64),
      relationshipSnapshotId: '13111111-1111-4111-8111-111111111111',
      definitionVersion: '1',
      layoutVersion: '1',
      mappingVersion: 1,
      schoolYear: 2026,
      sheetKey: 'sheet-1',
    },
    changes: [
      {
        cellAddress: 'B2',
        field: 'NotaT1',
        baselineEventId: ids.baseline,
        baselineSequence: 1,
        valueAfter: 8,
        isAbsent: false,
      },
    ],
  };
}
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const m of migrations)
    db.exec(readFileSync(join(process.cwd(), 'infra/banco-notas/d1/migrations', m), 'utf8'));
  seed();
  runtime = new D1(db);
  service = new D1BancoNotasSyncService(runtime as unknown as D1Database);
});
afterEach(() => db.close());

describe('Banco de Notas Sync V1', () => {
  it('commits atomically and returns the prior logical result on retry', async () => {
    const pre = await service.preflight(request(), ids.oid);
    expect(pre.status).toBe('ready');
    const body = {
      ...request(),
      preflightFingerprint: pre.preflightFingerprint!,
    } satisfies SyncCommitRequest;
    expect((await service.commit(body, ids.oid)).status).toBe('committed');
    expect((await service.commit(body, ids.oid)).status).toBe('duplicate');
    expect((db.prepare('SELECT count(*) n FROM grade_events').get() as { n: number }).n).toBe(2);
    expect(
      (db.prepare('SELECT value_numeric v FROM grade_snapshots').get() as { v: number }).v,
    ).toBe(8);
    expect(
      db.prepare('SELECT actor_id actor FROM sync_attempts WHERE request_id=?').get(ids.request),
    ).toMatchObject({ actor: ids.teacher });
    const provenance = String(
      (
        db
          .prepare('SELECT provenance_json value FROM grade_events WHERE idempotency_key LIKE ?')
          .get(`${ids.request}:%`) as { value: string }
      ).value,
    );
    expect(provenance).toContain(ids.teacher);
    expect(provenance).not.toContain(ids.oid);
    await expect(service.outcome(ids.request, ids.oid)).resolves.toMatchObject({
      status: 'committed',
    });
  });
  it('rejects stale baselines and unauthorized owners', async () => {
    const stale = request();
    stale.changes[0]!.baselineSequence = 2;
    expect((await service.preflight(stale, ids.oid)).reasonCode).toBe('BASELINE_STALE');
    expect(
      (await service.preflight(request(), 'ffffffff-ffff-4fff-8fff-ffffffffffff')).reasonCode,
    ).toBe('OWNERSHIP_DENIED');
    const wrongYear = request();
    wrongYear.workbook.schoolYear = 2027;
    expect((await service.preflight(wrongYear, ids.oid)).reasonCode).toBe('WORKBOOK_MISMATCH');
  });
  it('honors kill switch and pilot default deny', async () => {
    db.exec("UPDATE sync_configuration SET sync_enabled=0 WHERE id='global'");
    expect((await service.preflight(request(), ids.oid)).reasonCode).toBe('SYNC_DISABLED');
    db.exec(
      "UPDATE sync_configuration SET sync_enabled=1 WHERE id='global';DELETE FROM sync_pilot_eligibility",
    );
    expect((await service.preflight(request(), ids.oid)).reasonCode).toBe('PILOT_NOT_ALLOWED');
  });
  it('normalizes ISO 8601 pilot eligibility bounds before comparing them', async () => {
    db.exec(`UPDATE sync_pilot_eligibility
      SET starts_at=strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 minute'),
          expires_at=strftime('%Y-%m-%dT%H:%M:%SZ','now','+1 minute')
      WHERE teacher_model_id='${ids.model}'`);
    expect((await service.preflight(request(), ids.oid)).status).toBe('ready');
    expect((await service.readiness()).items[0]).toMatchObject({ pilotEligible: true });
    db.exec(`UPDATE sync_pilot_eligibility
      SET expires_at=strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 minute')
      WHERE teacher_model_id='${ids.model}'`);
    expect((await service.preflight(request(), ids.oid)).reasonCode).toBe('PILOT_NOT_ALLOWED');
    expect((await service.readiness()).items[0]).toMatchObject({
      status: 'needs_attention',
      reasons: expect.arrayContaining(['PILOT_NOT_ALLOWED']),
      pilotEligible: false,
    });
  });
  it('classifies rollout readiness from canonical facts without guessing a cohort', async () => {
    await expect(service.readiness()).resolves.toMatchObject({
      globalSyncEnabled: true,
      commitRouteEnabled: true,
      counts: { ready: 1, blocked: 0, needsAttention: 0 },
      items: [
        {
          teacherModelId: ids.model,
          schoolYearId: ids.year,
          status: 'ready',
          reasons: [],
          pilotEligible: true,
        },
      ],
    });
    db.exec(`UPDATE teacher_models SET state='suspended' WHERE id='${ids.model}'`);
    const blocked = await service.readiness();
    expect(blocked.counts).toEqual({ ready: 0, blocked: 1, needsAttention: 0 });
    expect(blocked.items[0]).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining(['MODEL_SUSPENDED']),
    });
  });
  it('does not fall back to a global source when an authoritative teacher override exists', async () => {
    db.exec(`INSERT INTO data_sources(id,school_year_id,type,name,environment,status,created_by)
      VALUES('global-source','${ids.year}','linked_teacher_model','Global','production','active','test');
      INSERT INTO source_assignments(id,school_year_id,data_source_id,scope,authority,status,sync_enabled,effective_from,operator_id,reason)
      VALUES('global-assignment','${ids.year}','global-source','school_year_default','authoritative','active',1,'2026-01-01','test','fallback');
      UPDATE data_sources SET status='inactive' WHERE id='${ids.source}'`);
    expect((await service.preflight(request(), ids.oid)).reasonCode).toBe('SOURCE_INVALID');
    expect((await service.readiness()).items[0]).toMatchObject({
      status: 'needs_attention',
      reasons: expect.arrayContaining(['SOURCE_INVALID']),
    });
  });
  it('rejects suspended models, inactive assignments, forged mappings and stale versions', async () => {
    db.exec("UPDATE teacher_models SET state='suspended' WHERE id='" + ids.model + "'");
    expect((await service.preflight(request(), ids.oid)).reasonCode).toBe('MODEL_SUSPENDED');
    db.exec(
      "UPDATE teacher_models SET state='connected';UPDATE teacher_assignments SET status='inactive'",
    );
    expect((await service.preflight(request(), ids.oid)).reasonCode).toBe('ASSIGNMENT_INACTIVE');
    db.exec("UPDATE teacher_assignments SET status='active'");
    const forged = request();
    forged.changes[0]!.cellAddress = 'Z99';
    expect((await service.preflight(forged, ids.oid)).reasonCode).toBe('MAPPING_MISMATCH');
    db.prepare(
      "INSERT INTO teacher_model_versions(id,teacher_model_id,version,model_hash,mapping_version,provenance_json) VALUES(?,?,2,'new-hash',2,'{}')",
    ).run('version-new', ids.model);
    expect((await service.preflight(request(), ids.oid)).reasonCode).toBe('MODEL_VERSION_STALE');
  });
  it('revalidates switches, pilot, source and assignment after preflight', async () => {
    const scenarios: Array<{ mutate: string; reason: string; restore: string }> = [
      {
        mutate: "UPDATE sync_configuration SET sync_enabled=0 WHERE id='global'",
        reason: 'SYNC_DISABLED',
        restore: "UPDATE sync_configuration SET sync_enabled=1 WHERE id='global'",
      },
      {
        mutate: "UPDATE sync_configuration SET commit_route_enabled=0 WHERE id='global'",
        reason: 'SYNC_DISABLED',
        restore: "UPDATE sync_configuration SET commit_route_enabled=1 WHERE id='global'",
      },
      {
        mutate: `UPDATE sync_pilot_eligibility SET enabled=0 WHERE teacher_model_id='${ids.model}'`,
        reason: 'PILOT_NOT_ALLOWED',
        restore: `UPDATE sync_pilot_eligibility SET enabled=1 WHERE teacher_model_id='${ids.model}'`,
      },
      {
        mutate: `UPDATE source_assignments SET status='inactive' WHERE id='${ids.sourceAssignment}'`,
        reason: 'SOURCE_INVALID',
        restore: `UPDATE source_assignments SET status='active' WHERE id='${ids.sourceAssignment}'`,
      },
      {
        mutate: `UPDATE teacher_assignments SET status='inactive' WHERE id='${ids.assignment}'`,
        reason: 'ASSIGNMENT_INACTIVE',
        restore: `UPDATE teacher_assignments SET status='active' WHERE id='${ids.assignment}'`,
      },
    ];
    for (const [index, scenario] of scenarios.entries()) {
      const candidate = request(`30000000-0000-4000-8000-${index.toString().padStart(12, '0')}`);
      const preflight = await service.preflight(candidate, ids.oid);
      expect(preflight.status).toBe('ready');
      db.exec(scenario.mutate);
      const result = await service.commit(
        { ...candidate, preflightFingerprint: preflight.preflightFingerprint! },
        ids.oid,
      );
      expect(result.reasonCode).toBe(scenario.reason);
      db.exec(scenario.restore);
    }
  });
  it('rolls back every event and snapshot when any change in the batch fails', async () => {
    const secondEvent = '40000000-0000-4000-8000-000000000001';
    const secondKey = `2026|${ids.class}|${ids.component}|student-atomic`;
    db.prepare(
      'INSERT INTO cell_mappings(id,teacher_model_version_id,grade_key,sheet_key,cell_address,field) VALUES(?,?,?,?,?,?)',
    ).run('mapping-atomic', ids.version, secondKey, 'sheet-1', 'B3', 'NotaT1');
    db.prepare(
      "INSERT INTO grade_events(id,idempotency_key,payload_hash,correlation_id,event_type,status,grade_key,field,source_id,teacher_model_id,sequence,value_numeric,is_absent,provenance_json,occurred_at,received_at) VALUES(?,?,?,?,'grade.changed','applied',?,'NotaT1',?,?,1,7,0,'{}','2026-08-29T00:00:00Z','2026-08-29T00:00:00Z')",
    ).run(secondEvent, 'baseline-atomic', 'hash', secondEvent, secondKey, ids.source, ids.model);
    db.prepare(
      "INSERT INTO grade_snapshots(grade_key,field,event_id,source_id,sequence,value_numeric,is_absent,updated_at) VALUES(?,'NotaT1',?,?,1,7,0,'2026-08-29T00:00:00Z')",
    ).run(secondKey, secondEvent, ids.source);
    const candidate = request('40000000-0000-4000-8000-000000000002');
    candidate.changes.push({
      cellAddress: 'B3',
      field: 'NotaT1',
      baselineEventId: secondEvent,
      baselineSequence: 1,
      valueAfter: 9,
      isAbsent: false,
    });
    const preflight = await service.preflight(candidate, ids.oid);
    expect(preflight.status).toBe('ready');
    db.exec(`CREATE TRIGGER force_atomic_failure BEFORE INSERT ON grade_events
      WHEN NEW.grade_key='${secondKey}' AND json_extract(NEW.provenance_json,'$.syncVersion')=1
      BEGIN SELECT RAISE(ABORT,'FORCED_ATOMIC_FAILURE'); END`);
    const beforeEvents = Number(
      (db.prepare('SELECT count(*) count FROM grade_events').get() as { count: number }).count,
    );
    const result = await service.commit(
      { ...candidate, preflightFingerprint: preflight.preflightFingerprint! },
      ids.oid,
    );
    expect(result.status).toBe('failed');
    expect(
      Number(
        (db.prepare('SELECT count(*) count FROM grade_events').get() as { count: number }).count,
      ),
    ).toBe(beforeEvents);
    expect(
      db.prepare('SELECT value_numeric value FROM grade_snapshots WHERE grade_key=?').get(gradeKey),
    ).toMatchObject({ value: 7 });
    expect(
      db
        .prepare('SELECT value_numeric value FROM grade_snapshots WHERE grade_key=?')
        .get(secondKey),
    ).toMatchObject({ value: 7 });
    db.exec('DROP TRIGGER force_atomic_failure');
    const recovered = await service.commit(
      { ...candidate, preflightFingerprint: preflight.preflightFingerprint! },
      ids.oid,
    );
    expect(recovered.status).toBe('committed');
    expect(
      db
        .prepare('SELECT status FROM sync_attempts WHERE request_id=? ORDER BY status')
        .all(candidate.requestId),
    ).toEqual([{ status: 'committed' }, { status: 'failed' }]);
    expect(await service.outcome(candidate.requestId, ids.oid)).toMatchObject({
      status: 'committed',
    });
  });
  it('serializes competing writes and absorbs an exact retry storm', async () => {
    const first = request('50000000-0000-4000-8000-000000000001');
    const second = request('50000000-0000-4000-8000-000000000002');
    const firstPreflight = await service.preflight(first, ids.oid);
    const secondPreflight = await service.preflight(second, ids.oid);
    const firstBody = {
      ...first,
      preflightFingerprint: firstPreflight.preflightFingerprint!,
    } satisfies SyncCommitRequest;
    expect((await service.commit(firstBody, ids.oid)).status).toBe('committed');
    const competing = await service.commit(
      { ...second, preflightFingerprint: secondPreflight.preflightFingerprint! },
      ids.oid,
    );
    expect(competing).toMatchObject({ status: 'conflict', reasonCode: 'BASELINE_STALE' });
    const retries = await Promise.all(
      Array.from({ length: 25 }, () => service.commit(firstBody, ids.oid)),
    );
    expect(retries.every((item) => item.status === 'duplicate')).toBe(true);
    expect(
      Number(
        (
          db.prepare('SELECT count(*) count FROM sync_attempt_invocations').get() as {
            count: number;
          }
        ).count,
      ),
    ).toBe(25);
    expect((await service.listAttempts({ status: 'duplicate', limit: 50 })).length).toBe(25);
    expect(
      Number(
        (db.prepare('SELECT count(*) count FROM grade_events').get() as { count: number }).count,
      ),
    ).toBe(2);
    expect(
      db
        .prepare('SELECT teacher_model_id model FROM sync_attempts WHERE request_id=?')
        .get(second.requestId),
    ).toMatchObject({ model: ids.model });
  });
  it('commits the required 25-student synthetic pilot corpus end to end', async () => {
    const candidate = request('60000000-0000-4000-8000-000000000000');
    for (let index = 1; index < 25; index += 1) {
      const suffix = index.toString(16).padStart(12, '0');
      const studentId = `60000000-0000-4000-8000-${suffix}`;
      const eventId = `61000000-0000-4000-8000-${suffix}`;
      const key = `2026|${ids.class}|${ids.component}|${studentId}`;
      const cell = `B${index + 2}`;
      db.prepare('INSERT INTO students(id,display_name) VALUES(?,?)').run(
        studentId,
        `Estudante Sintético ${String(index + 1).padStart(2, '0')}`,
      );
      db.prepare(
        'INSERT INTO cell_mappings(id,teacher_model_version_id,grade_key,sheet_key,cell_address,field) VALUES(?,?,?,?,?,?)',
      ).run(`synthetic-mapping-${index}`, ids.version, key, 'sheet-1', cell, 'NotaT1');
      db.prepare(
        "INSERT INTO grade_events(id,idempotency_key,payload_hash,correlation_id,event_type,status,grade_key,field,source_id,teacher_model_id,sequence,value_numeric,is_absent,provenance_json,occurred_at,received_at) VALUES(?,?,?,?,'grade.changed','applied',?,'NotaT1',?,?,1,7,0,'{}','2026-08-29T00:00:00Z','2026-08-29T00:00:00Z')",
      ).run(eventId, `synthetic-baseline-${index}`, 'hash', eventId, key, ids.source, ids.model);
      db.prepare(
        "INSERT INTO grade_snapshots(grade_key,field,event_id,source_id,sequence,value_numeric,is_absent,updated_at) VALUES(?,'NotaT1',?,?,1,7,0,'2026-08-29T00:00:00Z')",
      ).run(key, eventId, ids.source);
      candidate.changes.push({
        cellAddress: cell,
        field: 'NotaT1',
        baselineEventId: eventId,
        baselineSequence: 1,
        valueAfter: 8,
        isAbsent: false,
      });
    }
    const preflight = await service.preflight(candidate, ids.oid);
    expect(preflight.status).toBe('ready');
    const result = await service.commit(
      { ...candidate, preflightFingerprint: preflight.preflightFingerprint! },
      ids.oid,
    );
    expect(result).toMatchObject({ status: 'committed', changeCount: 25, conflictCount: 0 });
    expect(result.eventIds).toHaveLength(25);
    expect(
      Number(
        (db.prepare('SELECT count(*) count FROM grade_snapshots').get() as { count: number }).count,
      ),
    ).toBe(25);
  });
  it('keeps preflight query count constant for 1, 10, 100 and 500 changes', async () => {
    const all = request().changes;
    for (let index = 1; index < 500; index += 1) {
      const suffix = index.toString(16).padStart(12, '0');
      const eventId = `10000000-0000-4000-8000-${suffix}`;
      const key = `2026|${ids.class}|${ids.component}|student-${index}`;
      const cell = `B${index + 2}`;
      db.prepare(
        'INSERT INTO cell_mappings(id,teacher_model_version_id,grade_key,sheet_key,cell_address,field) VALUES(?,?,?,?,?,?)',
      ).run(`mapping-${index}`, ids.version, key, 'sheet-1', cell, 'NotaT1');
      db.prepare(
        "INSERT INTO grade_events(id,idempotency_key,payload_hash,correlation_id,event_type,status,grade_key,field,source_id,teacher_model_id,sequence,value_numeric,is_absent,provenance_json,occurred_at,received_at) VALUES(?,?,?,?,'grade.changed','applied',?,'NotaT1',?,?,1,7,0,'{}','2026-08-29T00:00:00Z','2026-08-29T00:00:00Z')",
      ).run(eventId, `baseline-${index}`, 'hash', eventId, key, ids.source, ids.model);
      db.prepare(
        "INSERT INTO grade_snapshots(grade_key,field,event_id,source_id,sequence,value_numeric,is_absent,updated_at) VALUES(?,'NotaT1',?,?,1,7,0,'2026-08-29T00:00:00Z')",
      ).run(key, eventId, ids.source);
      all.push({
        cellAddress: cell,
        field: 'NotaT1',
        baselineEventId: eventId,
        baselineSequence: 1,
        valueAfter: 8,
        isAbsent: false,
      });
    }
    for (const size of [1, 10, 100, 500]) {
      const candidate = request(`20000000-0000-4000-8000-${size.toString(16).padStart(12, '0')}`);
      candidate.changes = all.slice(0, size);
      runtime.prepareCount = 0;
      expect((await service.preflight(candidate, ids.oid)).status).toBe('ready');
      expect(runtime.prepareCount).toBeLessThanOrEqual(5);
    }
  });
});
