import { describe, expect, it } from 'vitest';
import { instrumentGradebookD1ForBenchmarkV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-benchmark-instrumentation-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type { D1ReadResultV1 } from '../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';

type Row = Record<string, unknown>;

function readResult<RowValue extends Row>(sqlMs: number): D1ReadResultV1<RowValue> {
  return {
    results: [],
    meta: { timings: { sql_duration_ms: sqlMs } },
  } as unknown as D1ReadResultV1<RowValue>;
}

function writeResult(sqlMs: number): D1WriteRunResultV1 {
  return {
    success: true,
    changes: 1,
    meta: { changes: 1, timings: { sql_duration_ms: sqlMs } },
  } as unknown as D1WriteRunResultV1;
}

class SyntheticStatement implements D1WriteStatementV1 {
  constructor(private readonly query: string) {}

  bind(): D1WriteStatementV1 {
    return new SyntheticStatement(this.query);
  }

  async first<RowValue extends Row>(): Promise<RowValue | null> {
    return { query: this.query } as unknown as RowValue;
  }

  async all<RowValue extends Row>(): Promise<D1ReadResultV1<RowValue>> {
    return readResult<RowValue>(2.5);
  }

  async run(): Promise<D1WriteRunResultV1> {
    return writeResult(3.5);
  }
}

class SyntheticDatabase implements D1WriteDatabaseV1 {
  readonly batchReceived: D1WriteStatementV1[][] = [];

  prepare(query: string): D1WriteStatementV1 {
    return new SyntheticStatement(query);
  }

  exec(): unknown {
    return { duration: 99 };
  }

  async batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]> {
    this.batchReceived.push([...statements]);
    return [writeResult(4), writeResult(5)];
  }
}

describe('D1 benchmark instrumentation', () => {
  it('counts bounded calls and exposes only aggregate wall/SQL timing', async () => {
    const raw = new SyntheticDatabase();
    const benchmark = instrumentGradebookD1ForBenchmarkV1(raw);
    const prepared = benchmark.database.prepare('SELECT synthetic').bind('ignored');

    await prepared.first();
    await prepared.all();
    await prepared.run();
    await benchmark.database.batch?.([prepared]);
    await benchmark.database.exec('PRAGMA synthetic');

    const snapshot = benchmark.snapshot();
    expect(snapshot).toMatchObject({
      calls: 5,
      firstCalls: 1,
      allCalls: 1,
      runCalls: 1,
      batchCalls: 1,
      execCalls: 1,
      sqlMs: 15,
    });
    expect(snapshot.wallMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.maxCallMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.maxCallMs).toBeLessThanOrEqual(snapshot.wallMs + 0.1);
    expect(raw.batchReceived).toHaveLength(1);
  });

  it('leaves sqlMs null when D1 metadata does not expose sql_duration_ms', async () => {
    const raw: D1WriteDatabaseV1 = {
      prepare: () => ({
        bind() {
          return this;
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true, changes: 0 };
        },
      }),
      exec: () => undefined,
    };
    const benchmark = instrumentGradebookD1ForBenchmarkV1(raw);
    await benchmark.database.prepare('SELECT 1').all();
    expect(benchmark.snapshot().sqlMs).toBeNull();
  });
});
