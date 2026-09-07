import { describe, expect, it } from 'vitest';
import {
  isGradebookD1RetryableTransientErrorV1,
  observeGradebookD1RetryableTransientsV1,
} from '../../../server/gradebook/persistence/d1/transaction/d1-transient-observation-v1';
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

describe('D1 retryable transient observation', () => {
  it('matches only the documented transient family used by the import retry', () => {
    expect(isGradebookD1RetryableTransientErrorV1(new Error('Network connection lost'))).toBe(true);
    expect(
      isGradebookD1RetryableTransientErrorV1(
        new Error('Internal error in D1 DB storage caused object to be reset'),
      ),
    ).toBe(true);
    expect(isGradebookD1RetryableTransientErrorV1(new Error('D1_ERROR: query timeout'))).toBe(false);
    expect(isGradebookD1RetryableTransientErrorV1(new Error('database is overloaded'))).toBe(false);
  });

  it('observes a native batch transient without changing the statement objects sent to D1', async () => {
    const raw = statement();
    let received: readonly D1WriteStatementV1[] = [];
    const base: D1WriteDatabaseV1 = {
      prepare: () => raw,
      exec: async () => undefined,
      batch: async (statements): Promise<readonly D1WriteRunResultV1[]> => {
        received = statements;
        throw new Error('D1_ERROR: Network connection lost');
      },
    };
    const observed = observeGradebookD1RetryableTransientsV1(base);
    const prepared = observed.database.prepare('SELECT 1');

    await expect(observed.database.batch?.([prepared])).rejects.toThrow('Network connection lost');
    expect(received).toEqual([raw]);
    expect(observed.retryableTransientObserved()).toBe(true);
  });
});
