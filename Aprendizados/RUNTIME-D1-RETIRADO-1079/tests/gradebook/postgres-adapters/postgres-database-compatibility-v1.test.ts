import { describe, expect, it } from 'vitest';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  translateGradebookD1SqlToPostgresV1,
  type GradebookPostgresQuerySqlV1,
  type GradebookPostgresSqlV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';

type Row = Record<string, unknown>;

function result(rows: readonly Row[], count = rows.length) {
  return Object.assign([...rows], { count });
}

class SyntheticPostgresSqlV1 implements GradebookPostgresSqlV1 {
  readonly calls: { readonly query: string; readonly parameters: readonly unknown[] }[] = [];
  transactions = 0;
  closed = false;
  readonly typedCalls: { readonly value: string; readonly oid: number }[] = [];
  private readonly responses: { readonly rows: readonly Row[]; readonly count?: number }[] = [];
  private failure: unknown;

  respond(rows: readonly Row[], count?: number): void {
    this.responses.push({ rows, ...(count === undefined ? {} : { count }) });
  }

  failNext(cause: unknown): void {
    this.failure = cause;
  }

  unsafe(query: string, parameters: readonly unknown[] = []) {
    this.calls.push({ query, parameters });
    if (this.failure !== undefined) {
      const cause = this.failure;
      this.failure = undefined;
      return Promise.reject(cause);
    }
    const response = this.responses.shift() ?? { rows: [], count: 0 };
    return Promise.resolve(result(response.rows, response.count ?? response.rows.length));
  }

  typed(value: string, oid: number): unknown {
    this.typedCalls.push({ value, oid });
    return { value, oid };
  }

  async begin<T>(operation: (sql: GradebookPostgresQuerySqlV1) => Promise<T>): Promise<T> {
    this.transactions += 1;
    return operation(this);
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}
// Historical D1 translator and batch protocol, retired by #1079.
describe('retired D1 compatibility adapter', () => {
  it('translates parameters without touching literals or interpolating values', () => {
    const translated = translateGradebookD1SqlToPostgresV1(
      "SELECT '?' AS literal, payload_json FROM source_file_versions WHERE manifest_id = ? AND sha256 = ?",
    );

    expect(translated).toBe(
      "SELECT '?' AS literal, payload_json FROM gradebook.source_file_versions WHERE manifest_id = $1 AND sha256 = $2",
    );
  });

  it('keeps legacy D1 qualification separate from the current physical catalog', () => {
    expect(
      translateGradebookD1SqlToPostgresV1(
        'SELECT * FROM source_file_versions WHERE manifest_id = ?',
      ),
    ).toBe('SELECT * FROM gradebook.source_file_versions WHERE manifest_id = $1');

    // Current relational SQL must name the physical schema explicitly. The
    // compatibility translator must not silently reinterpret current tables.
    expect(translateGradebookD1SqlToPostgresV1('SELECT * FROM nota')).toBe(
      'SELECT * FROM nota',
    );
    expect(translateGradebookD1SqlToPostgresV1('SELECT * FROM gradebook.nota')).toBe(
      'SELECT * FROM gradebook.nota',
    );
  });

  it('translates the bounded JSON set operations used by import planning', () => {
    const translated = translateGradebookD1SqlToPostgresV1(`
      WITH requested AS (
        SELECT json_extract(value, '$.kind') AS record_kind,
               CAST(json_extract(value, '$.expectedVersion') AS INTEGER) AS expected_version
        FROM json_each(?) j
      )
      SELECT * FROM requested WHERE record_kind = ?
    `);

    expect(translated).toContain("(value::jsonb #>> '{kind}') AS record_kind");
    expect(translated).toContain("CAST((value::jsonb #>> '{expectedVersion}') AS INTEGER)");
    expect(translated).toContain(
      'FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS j(value, key)',
    );
    expect(translated).toContain('record_kind = $2');
  });

  it('preserves SQLite json_each array indexes and scalar text semantics', () => {
    const translated = translateGradebookD1SqlToPostgresV1(`
      WITH requested AS (
        SELECT CAST(key AS INTEGER) AS request_index,
               CAST(value AS TEXT) AS entity_id
        FROM json_each(?)
      )
      SELECT request_index, entity_id FROM requested ORDER BY request_index
    `);

    expect(translated).toContain('CAST(key - 1 AS INTEGER) AS request_index');
    expect(translated).toContain("(value #>> '{}') AS entity_id");
    expect(translated).toContain(
      'FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS json_each(value, key)',
    );
  });

  it('maps SQLite idempotent inserts to PostgreSQL conflict handling', () => {
    expect(
      translateGradebookD1SqlToPostgresV1(
        'INSERT OR IGNORE INTO council_session_streams (academic_year_id) VALUES (?)',
      ),
    ).toBe(
      'INSERT INTO gradebook.council_session_streams (academic_year_id) VALUES ($1) ON CONFLICT DO NOTHING',
    );
  });

  it('adds a server-side JSONB cast when an inherited insert has no explicit cast', async () => {
    const sql = new SyntheticPostgresSqlV1();
    const database = createGradebookPostgresDatabaseFromSqlV1(sql);
    const payload = JSON.stringify({ transportVersion: 8 });

    await database
      .prepare('INSERT INTO gradebook_import_stage_sessions (metadata_json) VALUES (?)')
      .bind(payload)
      .run();

    expect(sql.calls[0]?.query).toContain(
      'INSERT INTO gradebook.gradebook_import_stage_sessions (metadata_json) VALUES ($1::jsonb)',
    );
    expect(sql.calls[0]?.parameters).toEqual([{ value: payload, oid: 25 }]);
  });

  it('runs a mutation batch once in a transaction and enforces its CAS guard', async () => {
    const sql = new SyntheticPostgresSqlV1();
    sql.respond([], 1);
    const database = createGradebookPostgresDatabaseFromSqlV1(sql);
    const mutation = database
      .prepare('UPDATE academic_record_streams SET current_version = ?')
      .bind(2);
    const guard = database
      .prepare(
        "SELECT CASE WHEN changes() = ? THEN 1 ELSE json('gradebook_atomic_batch_guard_failure') END AS gradebook_atomic_batch_guard",
      )
      .bind(1);

    const committed = await database.batch?.([mutation, guard]);

    expect(sql.transactions).toBe(1);
    expect(committed).toHaveLength(2);
    expect(sql.calls).toHaveLength(1);

    sql.respond([], 0);
    await expect(database.batch?.([mutation, guard])).rejects.toThrow(
      'gradebook_atomic_batch_guard_failure',
    );
    expect(sql.transactions).toBe(2);
  });
});

