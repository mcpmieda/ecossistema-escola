import { PGlite, type Transaction } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { createGradebookShadowReadOnlyD1V1 } from '../../../server/gradebook/persistence/shadow/gradebook-shadow-d1-v1';
import {
  backfillGradebookFamilyPageV1,
  GRADEBOOK_BACKFILL_FAMILIES_V1,
  gradebookBackfillFamilyV1,
  verifyGradebookBackfillIntegrityV1,
  type GradebookBackfillQuerySqlV1,
  type GradebookBackfillSqlV1,
} from '../../../server/gradebook/persistence/postgres/postgres-backfill-v1';

type Row = Record<string, unknown>;

function result(rows: readonly Row[], count = rows.length) {
  return Object.assign([...rows], { count });
}

class SourceStatement implements D1WriteStatementV1 {
  constructor(
    private readonly owner: SourceDatabase,
    private readonly query: string,
    private readonly values: readonly D1WriteValueV1[] = [],
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new SourceStatement(this.owner, this.query, values);
  }

  async first<Value extends Row>(): Promise<Value | null> {
    const table = /FROM\s+"?([a-z_]+)"?/iu.exec(this.query)?.[1];
    if (!table) throw new Error('test-source-query-invalid');
    return { count: this.owner.rows.get(table)?.length ?? 0 } as unknown as Value;
  }

  async all<Value extends Row>(): Promise<{ readonly results: readonly Value[] }> {
    const table = /FROM\s+"?([a-z_]+)"?/iu.exec(this.query)?.[1];
    if (!table) throw new Error('test-source-query-invalid');
    const after = Number(this.values[0]);
    const limit = Number(this.values[1]);
    const rows = (this.owner.rows.get(table) ?? [])
      .filter((row) => Number(row.__backfill_rowid) > after)
      .slice(0, limit);
    return { results: rows as Value[] };
  }

  async run(): Promise<D1WriteRunResultV1> {
    this.owner.writeAttempts += 1;
    return { success: true, changes: 1 };
  }
}

class SourceDatabase implements D1WriteDatabaseV1 {
  writeAttempts = 0;

  constructor(readonly rows: ReadonlyMap<string, readonly Row[]>) {}

  prepare(query: string): D1WriteStatementV1 {
    return new SourceStatement(this, query);
  }

  exec(): void {
    this.writeAttempts += 1;
  }
}

class TargetSql implements GradebookBackfillSqlV1 {
  readonly calls: string[] = [];
  transactions = 0;
  changed = 0;

  unsafe(query: string, _parameters: readonly unknown[] = []) {
    this.calls.push(query);
    if (query.startsWith('INSERT INTO')) return Promise.resolve(result([], this.changed));
    if (/SELECT COUNT\(\*\) AS count FROM gradebook\./u.test(query)) {
      return Promise.resolve(result([{ count: 0 }]));
    }
    return Promise.resolve(result([{ count: 0 }]));
  }

  async begin<T>(operation: (sql: GradebookBackfillQuerySqlV1) => Promise<T>): Promise<T> {
    this.transactions += 1;
    return operation(this);
  }
}

interface Queryable {
  query<Value extends Row>(
    query: string,
    parameters?: unknown[],
  ): Promise<{ readonly rows: readonly Value[]; readonly affectedRows?: number }>;
}

class PGliteQuerySql implements GradebookBackfillQuerySqlV1 {
  constructor(protected readonly client: Queryable) {}

  async unsafe(query: string, parameters: readonly unknown[] = []) {
    const response = await this.client.query(query, Array.from(parameters));
    return Object.assign([...response.rows], {
      count: response.affectedRows ?? response.rows.length,
    });
  }
}

class PGliteBackfillSql extends PGliteQuerySql implements GradebookBackfillSqlV1 {
  constructor(private readonly postgres: PGlite) {
    super({ query: (query, parameters) => postgres.query(query, parameters) });
  }

  begin<T>(operation: (sql: GradebookBackfillQuerySqlV1) => Promise<T>): Promise<T> {
    return this.postgres.transaction((transaction: Transaction) =>
      operation(
        new PGliteQuerySql({
          query: (query, parameters) => transaction.query(query, parameters),
        }),
      ),
    );
  }
}

