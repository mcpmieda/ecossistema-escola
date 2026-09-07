import { describe, expect, it, vi } from 'vitest';
import { parseGradebookImportFailureDiagnosticV1 } from '../../../shared/gradebook-import-diagnostics-v1';
import {
  classifyGradebookImportFailureV1,
  createGradebookImportFailureCollectorV1,
  reportGradebookImportFailureV1,
} from '../../../server/gradebook/application/import/import-failure-diagnostics-v1';
import { observeGradebookD1RetryableTransientsV1 } from '../../../server/gradebook/persistence/d1/transaction/d1-transient-observation-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteStatementV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';

const marker = 'SYNTHETIC_PRIVATE_MARKER_NOT_FOR_TELEMETRY';

describe('Sanitised import failure diagnostics', () => {
  it.each([
    ['Too many subrequests', 'd1-subrequest-limit'],
    ['Too many API requests', 'd1-subrequest-limit'],
    ['D1_ERROR: string or blob too big: SQLITE_TOOBIG', 'd1-size-limit'],
    ['D1_ERROR: too many SQL variables', 'd1-parameter-limit'],
    ['D1_ERROR: query timeout', 'd1-timeout'],
    ['D1 database overloaded', 'd1-overloaded'],
    ['out of memory', 'd1-memory'],
    ['FOREIGN KEY constraint failed', 'd1-foreign-key'],
    ['UNIQUE constraint failed', 'd1-unique'],
    ['CHECK constraint failed', 'd1-check'],
    ['NOT NULL constraint failed', 'd1-not-null'],
    ['no such column', 'd1-schema'],
    ['Network connection lost', 'd1-transient'],
    ['gradebook_atomic_batch_guard_failure', 'd1-cas'],
    ['malformed JSON', 'invalid-json'],
  ])('categorises %s without keeping the raw message', (message, code) => {
    const collector = createGradebookImportFailureCollectorV1();
    collector.d1('batch', new Error(`${message}: ${marker}`));
    const raw = JSON.stringify(collector.snapshot());
    expect(raw).not.toContain(marker);
    expect(parseGradebookImportFailureDiagnosticV1(raw)?.events).toEqual([
      { phase: 'd1', code, operation: 'batch' },
    ]);
  });

  it('bounds nested causes and event count, with independent snapshots', () => {
    const error = new Error('outer', { cause: new Error('D1_ERROR: UNIQUE constraint failed') });
    expect(classifyGradebookImportFailureV1(error)).toBe('d1-unique');
    const cycle = new Error(marker);
    cycle.cause = cycle;
    expect(classifyGradebookImportFailureV1(cycle)).toBe('unexpected-error');
    const collector = createGradebookImportFailureCollectorV1();
    for (let i = 0; i < 10; i++) collector.d1(i % 2 ? 'all' : 'batch', error);
    const snapshot = collector.snapshot();
    expect(snapshot.events).toHaveLength(4);
    collector.report('transaction', 'transaction-failed');
    expect(snapshot.events.at(-1)?.phase).toBe('d1');
    expect(collector.snapshot().events.at(-1)?.phase).toBe('transaction');
  });

  it('rejects raw text, unknown fields, codes and excessive payloads', () => {
    const event = { phase: 'transaction', code: 'transaction-failed', operation: 'none' };
    for (const value of [
      null,
      {},
      { version: 1, events: [] },
      { version: 2, events: [event] },
      { version: 1, events: [event], sql: marker },
      { version: 1, events: [{ ...event, message: marker }] },
      { version: 1, events: [{ ...event, code: marker }] },
      { version: 1, events: [{ ...event, phase: marker }] },
      { version: 1, events: [{ ...event, operation: marker }] },
      { version: 1, events: Array(5).fill(event) },
    ])
      expect(parseGradebookImportFailureDiagnosticV1(JSON.stringify(value))).toBeNull();
    expect(parseGradebookImportFailureDiagnosticV1(marker.repeat(2048))).toBeNull();
  });

  it('cannot let a reporting failure change persistence', () => {
    expect(() =>
      reportGradebookImportFailureV1(
        () => {
          throw new Error(marker);
        },
        'catalog',
        'unexpected-error',
      ),
    ).not.toThrow();
  });

  it.each(['prepare', 'bind', 'first', 'all', 'run', 'batch', 'exec'] as const)(
    'observes %s without retrying or replacing the exception',
    async (operation) => {
      const cause = new Error(`UNIQUE constraint failed: ${marker}`);
      const collector = createGradebookImportFailureCollectorV1();
      const raw: D1WriteStatementV1 = {
        bind() {
          if (operation === 'bind') throw cause;
          return raw;
        },
        first: async () => {
          if (operation === 'first') throw cause;
          return null;
        },
        all: async () => {
          if (operation === 'all') throw cause;
          return { results: [] };
        },
        run: async () => {
          if (operation === 'run') throw cause;
          return { success: true };
        },
      };
      const base: D1WriteDatabaseV1 = {
        prepare() {
          if (operation === 'prepare') throw cause;
          return raw;
        },
        exec: async () => {
          throw cause;
        },
        batch: vi.fn(async () => {
          throw cause;
        }),
      };
      const observed = observeGradebookD1RetryableTransientsV1(base, collector.d1);
      const invoke = async () => {
        if (operation === 'exec') return observed.database.exec('SYNTHETIC');
        const statement = observed.database.prepare('SYNTHETIC').bind(1);
        if (operation === 'batch') return observed.database.batch!([statement]);
        if (operation === 'first' || operation === 'all' || operation === 'run')
          return statement[operation]();
      };
      await expect(invoke()).rejects.toBe(cause);
      expect(observed.retryableTransientObserved()).toBe(false);
      expect(collector.snapshot().events).toEqual([{ phase: 'd1', code: 'd1-unique', operation }]);
      expect(JSON.stringify(collector.snapshot())).not.toContain(marker);
    },
  );
});
