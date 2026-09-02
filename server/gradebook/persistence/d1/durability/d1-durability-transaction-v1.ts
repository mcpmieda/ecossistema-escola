import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';

let savepointSequence = 0;
const writeTails = new WeakMap<D1WriteDatabaseV1, Promise<void>>();

/**
 * Serializes local writes that share one injected binding and keeps stream CAS plus history append
 * in the same savepoint. The database constraints remain the final concurrency guard across
 * independently instantiated runtimes/isolates.
 */
export async function runGradebookD1DurabilitySavepointV1<Result>(
  database: D1WriteDatabaseV1,
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous = writeTails.get(database) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  writeTails.set(database, tail);

  await previous;
  const name = `gradebook_durability_${String(++savepointSequence)}`;
  try {
    await database.exec(`SAVEPOINT ${name}`);
    try {
      const result = await operation();
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
