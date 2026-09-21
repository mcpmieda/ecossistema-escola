import type { D1WriteStatementV1, D1WriteValueV1 } from '../d1/write/d1-write-adapter-v1';
import type { GradebookPostgresDatabaseV1 } from './postgres-database-v1';

/** Request-local connection: constructing or binding a statement performs no I/O.
 * Handlers keep ownership of authentication, input validation and response contracts.
 * Transactions still delegate to one physical PostgreSQL transaction, never a fake batch.
 */
export function lazyGradebookDatabaseV1(
  create: () => Promise<GradebookPostgresDatabaseV1>,
): GradebookPostgresDatabaseV1 {
  let pending: Promise<GradebookPostgresDatabaseV1> | undefined;
  let current: GradebookPostgresDatabaseV1 | undefined;
  let closed = false;
  const open = () => {
    if (closed) return Promise.reject(new Error('gradebook-request-database-closed'));
    return pending ??= Promise.resolve().then(create).then((database) => {
      current = database;
      return database;
    });
  };
  class Statement implements D1WriteStatementV1 {
    constructor(readonly query: string, readonly values: readonly D1WriteValueV1[] = []) {}
    bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
      return new Statement(this.query, [...values]);
    }
    native(database: GradebookPostgresDatabaseV1) {
      return database.prepare(this.query).bind(...this.values);
    }
    async first<Row extends Record<string, unknown>>(): Promise<Row | null> {
      return this.native(await open()).first<Row>();
    }
    async all<Row extends Record<string, unknown>>() {
      return this.native(await open()).all<Row>();
    }
    async run() { return this.native(await open()).run(); }
  }
  return {
    prepare: (query) => new Statement(query),
    query: async <Row extends Record<string, unknown>>(
      text: string,
      parameters: readonly D1WriteValueV1[],
    ) => (await open()).query<Row>(text, parameters),
    executeNative: async (text, parameters) => (await open()).executeNative(text, parameters),
    exec: async (query) => (await open()).exec(query),
    batch: async (statements) => {
      if (statements.some((statement) => !(statement instanceof Statement)))
        throw new Error('gradebook-request-statement-owner-invalid');
      const database = await open();
      if (!database.batch) throw new Error('gradebook-postgres-batch-required');
      return database.batch(statements.map((statement) => (statement as Statement).native(database)));
    },
    transaction: async (operation) => (await open()).transaction(operation),
    lastFailure: () => current?.lastFailure() ?? null,
    async close() {
      closed = true;
      const database = await pending?.catch(() => undefined);
      await database?.close();
    },
  };
}
