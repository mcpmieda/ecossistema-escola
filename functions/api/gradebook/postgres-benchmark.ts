import { capabilitiesForRoles, requireCapability } from '../../../server/auth/capabilities';
import { AuthenticationError, requireAuth } from '../../../server/auth/session';
import { AuthorizationError } from '../../../server/auth/roles';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import { enforceOfficialOrigin, enforceWriteOrigin, HttpError } from '../../../server/http/security';
import {
  createPostgresBenchmarkSnapshotV1,
  parsePostgresBenchmarkApplyResultV1,
  POSTGRES_BENCHMARK_DEFAULT_CHANGED_V1,
  POSTGRES_BENCHMARK_DEFAULT_SIZE_V1,
  POSTGRES_BENCHMARK_MAX_SIZE_V1,
} from '../../../server/gradebook/benchmark/postgres-benchmark-v1';

type HyperdriveBindingV1 = { readonly connectionString: string };
type BenchmarkEnvV1 = RuntimeEnv & { readonly PROD_DB?: HyperdriveBindingV1 };
type Context = EventContext<BenchmarkEnvV1, string, unknown>;
type PostgresFactoryV1 = typeof import('postgres');
type PostgresClientV1 = ReturnType<PostgresFactoryV1>;
type BenchmarkFailureStageV1 =
  | 'environment'
  | 'authorization'
  | 'request'
  | 'binding'
  | 'driver'
  | 'connection'
  | 'first-apply'
  | 'no-changes'
  | 'changed-apply'
  | 'cleanup-reset'
  | 'cleanup-close';
type ProbeStageV1 =
  | 'connection'
  | 'parameter-text'
  | 'parameter-jsonb'
  | 'direct-insert'
  | 'transaction'
  | 'function-call'
  | 'function-result';

interface BenchmarkRequestV1 {
  readonly operation: 'run' | 'probe';
  readonly size?: number;
  readonly changed?: number;
}

interface ProbeResultV1 {
  readonly stage: ProbeStageV1;
  readonly state: 'passed' | 'failed' | 'skipped';
  readonly ms: number;
  readonly sqlState?: string;
}

function parseRequest(value: unknown): Required<BenchmarkRequestV1> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'Invalid benchmark request');
  const body = value as Record<string, unknown>;
  if (body.operation !== 'run' && body.operation !== 'probe')
    throw new HttpError(400, 'Invalid benchmark request');
  const size = body.operation === 'probe' ? 1 : (body.size ?? POSTGRES_BENCHMARK_DEFAULT_SIZE_V1);
  const changed =
    body.operation === 'probe' ? 1 : (body.changed ?? POSTGRES_BENCHMARK_DEFAULT_CHANGED_V1);
  if (
    !Number.isInteger(size) ||
    (size as number) < 1 ||
    (size as number) > POSTGRES_BENCHMARK_MAX_SIZE_V1
  )
    throw new HttpError(400, 'Invalid benchmark size');
  if (
    !Number.isInteger(changed) ||
    (changed as number) < 0 ||
    (changed as number) > (size as number)
  )
    throw new HttpError(400, 'Invalid benchmark changed count');
  return { operation: body.operation, size: size as number, changed: changed as number };
}

async function body(request: Request): Promise<Required<BenchmarkRequestV1>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 4_096)
    throw new HttpError(413, 'Benchmark request too large');
  try {
    return parseRequest(JSON.parse(text));
  } catch (cause) {
    if (cause instanceof HttpError) throw cause;
    throw new HttpError(400, 'Invalid benchmark request');
  }
}

function milliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  });
}

function safeSqlState(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return undefined;
  const code = cause.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/u.test(code) ? code : undefined;
}

