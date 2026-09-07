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
type PostgresJsonValueV1 = Parameters<PostgresClientV1['json']>[0];
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

interface BenchmarkRequestV1 {
  readonly operation: 'run';
  readonly size?: number;
  readonly changed?: number;
}

function postgresJsonValueV1(value: unknown): PostgresJsonValueV1 {
  // Generated benchmark snapshots contain only JSON-safe scalar/object/array values.
  return value as PostgresJsonValueV1;
}

function parseRequest(value: unknown): Required<BenchmarkRequestV1> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'Invalid benchmark request');
  const body = value as Record<string, unknown>;
  if (body.operation !== 'run') throw new HttpError(400, 'Invalid benchmark request');
  const size = body.size ?? POSTGRES_BENCHMARK_DEFAULT_SIZE_V1;
  const changed = body.changed ?? POSTGRES_BENCHMARK_DEFAULT_CHANGED_V1;
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
  return { operation: 'run', size: size as number, changed: changed as number };
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
    }),
  );
  return noStoreJson(
    { version: 1, state: 'failed', provider: 'postgres-hyperdrive', stage, code },
    status,
  );
}

export const onRequestPost: PagesFunction<BenchmarkEnvV1> = async (context: Context) => {
  let stage: BenchmarkFailureStageV1 = 'environment';
  let sql: PostgresClientV1 | null = null;
  let benchmarkId: string | null = null;
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
        ${sql.json(postgresJsonValueV1(baseline))}::jsonb
      )
    `;
    const firstMs = milliseconds(firstStartedAt);
    const first = parsePostgresBenchmarkApplyResultV1(firstRows[0]);

    stage = 'no-changes';
    const noChangesStartedAt = performance.now();
    const noChangesRows = await sql`
      select * from bn_benchmark.apply_snapshot(
        ${benchmarkId},
        ${sql.json(postgresJsonValueV1(baseline))}::jsonb
      )
    `;
    const noChangesMs = milliseconds(noChangesStartedAt);
    const noChanges = parsePostgresBenchmarkApplyResultV1(noChangesRows[0]);

    stage = 'changed-apply';
    const changedStartedAt = performance.now();
    const changedRows = await sql`
      select * from bn_benchmark.apply_snapshot(
        ${benchmarkId},
        ${sql.json(postgresJsonValueV1(changed))}::jsonb
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
