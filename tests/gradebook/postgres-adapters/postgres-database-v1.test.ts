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

describe('gradebook PostgreSQL database adapter', () => {
  it('translates parameters without touching literals or interpolating values', () => {
    const translated = translateGradebookD1SqlToPostgresV1(
      "SELECT '?' AS literal, payload_json FROM source_file_versions WHERE manifest_id = ? AND sha256 = ?",
    );

    expect(translated).toBe(
      "SELECT '?' AS literal, payload_json FROM gradebook.source_file_versions WHERE manifest_id = $1 AND sha256 = $2",
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
    expect(translated).toContain('FROM jsonb_array_elements($1::jsonb) AS j(value)');
    expect(translated).toContain('record_kind = $2');
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

  it('sends serialized JSON as PostgreSQL text OID 25 for server-side JSONB casts', async () => {
    const sql = new SyntheticPostgresSqlV1();
    const database = createGradebookPostgresDatabaseFromSqlV1(sql);
    const payload = JSON.stringify([{ kind: 'student', id: 'student:synthetic' }]);

    await database
      .prepare("SELECT value FROM json_each(?) WHERE json_extract(value, '$.kind') = ?")
      .bind(payload, 'student')
      .all();

    expect(sql.typedCalls).toEqual([{ value: payload, oid: 25 }]);
    expect(sql.calls[0]?.parameters).toEqual([{ value: payload, oid: 25 }, 'student']);
    expect(sql.calls[0]?.query).toContain('jsonb_array_elements($1::jsonb)');
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

  it('retains only sanitized physical failure diagnostics after repository masking', async () => {
    const sql = new SyntheticPostgresSqlV1();
    const error = Object.assign(
      new Error('column payload_json is of type jsonb but value is text'),
      {
        code: '42804',
      },
    );
    sql.failNext(error);
    const database = createGradebookPostgresDatabaseFromSqlV1(sql);

    await expect(
      database
        .prepare('INSERT INTO academic_year_versions (payload_json) VALUES (?)')
        .bind(JSON.stringify({ secret: 'never-diagnosed' }))
        .run(),
    ).rejects.toBe(error);

    expect(database.lastFailure()).toEqual({
      operation: 'INSERT',
      relation: 'academic_year_versions',
      errorType: 'Error',
      sqlState: '42804',
      category: 'jsonb-cast',
    });
    expect(JSON.stringify(database.lastFailure())).not.toContain('secret');
  });

  it('normalizes PostgreSQL rows to the established adapter boundary', async () => {
    const sql = new SyntheticPostgresSqlV1();
    sql.respond([
      {
        payload_json: { kind: 'student', value: { id: 'student:synthetic' } },
        recorded_at: new Date('2026-09-08T12:00:00Z'),
        current_version: '2',
        available: true,
      },
    ]);
    const database = createGradebookPostgresDatabaseFromSqlV1(sql);

    const row = await database.prepare('SELECT * FROM academic_entity_versions').first<Row>();

    expect(row).toEqual({
      payload_json: '{"kind":"student","value":{"id":"student:synthetic"}}',
      recorded_at: '2026-09-08T12:00:00.000Z',
      current_version: 2,
      available: 1,
    });
    await database.close();
    expect(sql.closed).toBe(true);
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