function failureResponse(
  stage: BenchmarkFailureStageV1,
  cause: unknown,
  explicitCode?: string,
): Response {
  const status =
    cause instanceof HttpError ||
    cause instanceof AuthenticationError ||
    cause instanceof AuthorizationError
      ? cause.status
      : 503;
  const code =
    explicitCode ??
    (cause instanceof AuthenticationError || cause instanceof AuthorizationError
      ? 'not-authorized'
      : cause instanceof HttpError
        ? 'invalid-request'
        : stage === 'driver'
          ? 'driver-load-failed'
          : stage === 'binding'
            ? 'binding-missing'
            : stage === 'connection'
              ? 'connection-failed'
              : stage.startsWith('cleanup-')
                ? 'cleanup-failed'
                : 'benchmark-runtime-failed');
  console.error(
    JSON.stringify({
      message: 'postgres_benchmark_failed',
      stage,
      code,
      errorType: cause instanceof Error ? cause.name : 'unknown',
      sqlState: safeSqlState(cause) ?? null,
    }),
  );
  return noStoreJson(
    {
      version: 1,
      state: 'failed',
      provider: 'postgres-hyperdrive',
      stage,
      code,
      ...(safeSqlState(cause) ? { sqlState: safeSqlState(cause) } : {}),
    },
    status,
  );
}

function scalarInteger(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed))
    throw new TypeError('postgres-probe-result-invalid');
  return parsed;
}

async function probeStepV1(
  stage: ProbeStageV1,
  operation: () => Promise<void>,
): Promise<ProbeResultV1> {
  const startedAt = performance.now();
  try {
    await operation();
    return { stage, state: 'passed', ms: milliseconds(startedAt) };
  } catch (cause) {
    return {
      stage,
      state: 'failed',
      ms: milliseconds(startedAt),
      ...(safeSqlState(cause) ? { sqlState: safeSqlState(cause) } : {}),
    };
  }
}

