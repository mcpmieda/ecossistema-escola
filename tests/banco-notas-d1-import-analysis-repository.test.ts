import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ImportAnalysisCommit } from '../shared/banco-notas-import-analysis';
import { D1ImportAnalysisRepository } from '../server/banco-notas/d1-import-analysis-repository';

const root = process.cwd();
const migrations = [
  '0001_banco_notas_foundation.sql',
  '0002_banco_notas_cross_year_integrity.sql',
  '0003_banco_notas_import_job_state_machine.sql',
  '0004_banco_notas_import_finding_resolution.sql',
  '0005_banco_notas_import_analysis.sql',
].map((name) => readFileSync(join(root, 'infra/banco-notas/d1/migrations', name), 'utf8'));

class SqliteStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
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

function database() {
  const db = new DatabaseSync(':memory:');
  openDatabases.push(db);
  for (const migration of migrations) db.exec(migration);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('22222222-2222-4222-8222-222222222222', 2026, '2026', '2026-01-01', '2026-12-31');

    INSERT INTO teachers (id, display_name)
    VALUES ('33333333-3333-4333-8333-333333333333', 'Pessoa sintética');

    INSERT INTO data_sources
      (id, school_year_id, type, name, description, created_by)
    VALUES (
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      'legacy_import',
      'Fonte sintética',
      '',
      'actor@example.test'
    );

    INSERT INTO import_jobs
      (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash,
       provenance_json, requested_by)
    VALUES (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      'synthetic-analysis-key',
      '${'a'.repeat(64)}',
      '{"sourceFormat":"xlsx"}',
      'actor@example.test'
    );
  `);
  return db;
}

function commit(overrides: Partial<ImportAnalysisCommit> = {}): ImportAnalysisCommit {
  return {
    importJobId: '11111111-1111-4111-8111-111111111111',
    analyzerId: 'synthetic-xlsx-analyzer',
    analysisVersion: 'analysis-1',
    sourceHash: 'a'.repeat(64),
    sourceFormat: 'xlsx',
    schoolYear: 2026,
    model: {
      schemaVersion: 1,
      sourceFormat: 'xlsx',
      sourceHash: 'a'.repeat(64),
      schoolYear: 2026,
      analysisVersion: 'analysis-1',
      classes: [],
      components: [],
      students: [],
      gradeSlots: [],
      findings: ['estrutura sintética revisada'],
    },
    createdBy: 'actor@example.test',
    findings: [
      {
        severity: 'warning',
        code: 'legacy_analysis_finding',
        location: { analysisFindingIndex: 0 },
        details: { message: 'estrutura sintética revisada' },
      },
    ],
    reason: 'análise sintética validada',
    ...overrides,
  };
}

function repository(db: DatabaseSync) {
  return new D1ImportAnalysisRepository(new SqliteD1(db) as unknown as D1Database);
}

describe('D1 import analysis repository', () => {
  it('atomically persists the analysis, findings, audit and analyzed state', async () => {
    const db = database();
    const repo = repository(db);

    const analysis = await repo.commitImportAnalysis(commit());

    expect(analysis).toMatchObject({
      importJobId: '11111111-1111-4111-8111-111111111111',
      analyzerId: 'synthetic-xlsx-analyzer',
      sourceFormat: 'xlsx',
      schoolYear: 2026,
    });
    expect(db.prepare('SELECT state FROM import_jobs').get()?.state).toBe('analyzed');
    expect(Number(db.prepare('SELECT COUNT(*) AS total FROM import_analyses').get()?.total)).toBe(1);
    expect(Number(db.prepare('SELECT COUNT(*) AS total FROM import_findings').get()?.total)).toBe(1);
    expect(
      Number(
        db
          .prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'import_job.analyzed'")
          .get()?.total,
      ),
    ).toBe(1);

    await expect(repo.findImportAnalysis(analysis.importJobId)).resolves.toEqual(analysis);
  });

  it('treats an identical retry as idempotent without duplicating history', async () => {
    const db = database();
    const repo = repository(db);
    const first = await repo.commitImportAnalysis(commit());
    const second = await repo.commitImportAnalysis(commit());

    expect(second).toEqual(first);
    expect(Number(db.prepare('SELECT COUNT(*) AS total FROM import_analyses').get()?.total)).toBe(1);
    expect(Number(db.prepare('SELECT COUNT(*) AS total FROM import_findings').get()?.total)).toBe(1);
    expect(
      Number(
        db
          .prepare("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'import_job.analyzed'")
          .get()?.total,
      ),
    ).toBe(1);
  });

  it('rejects a conflicting retry after an analysis is already committed', async () => {
    const db = database();
    const repo = repository(db);
    await repo.commitImportAnalysis(commit());

    await expect(
      repo.commitImportAnalysis(commit({ analyzerId: 'different-analyzer' })),
    ).rejects.toThrow('import_analysis_idempotency_conflict');
  });

  it('rejects provenance mismatches before writing anything', async () => {
    const db = database();
    const repo = repository(db);

    await expect(repo.commitImportAnalysis(commit({ sourceHash: 'b'.repeat(64) }))).rejects.toThrow(
      'import_analysis_provenance_mismatch',
    );
    expect(Number(db.prepare('SELECT COUNT(*) AS total FROM import_analyses').get()?.total)).toBe(0);
    expect(db.prepare('SELECT state FROM import_jobs').get()?.state).toBe('draft');
  });

  it('rolls back the analysis when a later statement in the batch fails', async () => {
    const db = database();
    const repo = repository(db);
    const invalid = commit({
      findings: [
        {
          severity: 'fatal' as 'warning',
          code: 'invalid-severity',
          location: {},
          details: {},
        },
      ],
    });

    await expect(repo.commitImportAnalysis(invalid)).rejects.toThrow();
    expect(Number(db.prepare('SELECT COUNT(*) AS total FROM import_analyses').get()?.total)).toBe(0);
    expect(Number(db.prepare('SELECT COUNT(*) AS total FROM import_findings').get()?.total)).toBe(0);
    expect(db.prepare('SELECT state FROM import_jobs').get()?.state).toBe('draft');
  });
});
