import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistGradebookValuesSnapshotV8 } from '../../../src/features/gradebook/import/import-persistence-client-v8';
import { valuesRequestV8 } from '../import-persistence-integration/values-v8-test-support';
import { GRADEBOOK_IMPORT_FAILURE_HEADER_V1 } from '../../../shared/gradebook-import-diagnostics-v1';
import { isGradebookImportPersistenceRequestV8 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Value snapshot V8 client and contract', () => {
  it.each([401, 403])(
    'handles HTTP %i without parsing private HTML or replaying',
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response('<html>SYNTHETIC_PRIVATE</html>', { status }));
      vi.stubGlobal('fetch', fetch);
      expect(await persistGradebookValuesSnapshotV8(valuesRequestV8())).toMatchObject({
        response: { state: 'not-authorized' },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves unavailable and sanitized diagnostic without exposing raw error fields', async () => {
    const diagnostic = {
      version: 1,
      events: [{ phase: 'd1', code: 'd1-rpc-limit', operation: 'batch' }],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { transportVersion: 8, state: 'unavailable' },
            {
              status: 503,
              headers: {
                [GRADEBOOK_IMPORT_FAILURE_HEADER_V1]: JSON.stringify(diagnostic),
                'X-Gradebook-Server-Ms': '125',
              },
            },
          ),
        ),
    );
    const report = vi.fn();
    expect(await persistGradebookValuesSnapshotV8(valuesRequestV8(), report)).toEqual({
      response: { transportVersion: 6, state: 'unavailable' },
      serverMs: 125,
    });
    expect(report).toHaveBeenCalledWith(diagnostic);
  });
  it('never retries after an uncertain commit or a diagnostic callback exception', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('synthetic lost reply'));
    vi.stubGlobal('fetch', fetch);
    await expect(persistGradebookValuesSnapshotV8(valuesRequestV8())).rejects.toThrow(
      'synthetic lost reply',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(
      Response.json(
        { transportVersion: 8, state: 'unavailable' },
        {
          headers: {
            [GRADEBOOK_IMPORT_FAILURE_HEADER_V1]: JSON.stringify({
              version: 1,
              events: [{ phase: 'transaction', code: 'transaction-failed', operation: 'none' }],
            }),
          },
        },
      ),
    );
    await expect(
      persistGradebookValuesSnapshotV8(valuesRequestV8(), () => {
        throw new Error('synthetic callback');
      }),
    ).resolves.toMatchObject({ response: { state: 'unavailable' } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('bounds a hanging request and clears its timer without retry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('synthetic timeout', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = persistGradebookValuesSnapshotV8(valuesRequestV8()).catch(
      (cause: unknown) => cause,
    );
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects malformed or older envelopes and does not expose the response body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('<html>SYNTHETIC_PRIVATE</html>', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(persistGradebookValuesSnapshotV8(valuesRequestV8())).rejects.toThrow('HTTP 503');
    fetch.mockResolvedValue(Response.json({ transportVersion: 6, state: 'unavailable' }));
    await expect(persistGradebookValuesSnapshotV8(valuesRequestV8())).rejects.toThrow(
      'Resposta incompatível',
    );
  });
  it('requires the V8 policy, rejects formulas and internal markers, and retains the unavailable marker', () => {
    const input = valuesRequestV8();
    expect(isGradebookImportPersistenceRequestV8(input)).toBe(true);
    expect(isGradebookImportPersistenceRequestV8({ ...input, valuePolicy: 'unknown' })).toBe(false);
    const mutate = (cell: unknown) => {
      const clone = structuredClone(input) as unknown as {
        courses: { terms: { rows: [number, Record<string, unknown>][] }[] }[];
      };
      clone.courses[0]!.terms[0]!.rows[0]![1].R = cell;
      return clone;
    };
    for (const bad of [
      ['f', 8, 8, 'SYNTHETIC_FORMULA()'],
      ['u', 'raw'],
      '\u0000gradebook-snapshot-unavailable-v1',
      Infinity,
      null,
      { formula: 'SYNTHETIC()' },
    ])
      expect(isGradebookImportPersistenceRequestV8(mutate(bad))).toBe(false);
    expect(isGradebookImportPersistenceRequestV8(mutate(['u']))).toBe(true);
    expect(isGradebookImportPersistenceRequestV8(mutate('x'.repeat(2_100_000)))).toBe(false);
  });
});