async function runProbeV1(sql: PostgresClientV1): Promise<{
  readonly response: Response;
  readonly cleanupIds: readonly string[];
}> {
  const probes: ProbeResultV1[] = [];
  const cleanupIds: string[] = [];
  const directId = `synthetic-probe-direct:${crypto.randomUUID()}`;
  const transactionId = `synthetic-probe-transaction:${crypto.randomUUID()}`;
  const functionId = `synthetic-probe-function:${crypto.randomUUID()}`;
  cleanupIds.push(directId, transactionId, functionId);

  const connection = await probeStepV1('connection', async () => {
    const rows = await sql`select 1::int as ok`;
    if (scalarInteger(rows[0]?.ok) !== 1) throw new TypeError('postgres-probe-result-invalid');
  });
  probes.push(connection);
  if (connection.state === 'failed') {
    return {
      response: noStoreJson({
        version: 1,
        state: 'probe-completed',
        provider: 'postgres-hyperdrive',
        syntheticOnly: true,
        probes,
      }),
      cleanupIds,
    };
  }

  probes.push(
    await probeStepV1('parameter-text', async () => {
      const marker = 'hyperdrive-probe-v1';
      const rows = await sql`select ${marker}::text as value`;
      if (rows[0]?.value !== marker) throw new TypeError('postgres-probe-result-invalid');
    }),
  );

  probes.push(
    await probeStepV1('parameter-jsonb', async () => {
      const payload = JSON.stringify([{ value: 1 }]);
      const rows = await sql`select jsonb_array_length(${payload}::jsonb)::int as count`;
      if (scalarInteger(rows[0]?.count) !== 1) throw new TypeError('postgres-probe-result-invalid');
    }),
  );

  probes.push(
    await probeStepV1('direct-insert', async () => {
      await sql`
        insert into bn_benchmark.streams
          (benchmark_id, stream_key, current_version, payload_hash, updated_at)
        values (${directId}, 'stream:1', 1, ${'1'.repeat(64)}, clock_timestamp())
      `;
      const rows = await sql`
        select count(*)::int as count
        from bn_benchmark.streams
        where benchmark_id = ${directId}
      `;
      if (scalarInteger(rows[0]?.count) !== 1) throw new TypeError('postgres-probe-result-invalid');
    }),
  );

  probes.push(
    await probeStepV1('transaction', async () => {
      const payload = JSON.stringify({ probe: true });
      await sql.begin(async (transaction) => {
        await transaction`
          insert into bn_benchmark.streams
            (benchmark_id, stream_key, current_version, payload_hash, updated_at)
          values (${transactionId}, 'stream:1', 1, ${'2'.repeat(64)}, clock_timestamp())
        `;
        await transaction`
          insert into bn_benchmark.versions
            (benchmark_id, stream_key, version, payload_hash, payload, recorded_at)
          values (
            ${transactionId}, 'stream:1', 1, ${'2'.repeat(64)},
            ${payload}::jsonb, clock_timestamp()
          )
        `;
      });
      const rows = await sql`
        select count(*)::int as count
        from bn_benchmark.versions
        where benchmark_id = ${transactionId}
      `;
      if (scalarInteger(rows[0]?.count) !== 1) throw new TypeError('postgres-probe-result-invalid');
    }),
  );

  const baseline = createPostgresBenchmarkSnapshotV1(1, 1, 1);
  let functionRows: readonly Record<string, unknown>[] | null = null;
  probes.push(
    await probeStepV1('function-call', async () => {
      functionRows = await sql`
        select * from bn_benchmark.apply_snapshot(
          ${functionId},
          ${JSON.stringify(baseline)}::jsonb
        )
      `;
      if (functionRows.length !== 1) throw new TypeError('postgres-probe-result-invalid');
    }),
  );

  if (functionRows) {
    probes.push(
      await probeStepV1('function-result', async () => {
        const result = parsePostgresBenchmarkApplyResultV1(functionRows?.[0]);
        if (result.total !== 1 || result.changed !== 1 || result.unchanged !== 0)
          throw new TypeError('postgres-probe-result-invalid');
      }),
    );
  } else {
    probes.push({ stage: 'function-result', state: 'skipped', ms: 0 });
  }

  return {
    response: noStoreJson({
      version: 1,
      state: 'probe-completed',
      provider: 'postgres-hyperdrive',
      syntheticOnly: true,
      probes,
    }),
    cleanupIds,
  };
}

