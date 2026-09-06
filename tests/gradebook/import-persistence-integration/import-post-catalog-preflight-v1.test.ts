import { describe, expect, it } from 'vitest';
import { resolveGradebookImportPostCatalogPreflightV1 } from '../../../server/gradebook/application/import/import-persistence-service-v5';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('gradebook post-catalog preflight overlap', () => {
  it('starts annual, source and additional catalog work before awaiting any of them', async () => {
    const annual = deferred<string>();
    const source = deferred<void>();
    const additional = deferred<readonly []>();
    const started: string[] = [];

    const pending = resolveGradebookImportPostCatalogPreflightV1({
      loadAnnualState: () => {
        started.push('annual');
        return annual.promise;
      },
      warmSource: () => {
        started.push('source');
        return source.promise;
      },
      loadAdditionalCatalogRecords: () => {
        started.push('additional');
        return additional.promise;
      },
    });

    expect(started).toEqual(['annual', 'source', 'additional']);

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    annual.resolve('annual-ready');
    await Promise.resolve();
    expect(settled).toBe(false);
    source.resolve(undefined);
    await Promise.resolve();
    expect(settled).toBe(false);
    additional.resolve([]);

    await expect(pending).resolves.toEqual({
      annualStateSource: 'annual-ready',
      additionalRecords: [],
    });
  });

  it('propagates additional catalog failures fail-closed', async () => {
    await expect(
      resolveGradebookImportPostCatalogPreflightV1({
        loadAnnualState: async () => 'annual-ready',
        warmSource: async () => undefined,
        loadAdditionalCatalogRecords: async () => {
          throw new Error('synthetic-additional-record-failure');
        },
      }),
    ).rejects.toThrow('synthetic-additional-record-failure');
  });
});
