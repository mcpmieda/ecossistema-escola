import { describe, expect, it } from 'vitest';
import {
  GradebookD1AtomicBatchRecorderV1,
  type GradebookD1TransactionErrorV1,
} from '../../../server/gradebook/persistence/d1/transaction/d1-batch-promotion-transaction-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';

function statement(): D1WriteStatementV1 {
  const value: D1WriteStatementV1 = {
    bind: () => value,
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({ success: true, meta: { changes: 1 } }),
  };
  return value;
}

function database(error: Error): D1WriteDatabaseV1 & {
  batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]>;
} {
  return {
    prepare: () => statement(),
    exec: async () => undefined,
    batch: async () => {
      throw error;
    },
  } as D1WriteDatabaseV1 & {
    batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]>;
  };
}

async function commitCode(error: Error): Promise<string | null> {
  const recorder = new GradebookD1AtomicBatchRecorderV1(database(error));
  recorder.recordMutation(statement(), 1);
  try {
    await recorder.commit();
    return null;
  } catch (cause) {
    return (cause as GradebookD1TransactionErrorV1).code;
  }
}

describe('D1 atomic batch failure classification', () => {
  it('keeps an explicit optimistic guard failure as a version conflict', async () => {
    await expect(commitCode(new Error('D1_ERROR: malformed JSON: SQLITE_ERROR'))).resolves.toBe(
      'batch-version-conflict',
    );
  });

  it.each([
    'D1_ERROR: query timeout',
    'D1_ERROR: database is overloaded',
    'D1_ERROR: FOREIGN KEY constraint failed',
  ])('does not mislabel operational failure as conflict: %s', async (message) => {
    await expect(commitCode(new Error(message))).resolves.toBe('transaction-failed');
  });
});