export const onRequestPost: PagesFunction<BenchmarkEnvV1> = async (context: Context) => {
  let stage: BenchmarkFailureStageV1 = 'environment';
  let sql: PostgresClientV1 | null = null;
  let benchmarkId: string | null = null;
  let probeCleanupIds: readonly string[] = [];
  let response: Response | null = null;
  let operationFailure: { readonly stage: BenchmarkFailureStageV1; readonly cause: unknown } | null =
    null;

  try {
    const rawEnv = context.env;
    const env = validateEnv(rawEnv as RuntimeEnv);
    const request = context.request;
    enforceOfficialOrigin(request, env);
    enforceWriteOrigin(request, env);

    stage = 'authorization';
    const session = await requireAuth(request, env);
    requireCapability(capabilitiesForRoles(session.roles), 'gradebook.persistence.admin');

    stage = 'request';
    const input = await body(request);

    stage = 'binding';
    const binding = rawEnv.PROD_DB;
    if (!binding?.connectionString)
      throw Object.assign(new HttpError(503, 'Postgres benchmark unavailable'), {
        benchmarkCode: 'binding-missing',
      });

    stage = 'driver';
    const module = await import('postgres');
    const postgres = ((module as unknown as { default?: PostgresFactoryV1 }).default ??
      module) as PostgresFactoryV1;

    sql = postgres(binding.connectionString, {
      max: 5,
      fetch_types: false,
      prepare: true,
      connect_timeout: 10,
      idle_timeout: 2,
      max_lifetime: 60,
    });

    if (input.operation === 'probe') {
      const probe = await runProbeV1(sql);
      response = probe.response;
      probeCleanupIds = probe.cleanupIds;
    } else {
      benchmarkId = `synthetic:${crypto.randomUUID()}`;
      const baseline = createPostgresBenchmarkSnapshotV1(input.size, 1, input.size);
      const changed = createPostgresBenchmarkSnapshotV1(input.size, 2, input.changed);
      const totalStartedAt = performance.now();

      stage = 'connection';
      const connectionStartedAt = performance.now();
      await sql`select current_timestamp`;
      const connectionMs = milliseconds(connectionStartedAt);

      stage = 'first-apply';
      const firstStartedAt = performance.now();
      const firstRows = await sql`
        select * from bn_benchmark.apply_snapshot(
          ${benchmarkId},
          ${JSON.stringify(baseline)}::jsonb
        )
      `;
      const firstMs = milliseconds(firstStartedAt);
      const first = parsePostgresBenchmarkApplyResultV1(firstRows[0]);

      stage = 'no-changes';
      const noChangesStartedAt = performance.now();
      const noChangesRows = await sql`
        select * from bn_benchmark.apply_snapshot(
          ${benchmarkId},
          ${JSON.stringify(baseline)}::jsonb
        )
      `;
      const noChangesMs = milliseconds(noChangesStartedAt);
      const noChanges = parsePostgresBenchmarkApplyResultV1(noChangesRows[0]);

      stage = 'changed-apply';
      const changedStartedAt = performance.now();
      const changedRows = await sql`
        select * from bn_benchmark.apply_snapshot(
          ${benchmarkId},
          ${JSON.stringify(changed)}::jsonb
        )
      `;
      const changedMs = milliseconds(changedStartedAt);
      const changedResult = parsePostgresBenchmarkApplyResultV1(changedRows[0]);

      response = noStoreJson({
        version: 1,
        state: 'completed',
        provider: 'postgres-hyperdrive',
        syntheticOnly: true,
        size: input.size,
        changedRequested: input.changed,
        timingsMs: {
          connection: connectionMs,
          firstApply: firstMs,
          noChanges: noChangesMs,
          changedApply: changedMs,
          total: milliseconds(totalStartedAt),
        },
        results: { first, noChanges, changed: changedResult },
      });
    }
  } catch (cause) {
    operationFailure = { stage, cause };
  }

  let cleanupFailure: { readonly stage: BenchmarkFailureStageV1; readonly cause: unknown } | null =
    null;
  if (sql && benchmarkId) {
    try {
      stage = 'cleanup-reset';
      await sql`select bn_benchmark.reset(${benchmarkId})`;
    } catch (cause) {
      cleanupFailure = { stage: 'cleanup-reset', cause };
    }
  }
  if (sql && probeCleanupIds.length > 0) {
    try {
      stage = 'cleanup-reset';
      for (const id of probeCleanupIds) {
        await sql`delete from bn_benchmark.streams where benchmark_id = ${id}`;
      }
    } catch (cause) {
      cleanupFailure ??= { stage: 'cleanup-reset', cause };
    }
  }
  if (sql) {
    try {
      stage = 'cleanup-close';
      await sql.end({ timeout: 2 });
    } catch (cause) {
      cleanupFailure ??= { stage: 'cleanup-close', cause };
    }
  }

  if (operationFailure) {
    const benchmarkCode =
      operationFailure.cause &&
      typeof operationFailure.cause === 'object' &&
      'benchmarkCode' in operationFailure.cause &&
      typeof operationFailure.cause.benchmarkCode === 'string'
        ? operationFailure.cause.benchmarkCode
        : undefined;
    return failureResponse(operationFailure.stage, operationFailure.cause, benchmarkCode);
  }
  if (cleanupFailure) return failureResponse(cleanupFailure.stage, cleanupFailure.cause);
  return response ?? failureResponse(stage, new Error('benchmark-response-missing'));
};
