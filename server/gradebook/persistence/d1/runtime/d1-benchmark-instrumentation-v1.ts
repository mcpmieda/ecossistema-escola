import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../write/d1-write-adapter-v1';
import type { D1ReadResultV1 } from '../read/d1-read-adapter-v1';

export interface GradebookD1BenchmarkSnapshotV1 {
  readonly calls: number;
  readonly firstCalls: number;
  readonly allCalls: number;
  readonly runCalls: number;
  readonly batchCalls: number;
  readonly execCalls: number;
  readonly wallMs: number;
  readonly maxCallMs: number;
  readonly sqlMs: number | null;
}

type D1ResultWithMetaV1 = {
  readonly meta?: {
    readonly timings?: {
      readonly sql_duration_ms?: unknown;
    };
  };
};

interface MutableMetricsV1 {
  calls: number;
  firstCalls: number;
  allCalls: number;
  runCalls: number;
  batchCalls: number;
  execCalls: number;
  wallMs: number;
  maxCallMs: number;
  sqlMs: number;
  sqlSamples: number;
}

const rawStatement = Symbol('gradebook-d1-benchmark-raw-statement');

type InstrumentedStatementV1 = D1WriteStatementV1 & {
  readonly [rawStatement]: D1WriteStatementV1;
};

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function sqlDuration(value: unknown): number | null {
  if (value === null || typeof value !== 'object') return null;
  const duration = (value as D1ResultWithMetaV1).meta?.timings?.sql_duration_ms;
  return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function record(
  metrics: MutableMetricsV1,
  kind: 'first' | 'all' | 'run' | 'batch' | 'exec',
  startedAt: number,
  sqlMs: number | null,
): void {
  const elapsed = Math.max(0, nowMs() - startedAt);
  metrics.calls += 1;
  metrics.wallMs += elapsed;
  metrics.maxCallMs = Math.max(metrics.maxCallMs, elapsed);
  if (kind === 'first') metrics.firstCalls += 1;
  if (kind === 'all') metrics.allCalls += 1;
  if (kind === 'run') metrics.runCalls += 1;
  if (kind === 'batch') metrics.batchCalls += 1;
  if (kind === 'exec') metrics.execCalls += 1;
  if (sqlMs !== null) {
    metrics.sqlMs += sqlMs;
    metrics.sqlSamples += 1;
  }
}

function statement(
  raw: D1WriteStatementV1,
  metrics: MutableMetricsV1,
): InstrumentedStatementV1 {
  return {
    [rawStatement]: raw,
    bind(...values) {
      return statement(raw.bind(...values), metrics);
    },
    async first<Row extends Record<string, unknown>>(): Promise<Row | null> {
      const startedAt = nowMs();
      try {
        return await raw.first<Row>();
      } finally {
        record(metrics, 'first', startedAt, null);
      }
    },
    async all<Row extends Record<string, unknown>>(): Promise<D1ReadResultV1<Row>> {
      const startedAt = nowMs();
      let result: D1ReadResultV1<Row> | null = null;
      try {
        result = await raw.all<Row>();
        return result;
      } finally {
        record(metrics, 'all', startedAt, sqlDuration(result));
      }
    },
    async run(): Promise<D1WriteRunResultV1> {
      const startedAt = nowMs();
      let result: D1WriteRunResultV1 | null = null;
      try {
        result = await raw.run();
        return result;
      } finally {
        record(metrics, 'run', startedAt, sqlDuration(result));
      }
    },
  };
}

function unwrapStatement(value: D1WriteStatementV1): D1WriteStatementV1 {
  return (
    value as D1WriteStatementV1 & {
      readonly [rawStatement]?: D1WriteStatementV1;
    }
  )[rawStatement] ?? value;
}

export function instrumentGradebookD1ForBenchmarkV1(database: D1WriteDatabaseV1): {
  readonly database: D1WriteDatabaseV1;
  readonly snapshot: () => GradebookD1BenchmarkSnapshotV1;
} {
  const metrics: MutableMetricsV1 = {
    calls: 0,
    firstCalls: 0,
    allCalls: 0,
    runCalls: 0,
    batchCalls: 0,
    execCalls: 0,
    wallMs: 0,
    maxCallMs: 0,
    sqlMs: 0,
    sqlSamples: 0,
  };

  const instrumented: D1WriteDatabaseV1 = {
    prepare(query: string): D1WriteStatementV1 {
      return statement(database.prepare(query), metrics);
    },
    async exec(query: string): Promise<unknown> {
      const startedAt = nowMs();
      try {
        return await database.exec(query);
      } finally {
        record(metrics, 'exec', startedAt, null);
      }
    },
    ...(database.batch
      ? {
          batch: async (
            statements: readonly D1WriteStatementV1[],
          ): Promise<readonly D1WriteRunResultV1[]> => {
            const startedAt = nowMs();
            let results: readonly D1WriteRunResultV1[] | null = null;
            try {
              results = await database.batch!(statements.map(unwrapStatement));
              return results;
            } finally {
              const measured = results
                ?.map(sqlDuration)
                .filter((value): value is number => value !== null);
              record(
                metrics,
                'batch',
                startedAt,
                measured && measured.length > 0
                  ? measured.reduce((sum, value) => sum + value, 0)
                  : null,
              );
            }
          },
        }
      : {}),
  };

  return {
    database: instrumented,
    snapshot: () => ({
      calls: metrics.calls,
      firstCalls: metrics.firstCalls,
      allCalls: metrics.allCalls,
      runCalls: metrics.runCalls,
      batchCalls: metrics.batchCalls,
      execCalls: metrics.execCalls,
      wallMs: rounded(metrics.wallMs),
      maxCallMs: rounded(metrics.maxCallMs),
      sqlMs: metrics.sqlSamples > 0 ? rounded(metrics.sqlMs) : null,
    }),
  };
}
