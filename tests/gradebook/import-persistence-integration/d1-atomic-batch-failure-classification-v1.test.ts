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

async function commitFailure(error: Error): Promise<{
  readonly code: GradebookD1TransactionErrorV1['code'];
  readonly retryability: GradebookD1TransactionErrorV1['retryability'];
} | null> {
  const recorder = new GradebookD1AtomicBatchRecorderV1(database(error));
  recorder.recordMutation(statement(), 1);
  try {
    await recorder.commit();
    return null;
  } catch (cause) {
    const failure = cause as GradebookD1TransactionErrorV1;
    return { code: failure.code, retryability: failure.retryability };
  }
}

describe('D1 atomic batch failure classification', () => {
  it('keeps an explicit optimistic guard failure as a non-retryable version conflict', async () => {
    await expect(commitFailure(new Error('D1_ERROR: malformed JSON: SQLITE_ERROR'))).resolves.toEqual({
      code: 'batch-version-conflict',
      retryability: 'never',
    });
  });

  it.each([
    'D1_ERROR: Network connection lost while executing query',
    'D1_ERROR: storage caused object to be reset',
    'D1_ERROR: reset because its code was updated',
  ])('marks only a documented D1 transient family as retryable: %s', async (message) => {
    await expect(commitFailure(new Error(message))).resolves.toEqual({
      code: 'transaction-failed',
      retryability: 'transient-d1',
    });
  });

  it.each([
    'D1_ERROR: query timeout',
    'D1_ERROR: database is overloaded',
    'D1_ERROR: FOREIGN KEY constraint failed',
    'D1_ERROR: UNIQUE constraint failed',
  ])('keeps other operational failures non-retryable and out of CAS: %s', async (message) => {
    await expect(commitFailure(new Error(message))).resolves.toEqual({
      code: 'transaction-failed',
      retryability: 'never',
    });
  });
});
