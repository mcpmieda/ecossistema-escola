import { capabilitiesForRoles, requireCapability } from '../../../server/auth/capabilities';
import { requireAuth } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import { enforceOfficialOrigin, enforceWriteOrigin, HttpError } from '../../../server/http/security';
import {
  createPostgresBenchmarkSnapshotV1,
  parsePostgresBenchmarkApplyResultV1,
} from '../../../server/gradebook/benchmark/postgres-benchmark-v1';

type HyperdriveBindingV1 = { readonly connectionString: string };
type ProbeEnvV1 = RuntimeEnv & { readonly PROD_DB?: HyperdriveBindingV1 };
type Context = EventContext<ProbeEnvV1, string, unknown>;
type PostgresFactoryV1 = typeof import('postgres');
type PostgresClientV1 = ReturnType<PostgresFactoryV1>;

type ProbeStageV1 =
  | 'connection'
  | 'parameter-text'
  | 'parameter-jsonb'
  | 'direct-insert'
  | 'transaction'
  | 'function-call'
  | 'function-result';

interface ProbeResultV1 {
  readonly stage: ProbeStageV1;
  readonly state: 'passed' | 'failed' | 'skipped';
  readonly ms: number;
  readonly sqlState?: string;
}

function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  });
}

function milliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function safeSqlState(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return undefined;
  const code = cause.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/u.test(code) ? code : undefined;
}

function integer(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) {
    throw new TypeError('postgres-probe-result-invalid');
  }
  return parsed;
}

async function step(
  stage: ProbeStageV1,
  operation: () => Promise<void>,
): Promise<ProbeResultV1> {
  const startedAt = performance.now();
  try {
    await operation();
    return { stage, state: 'passed', ms: milliseconds(startedAt) };
  } catch (cause) {
    const sqlState = safeSqlState(cause);
    return {
      stage,
      state: 'failed',
      ms: milliseconds(startedAt),
      ...(sqlState ? { sqlState } : {}),
    };
  }
}

async function parseBody(request: Request): Promise<void> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1_024) {
    throw new HttpError(413, 'Probe request too large');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid probe request');
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    (body as Record<string, unknown>).operation !== 'probe'
  ) {
    throw new HttpError(400, 'Invalid probe request');
  }
}

export const onRequestPost: PagesFunction<ProbeEnvV1> = async (context: Context) => {
  const rawEnv = context.env;
  const env = validateEnv(rawEnv as RuntimeEnv);
  enforceOfficialOrigin(context.request, env);
  enforceWriteOrigin(context.request, env);

  const session = await requireAuth(context.request, env);
  requireCapability(capabilitiesForRoles(session.roles), 'gradebook.persistence.admin');
  await parseBody(context.request);

  const binding = rawEnv.PROD_DB;
  if (!binding?.connectionString) {
    return noStoreJson(
      {
        version: 1,
        state: 'failed',
        provider: 'postgres-hyperdrive',
        stage: 'binding',
        code: 'binding-missing',
      },
      503,
    );
  }

  let sql: PostgresClientV1 | null = null;
  const cleanupIds: string[] = [];
  const probes: ProbeResultV1[] = [];
  try {
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

    const connection = await step('connection', async () => {
      const rows = await sql!`select 1::int as ok`;
      if (integer(rows[0]?.ok) !== 1) throw new TypeError('postgres-probe-result-invalid');
    });
    probes.push(connection);
    if (connection.state === 'failed') {
      return noStoreJson({
        version: 1,
        state: 'probe-completed',
        provider: 'postgres-hyperdrive',
        syntheticOnly: true,
        probes,
      });
    }

    probes.push(
      await step('parameter-text', async () => {
        const marker = 'hyperdrive-probe-v1';
        const rows = await sql!`select ${marker}::text as value`;
        if (rows[0]?.value !== marker) throw new TypeError('postgres-probe-result-invalid');
      }),
    );

    probes.push(
      await step('parameter-jsonb', async () => {
        const payload = JSON.stringify([{ value: 1 }]);
        const rows = await sql!`select jsonb_array_length(${payload}::jsonb)::int as count`;
        if (integer(rows[0]?.count) !== 1) throw new TypeError('postgres-probe-result-invalid');
      }),
    );

    const directId = `synthetic-probe-direct:${crypto.randomUUID()}`;
    cleanupIds.push(directId);
    probes.push(
      await step('direct-insert', async () => {
        await sql!`
          insert into bn_benchmark.streams
            (benchmark_id, stream_key, current_version, payload_hash, updated_at)
          values (${directId}, 'stream:1', 1, ${'1'.repeat(64)}, clock_timestamp())
        `;
        const rows = await sql!`
          select count(*)::int as count
          from bn_benchmark.streams
          where benchmark_id = ${directId}
        `;
        if (integer(rows[0]?.count) !== 1) throw new TypeError('postgres-probe-result-invalid');
      }),
    );

    const transactionId = `synthetic-probe-transaction:${crypto.randomUUID()}`;
    cleanupIds.push(transactionId);
    probes.push(
      await step('transaction', async () => {
        const payload = JSON.stringify({ probe: true });
        await sql!.begin(async (transaction) => {
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
        const rows = await sql!`
          select count(*)::int as count
          from bn_benchmark.versions
          where benchmark_id = ${transactionId}
        `;
        if (integer(rows[0]?.count) !== 1) throw new TypeError('postgres-probe-result-invalid');
      }),
    );

    const functionId = `synthetic-probe-function:${crypto.randomUUID()}`;
    cleanupIds.push(functionId);
    const baseline = createPostgresBenchmarkSnapshotV1(1, 1, 1);
    let functionRow: unknown = null;
    const functionCall = await step('function-call', async () => {
      const rows = await sql!`
        select * from bn_benchmark.apply_snapshot(
          ${functionId},
          ${JSON.stringify(baseline)}::jsonb
        )
      `;
      if (rows.length !== 1) throw new TypeError('postgres-probe-result-invalid');
      functionRow = rows[0];
    });
    probes.push(functionCall);

    if (functionCall.state === 'passed') {
      probes.push(
        await step('function-result', async () => {
          const result = parsePostgresBenchmarkApplyResultV1(functionRow);
          if (result.total !== 1 || result.changed !== 1 || result.unchanged !== 0) {
            throw new TypeError('postgres-probe-result-invalid');
          }
        }),
      );
    } else {
      probes.push({ stage: 'function-result', state: 'skipped', ms: 0 });
    }

    return noStoreJson({
      version: 1,
      state: 'probe-completed',
      provider: 'postgres-hyperdrive',
      syntheticOnly: true,
      probes,
    });
  } catch (cause) {
    const sqlState = safeSqlState(cause);
    console.error(
      JSON.stringify({
        message: 'postgres_probe_failed',
        errorType: cause instanceof Error ? cause.name : 'unknown',
        sqlState: sqlState ?? null,
      }),
    );
    return noStoreJson(
      {
        version: 1,
        state: 'failed',
        provider: 'postgres-hyperdrive',
        stage: 'probe-runtime',
        code: 'probe-runtime-failed',
        ...(sqlState ? { sqlState } : {}),
      },
      503,
    );
  } finally {
    if (sql) {
      for (const id of cleanupIds) {
        try {
          await sql`delete from bn_benchmark.streams where benchmark_id = ${id}`;
        } catch {
          console.error(JSON.stringify({ message: 'postgres_probe_cleanup_failed' }));
        }
      }
      try {
        await sql.end({ timeout: 2 });
      } catch {
        console.error(JSON.stringify({ message: 'postgres_probe_close_failed' }));
      }
    }
  }
};
