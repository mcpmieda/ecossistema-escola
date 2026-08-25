// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { D1GradeEventStore } from '../server/banco-notas/d1-grade-event-store';
import { GradeEventForbiddenError, ingestGradeEvent } from '../server/banco-notas/grade-events';
import type { GradeEventInput } from '../shared/banco-notas-grade-events';

const root = process.cwd();
const migration1 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql'),
  'utf8',
);
const migration2 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0002_banco_notas_cross_year_integrity.sql'),
  'utf8',
);

class SqlitePrepared {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: SQLInputValue[]): SqlitePrepared {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.statement.all(...this.values) as T[] };
  }

  async run(): Promise<unknown> {
    return this.statement.run(...this.values);
  }
}

class SqliteD1 {
  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string): SqlitePrepared {
    return new SqlitePrepared(this.database.prepare(sql));
  }

  async batch(statements: SqlitePrepared[]): Promise<unknown[]> {
    this.database.exec('BEGIN');
    try {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const MODEL_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
const GRADE_KEY = '2026|T01|M|aluno-sintetico-001';

function database(syncEnabled = true): SqliteD1 {
  const db = new DatabaseSync(':memory:');
  db.exec(migration1);
  db.exec(migration2);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('44444444-4444-4444-8444-444444444444', 2026, '2026', '2026-01-01', '2026-12-31');

    INSERT INTO teachers (id, display_name)
    VALUES ('${TEACHER_ID}', 'Professor sintético');

    INSERT INTO data_sources
      (id, school_year_id, type, name, description, created_by)
    VALUES
      ('${SOURCE_ID}', '44444444-4444-4444-8444-444444444444', 'linked_teacher_model', 'Fonte sintética', '', 'actor');

    INSERT INTO teacher_models
      (id, school_year_id, teacher_id, state, sync_enabled, environment)
    VALUES
      ('${MODEL_ID}', '44444444-4444-4444-8444-444444444444', '${TEACHER_ID}', 'connected', 1, 'homologation');

    INSERT INTO teacher_model_versions
      (id, teacher_model_id, version, model_hash, mapping_version, provenance_json)
    VALUES
      ('55555555-5555-4555-8555-555555555555', '${MODEL_ID}', 1, 'hash-modelo', 1, '{}');

    INSERT INTO cell_mappings
      (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field)
    VALUES
      ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', '${GRADE_KEY}', 'sheet-sintetica', 'F12', 'NotaT1');

    INSERT INTO source_assignments
      (id, school_year_id, data_source_id, scope, authority, sync_enabled, effective_from, operator_id, reason)
    VALUES
      ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', '${SOURCE_ID}', 'school_year_default', 'authoritative', ${syncEnabled ? 1 : 0}, '2026-01-01', 'actor', 'homologação sintética');
  `);
  return new SqliteD1(db);
}

function input(overrides: Partial<GradeEventInput> = {}): GradeEventInput {
  return {
    schemaVersion: 1,
    eventId: '88888888-8888-4888-8888-888888888888',
    correlationId: '99999999-9999-4999-8999-999999999999',
    eventType: 'grade.changed',
    gradeKey: GRADE_KEY,
    field: 'NotaT1',
    dataSourceId: SOURCE_ID,
    teacherModelId: MODEL_ID,
    source: {
      kind: 'excel-addin',
      workbookId: 'workbook-sintetico',
      worksheetId: 'worksheet-sintetica',
      cellAddress: 'F12',
    },
    valueBefore: null,
    valueAfter: 7,
    isAbsent: false,
    sequence: 1,
    clientSentAt: '2026-08-25T12:00:00.000Z',
    ...overrides,
  };
}

function store(runtime: SqliteD1): D1GradeEventStore {
  return new D1GradeEventStore(runtime as unknown as D1Database);
}

describe('D1GradeEventStore with real SQLite', () => {
  it('persists a new event and advances the composite snapshot atomically', async () => {
    const runtime = database();
    const result = await ingestGradeEvent({
      input: input(),
      idempotencyKey: 'sqlite-grade-event-0001',
      store: store(runtime),
      receivedAt: '2026-08-25T12:00:01.000Z',
    });

    expect(result.status).toBe('applied');
    expect(result.snapshot).toMatchObject({ field: 'NotaT1', sequence: 1, value: 7 });
    expect(
      runtime.database.prepare('SELECT COUNT(*) AS total FROM grade_events').get(),
    ).toMatchObject({ total: 1 });
    expect(
      runtime.database.prepare('SELECT COUNT(*) AS total FROM grade_snapshots').get(),
    ).toMatchObject({ total: 1 });
    runtime.database.close();
  });

  it('retains an old sequence as stale and does not regress the snapshot', async () => {
    const runtime = database();
    const gradeStore = store(runtime);
    await ingestGradeEvent({
      input: input({ sequence: 2, valueAfter: 8 }),
      idempotencyKey: 'sqlite-grade-event-0002',
      store: gradeStore,
      receivedAt: '2026-08-25T12:00:01.000Z',
    });
    const stale = await ingestGradeEvent({
      input: input({
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sequence: 1,
        valueAfter: 5,
      }),
      idempotencyKey: 'sqlite-grade-event-0003',
      store: gradeStore,
      receivedAt: '2026-08-25T12:00:02.000Z',
    });

    expect(stale.status).toBe('stale');
    expect(stale.snapshot).toMatchObject({ sequence: 2, value: 8 });
    expect(
      runtime.database
        .prepare(
          "SELECT status FROM grade_events WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'",
        )
        .get(),
    ).toMatchObject({ status: 'stale' });
    expect(
      runtime.database.prepare('SELECT sequence, value_numeric FROM grade_snapshots').get(),
    ).toMatchObject({ sequence: 2, value_numeric: 8 });
    runtime.database.close();
  });

  it('blocks ingestion when source authority synchronization is disabled', async () => {
    const runtime = database(false);
    await expect(
      ingestGradeEvent({
        input: input(),
        idempotencyKey: 'sqlite-grade-event-0004',
        store: store(runtime),
      }),
    ).rejects.toBeInstanceOf(GradeEventForbiddenError);
    expect(
      runtime.database.prepare('SELECT COUNT(*) AS total FROM grade_events').get(),
    ).toMatchObject({ total: 0 });
    runtime.database.close();
  });

  it('blocks a grade event that is not mapped to the current model cell', async () => {
    const runtime = database();
    await expect(
      ingestGradeEvent({
        input: input({
          source: {
            kind: 'excel-addin',
            workbookId: 'workbook-sintetico',
            worksheetId: 'worksheet-sintetica',
            cellAddress: 'G99',
          },
        }),
        idempotencyKey: 'sqlite-grade-event-0005',
        store: store(runtime),
      }),
    ).rejects.toBeInstanceOf(GradeEventForbiddenError);
    runtime.database.close();
  });
});
