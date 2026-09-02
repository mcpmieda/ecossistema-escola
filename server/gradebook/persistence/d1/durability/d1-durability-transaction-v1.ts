import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../write/d1-write-adapter-v1';

let savepointSequence = 0;
const writeTails = new WeakMap<D1WriteDatabaseV1, Promise<void>>();

interface D1AtomicBatchDatabaseV1 extends D1WriteDatabaseV1 {
  batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]>;
}

function supportsAtomicBatch(database: D1WriteDatabaseV1): database is D1AtomicBatchDatabaseV1 {
  return typeof database.batch === 'function';
}

const MUTATION_GUARD_SQL =
  "SELECT CASE WHEN changes() = ? THEN 1 ELSE json('gradebook_durability_batch_guard_failure') END AS gradebook_durability_batch_guard";

export class GradebookD1DurabilityConflictV1 extends Error {
  constructor() {
    super('A escrita durável perdeu a disputa de versão.');
    this.name = 'GradebookD1DurabilityConflictV1';
  }
}

class RecordedDurabilityStatementV1 implements D1WriteStatementV1 {
  constructor(
    private readonly owner: AtomicDurabilityRecorderV1,
    private readonly statement: D1WriteStatementV1,
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new RecordedDurabilityStatementV1(this.owner, this.statement.bind(...values));
  }

  first<Row extends Record<string, unknown>>(): Promise<Row | null> {
    return this.statement.first<Row>();
  }

  all<Row extends Record<string, unknown>>(): Promise<{ readonly results: readonly Row[] }> {
    return this.statement.all<Row>();
  }

  async run(): Promise<D1WriteRunResultV1> {
    this.owner.recordMutation(this.statement);
    return { success: true, meta: { changes: 1 } };
  }
}

class AtomicDurabilityRecorderV1 implements D1WriteDatabaseV1 {
  private readonly statements: D1WriteStatementV1[] = [];

  constructor(private readonly database: D1AtomicBatchDatabaseV1) {}

  prepare(query: string): D1WriteStatementV1 {
    return new RecordedDurabilityStatementV1(this, this.database.prepare(query));
  }

  exec(): never {
    throw new GradebookD1DurabilityConflictV1();
  }

  recordMutation(statement: D1WriteStatementV1): void {
    this.statements.push(statement, this.database.prepare(MUTATION_GUARD_SQL).bind(1));
  }

  async commit(): Promise<void> {
    if (this.statements.length === 0) return;
    try {
      const results = await this.database.batch(this.statements);
      if (
        results.length !== this.statements.length ||
        results.some(({ success }) => success === false)
      ) {
        throw new GradebookD1DurabilityConflictV1();
      }
    } catch {
      throw new GradebookD1DurabilityConflictV1();
    }
  }
}

/**
 * Serializes writes that share one injected binding. Local SQLite keeps stream CAS plus history
 * append in a savepoint; remote D1 records the same mutations into one atomic batch with guards.
 * Database constraints remain the final concurrency guard across runtimes and isolates.
 */
export async function runGradebookD1DurabilitySavepointV1<Result>(
  database: D1WriteDatabaseV1,
  operation: (transactionDatabase: D1WriteDatabaseV1) => Promise<Result>,
): Promise<Result> {
  const previous = writeTails.get(database) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  writeTails.set(database, tail);

  await previous;
  try {
    if (supportsAtomicBatch(database)) {
      const recorder = new AtomicDurabilityRecorderV1(database);
      const result = await operation(recorder);
      await recorder.commit();
      return result;
    }

    const name = `gradebook_durability_${String(++savepointSequence)}`;
    await database.exec(`SAVEPOINT ${name}`);
    try {
      const result = await operation(database);
      await database.exec(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (cause) {
      await database.exec(`ROLLBACK TO SAVEPOINT ${name}`);
      await database.exec(`RELEASE SAVEPOINT ${name}`);
      throw cause;
    }
  } finally {
    release();
    if (writeTails.get(database) === tail) writeTails.delete(database);
  }
}