describe('PostgreSQL gradebook private backfill', () => {
  it('maintains one complete topological allowlist with valid columns and keys', () => {
    expect(GRADEBOOK_BACKFILL_FAMILIES_V1).toHaveLength(28);
    expect(new Set(GRADEBOOK_BACKFILL_FAMILIES_V1.map((value) => value.name)).size).toBe(28);
    expect(GRADEBOOK_BACKFILL_FAMILIES_V1[0]?.name).toBe('academic_years');
    expect(GRADEBOOK_BACKFILL_FAMILIES_V1.at(-1)?.name).toBe('gradebook_import_stage_chunks');
    for (const definition of GRADEBOOK_BACKFILL_FAMILIES_V1) {
      expect(definition.columns).toEqual(expect.arrayContaining([...definition.primaryKey]));
      expect(definition.name).toMatch(/^[a-z][a-z0-9_]*$/u);
      expect(gradebookBackfillFamilyV1(definition.name)).toBe(definition);
    }
    expect(gradebookBackfillFamilyV1('untrusted_relation')).toBeNull();
  });

  it('reads a bounded D1 page and atomically upserts plus verifies every column', async () => {
    const definition = gradebookBackfillFamilyV1('academic_years');
    if (!definition) throw new Error('test-family-missing');
    const source = new SourceDatabase(
      new Map([
        [
          definition.name,
          [
            {
              __backfill_rowid: 7,
              academic_year_id: 'academic-year:synthetic',
              school_id: 'school:synthetic',
              year: 2026,
              current_version: 1,
              created_at: '2026-09-08T00:00:00.000Z',
            },
          ],
        ],
      ]),
    );
    const guard = createGradebookShadowReadOnlyD1V1(source);
    const target = new TargetSql();
    target.changed = 1;

    const page = await backfillGradebookFamilyPageV1(guard.database, target, {
      family: definition,
      afterRowId: 0,
      limit: 100,
    });

    expect(page).toEqual({
      family: 'academic_years',
      read: 1,
      changed: 1,
      afterRowId: 7,
      complete: true,
    });
    expect(target.transactions).toBe(1);
    expect(target.calls[0]).toContain("set_config('idle_in_transaction_session_timeout'");
    expect(target.calls[1]).toContain('jsonb_populate_recordset');
    expect(target.calls[1]).toContain('ON CONFLICT ("academic_year_id") DO UPDATE');
    expect(target.calls[1]).toContain('IS DISTINCT FROM EXCLUDED');
    expect(target.calls).toHaveLength(2);
    expect(guard.writeAttempts()).toBe(0);
  });

  it('propagates a target failure from inside the bounded transaction', async () => {
    const definition = gradebookBackfillFamilyV1('academic_years');
    if (!definition) throw new Error('test-family-missing');
    const source = new SourceDatabase(
      new Map([
        [
          definition.name,
          [
            {
              __backfill_rowid: 1,
              academic_year_id: 'academic-year:synthetic',
              school_id: 'school:synthetic',
              year: 2026,
              current_version: 1,
              created_at: '2026-09-08T00:00:00.000Z',
            },
          ],
        ],
      ]),
    );
    const target = new TargetSql();
    target.unsafe = () => Promise.reject(new Error('synthetic-target-failure'));

    await expect(
      backfillGradebookFamilyPageV1(source, target, {
        family: definition,
        afterRowId: 0,
        limit: 10,
      }),
    ).rejects.toThrow('synthetic-target-failure');
    expect(target.transactions).toBe(1);
  });

  it('executes the generated bulk SQL in PostgreSQL and is idempotent', async () => {
    const postgres = await PGlite.create();
    try {
      await postgres.exec(`
        CREATE SCHEMA gradebook;
        CREATE TABLE gradebook.academic_years (
          academic_year_id TEXT PRIMARY KEY,
          school_id TEXT NOT NULL,
          year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 9999),
          current_version INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);
      const definition = gradebookBackfillFamilyV1('academic_years');
      if (!definition) throw new Error('test-family-missing');
      const source = new SourceDatabase(
        new Map([
          [
            definition.name,
            [
              {
                __backfill_rowid: 11,
                academic_year_id: 'academic-year:synthetic',
                school_id: 'school:synthetic',
                year: 2026,
                current_version: 1,
                created_at: '2026-09-08T00:00:00.000Z',
              },
            ],
          ],
        ]),
      );
      const target = new PGliteBackfillSql(postgres);

      const first = await backfillGradebookFamilyPageV1(source, target, {
        family: definition,
        afterRowId: 0,
        limit: 100,
      });
      const second = await backfillGradebookFamilyPageV1(source, target, {
        family: definition,
        afterRowId: 0,
        limit: 100,
      });
      const persisted = await postgres.query<{ academic_year_id: string; year: number }>(
        'SELECT academic_year_id, year FROM gradebook.academic_years',
      );

      expect(first.changed).toBe(1);
      expect(second.changed).toBe(0);
      expect(persisted.rows).toEqual([{ academic_year_id: 'academic-year:synthetic', year: 2026 }]);

      const invalidSource = new SourceDatabase(
        new Map([
          [
            definition.name,
            [
              {
                __backfill_rowid: 12,
                academic_year_id: 'academic-year:invalid',
                school_id: 'school:invalid',
                year: 1999,
                current_version: 1,
                created_at: '2026-09-08T00:00:00.000Z',
              },
            ],
          ],
        ]),
      );
      await expect(
        backfillGradebookFamilyPageV1(invalidSource, target, {
          family: definition,
          afterRowId: 0,
          limit: 100,
        }),
      ).rejects.toThrow();
      const afterRollback = await postgres.query<{ count: number }>(
        'SELECT COUNT(*)::integer AS count FROM gradebook.academic_years',
      );
      expect(afterRollback.rows[0]?.count).toBe(1);
    } finally {
      await postgres.close();
    }
  }, 15_000);

  it('reports a clean empty integrity baseline without exposing row values', async () => {
    const source = new SourceDatabase(new Map());
    const target = new TargetSql();

    const verification = await verifyGradebookBackfillIntegrityV1(source, target);

    expect(verification.state).toBe('passed');
    expect(verification.families).toHaveLength(28);
    expect(verification.countDivergences).toBe(0);
    expect(verification.versionDivergences).toBe(0);
    expect(verification.invalidAuthorityRows).toBe(0);
    expect(verification.unvalidatedForeignKeys).toBe(0);
  });
});
