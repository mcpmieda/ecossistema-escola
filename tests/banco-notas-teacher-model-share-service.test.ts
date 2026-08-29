// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { D1TeacherModelRepository } from '../server/banco-notas/d1-teacher-model-repository';
import { shareTeacherModel } from '../server/banco-notas/teacher-model-share-service';

const root = process.cwd();
const migrationNames = [
  '0001_banco_notas_foundation.sql',
  '0002_banco_notas_cross_year_integrity.sql',
  '0003_banco_notas_import_job_state_machine.sql',
  '0004_banco_notas_import_finding_resolution.sql',
  '0005_banco_notas_import_analysis.sql',
  '0006_banco_notas_import_analysis_profiles.sql',
  '0007_banco_notas_teacher_entra_identity.sql',
];
const migrations = migrationNames.map((name) =>
  readFileSync(join(root, 'infra/banco-notas/d1/migrations', name), 'utf8'),
);

const schoolYearId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const teacherEntraObjectId = '33333333-3333-4333-8333-333333333333';

class SqliteStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...params: SQLInputValue[]) {
    return new SqliteStatement(this.db, this.sql, params);
  }

  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }

  execute() {
    return this.db.prepare(this.sql).run(...this.params);
  }
}

class SqliteD1 {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string) {
    return new SqliteStatement(this.db, sql);
  }

  async batch(statements: SqliteStatement[]) {
    this.db.exec('BEGIN');
    try {
      for (const statement of statements) statement.execute();
      this.db.exec('COMMIT');
      return [];
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

const openDatabases: DatabaseSync[] = [];
afterEach(() => {
  while (openDatabases.length) openDatabases.pop()?.close();
});

function database(options: { withEntraIdentity?: boolean } = {}) {
  const db = new DatabaseSync(':memory:');
  openDatabases.push(db);
  for (const migration of migrations) db.exec(migration);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('${schoolYearId}', 2026, '2026', '2026-01-01', '2026-12-31');

    INSERT INTO teachers (id, display_name, entra_object_id)
    VALUES (
      '${teacherId}',
      'Docente sintético',
      ${options.withEntraIdentity === false ? 'NULL' : `'${teacherEntraObjectId}'`}
    );
  `);
  return db;
}

function repository(db: DatabaseSync) {
  return new D1TeacherModelRepository(new SqliteD1(db) as unknown as D1Database);
}

function workbookBytes(): Uint8Array<ArrayBuffer> {
  const value = new Uint8Array(new ArrayBuffer(4));
  value.set([80, 75, 3, 4]);
  return value;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'));
  return hex.join('');
}

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get();
  return Number(row?.total);
}

function shareResults(db: DatabaseSync): unknown[] {
  const rows = db.prepare('SELECT result FROM share_audit ORDER BY created_at, rowid').all();
  return rows.map((row) => row.result);
}

async function persist(repo: D1TeacherModelRepository, modelHash: string) {
  return repo.persistValidatedModelVersion({
    schoolYearId,
    teacherId,
    modelHash,
    definitionVersion: '2026.1-modelo-docente',
    mappingVersion: 1,
    workbookIdentity: {
      modelId: '55555555-5555-4555-8555-555555555555',
      sourceHash: 'a'.repeat(64),
      relationshipSnapshotId: '44444444-4444-4444-8444-444444444444',
      layoutVersion: '2026.1-layout',
    },
    provenance: {
      sourceHash: 'a'.repeat(64),
      relationshipSnapshotId: '44444444-4444-4444-8444-444444444444',
    },
    mappings: [
      {
        gradeKey: '2026|turma-a|matematica|estudante-1',
        sheetKey: 'generated:turma-a:matematica',
        cellAddress: 'B2',
        field: 'NotaT1',
      },
    ],
    actor: 'admin@example.test',
  });
}

function gateway(bytes: Uint8Array<ArrayBuffer>) {
  return {
    store: vi.fn(async () => ({ driveItemId: 'drive-item-1', etag: 'stored' })),
    share: vi.fn(async () => ({ permissionId: 'permission-1' })),
    metadata: vi.fn(async () => ({ etag: 'verified', size: bytes.byteLength })),
    download: vi.fn(async () => {
      const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
      copy.set(bytes);
      return copy;
    }),
    revokeShare: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}

describe('Banco de Notas teacher model D1 + Graph share service', () => {
  it('atomically persists a validated version and prepares it for sharing', async () => {
    const db = database();
    const repo = repository(db);
    const modelHash = await sha256(workbookBytes());

    const persisted = await persist(repo, modelHash);
    expect(persisted).toMatchObject({
      version: 1,
      state: 'validated',
      modelHash,
      definitionVersion: '2026.1-modelo-docente',
      mappingVersion: 1,
    });
    expect(db.prepare('SELECT state FROM teacher_models').get()?.state).toBe('validated');
    expect(count(db, 'teacher_model_versions')).toBe(1);
    expect(count(db, 'cell_mappings')).toBe(1);

    const ready = await repo.prepareShare(persisted.teacherModelId, 'admin@example.test');
    expect(ready).toMatchObject({
      state: 'ready_to_share',
      teacherEntraObjectId,
      modelHash,
      definitionVersion: '2026.1-modelo-docente',
      mappingVersion: 1,
    });
    expect(db.prepare('SELECT state FROM teacher_models').get()?.state).toBe('ready_to_share');
  });

  it('keeps an identical validated model version idempotent', async () => {
    const db = database();
    const repo = repository(db);
    const modelHash = await sha256(workbookBytes());

    const first = await persist(repo, modelHash);
    const second = await persist(repo, modelHash);

    expect(second).toEqual(first);
    expect(count(db, 'teacher_model_versions')).toBe(1);
    expect(count(db, 'cell_mappings')).toBe(1);
  });

  it('blocks ready-to-share without the canonical Entra identity', async () => {
    const db = database({ withEntraIdentity: false });
    const repo = repository(db);
    const persisted = await persist(repo, await sha256(workbookBytes()));

    await expect(repo.prepareShare(persisted.teacherModelId, 'admin@example.test')).rejects.toThrow(
      'teacher_model_entra_identity_required',
    );
    expect(db.prepare('SELECT state FROM teacher_models').get()?.state).toBe('validated');
  });

  it('moves to shared only after Graph verification succeeds', async () => {
    const db = database();
    const repo = repository(db);
    const bytes = workbookBytes();
    const modelHash = await sha256(bytes);
    const persisted = await persist(repo, modelHash);
    const graph = gateway(bytes);
    const verifyDownloadedWorkbook = vi.fn(async () => undefined);

    const result = await shareTeacherModel({
      input: {
        teacherModelId: persisted.teacherModelId,
        fileName: 'modelo-docente-sintetico.xlsx',
        modelHash,
        definitionVersion: '2026.1-modelo-docente',
        mappingVersion: 1,
        content: bytes,
        recipientUpn: 'professor.synthetic@example.edu',
        actor: 'admin@example.test',
      },
      repository: repo,
      gateway: graph,
      verifyDownloadedWorkbook,
    });

    expect(result.driveItemId).toBe('drive-item-1');
    expect(verifyDownloadedWorkbook).toHaveBeenCalledOnce();
    expect(db.prepare('SELECT state FROM teacher_models').get()?.state).toBe('shared');
    expect(db.prepare('SELECT drive_item_id FROM teacher_models').get()?.drive_item_id).toBe(
      'drive-item-1',
    );
    expect(shareResults(db)).toEqual(['requested', 'succeeded']);
    expect(graph.revokeShare).not.toHaveBeenCalled();
    expect(graph.remove).not.toHaveBeenCalled();
  });

  it('compensates Graph and keeps the model ready when verification fails', async () => {
    const db = database();
    const repo = repository(db);
    const bytes = workbookBytes();
    const modelHash = await sha256(bytes);
    const persisted = await persist(repo, modelHash);
    const graph = gateway(bytes);
    const verifyDownloadedWorkbook = vi.fn(async () => {
      throw new Error('synthetic_reanalysis_failure');
    });

    await expect(
      shareTeacherModel({
        input: {
          teacherModelId: persisted.teacherModelId,
          fileName: 'modelo-docente-sintetico.xlsx',
          modelHash,
          definitionVersion: '2026.1-modelo-docente',
          mappingVersion: 1,
          content: bytes,
          recipientUpn: 'professor.synthetic@example.edu',
          actor: 'admin@example.test',
        },
        repository: repo,
        gateway: graph,
        verifyDownloadedWorkbook,
      }),
    ).rejects.toThrow('synthetic_reanalysis_failure');

    expect(db.prepare('SELECT state FROM teacher_models').get()?.state).toBe('ready_to_share');
    expect(db.prepare('SELECT drive_item_id FROM teacher_models').get()?.drive_item_id).toBeNull();
    expect(shareResults(db)).toEqual(['requested', 'failed']);
    expect(graph.revokeShare).toHaveBeenCalledOnce();
    expect(graph.remove).toHaveBeenCalledOnce();
  });
});
