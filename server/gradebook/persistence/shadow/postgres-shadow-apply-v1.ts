type PostgresFactoryV1 = typeof import('postgres');

export interface PostgresShadowItemV1 {
  readonly category: string;
  readonly stream_key: string;
  readonly expected_version: number | null;
  readonly payload: unknown;
}

export interface PostgresShadowBoundsV1 {
  readonly maxItems: number;
  readonly maxBytes: number;
  readonly chunkBytes: number;
  readonly chunkItems: number;
}

export const POSTGRES_SHADOW_BOUNDS_V1: PostgresShadowBoundsV1 = {
  maxItems: 50_000,
  maxBytes: 32 * 1024 * 1024,
  chunkBytes: 480 * 1024,
  chunkItems: 250,
};

export type PostgresShadowStageV1 =
  | 'inspect'
  | 'driver'
  | 'connection'
  | 'setup'
  | 'upload'
  | 'apply'
  | 'no-changes'
  | 'transaction';

export type PostgresShadowErrorCodeV1 =
  | 'serialization-failed'
  | 'item-count-invalid'
  | 'item-too-large'
  | 'payload-too-large'
  | 'duplicate-key'
  | 'driver-load-failed'
  | 'connection-failed'
  | 'setup-failed'
  | 'upload-failed'
  | 'apply-failed'
  | 'no-changes-failed'
  | 'transaction-failed'
  | 'commit-forbidden'
  | 'count-invalid';

export interface PostgresShadowDiagnosticsV1 {
  readonly itemCount: number;
  readonly payloadBytes: number;
  readonly maxItemBytes: number;
  readonly chunkCount: number;
  readonly duplicateKeys: number;
  readonly timingsMs: {
    readonly connection: number | null;
    readonly setup: number | null;
    readonly upload: number | null;
    readonly apply: number | null;
    readonly noChanges: number | null;
    readonly transaction: number | null;
  };
}

export interface PostgresShadowInspectionV1 {
  readonly itemCount: number;
  readonly payloadBytes: number;
  readonly maxItemBytes: number;
  readonly chunkCount: number;
  readonly duplicateKeys: number;
}

export class PostgresShadowApplyErrorV1 extends Error {
  readonly stage: PostgresShadowStageV1;
  readonly code: PostgresShadowErrorCodeV1;
  readonly diagnostics: PostgresShadowDiagnosticsV1;
  readonly sqlState?: string;

  constructor(input: {
    readonly stage: PostgresShadowStageV1;
    readonly code: PostgresShadowErrorCodeV1;
    readonly diagnostics: PostgresShadowDiagnosticsV1;
    readonly sqlState?: string;
  }) {
    super(input.code);
    this.name = 'PostgresShadowApplyErrorV1';
    this.stage = input.stage;
    this.code = input.code;
    this.diagnostics = input.diagnostics;
    this.sqlState = input.sqlState;
  }
}

export interface PostgresShadowApplyResultV1 {
  readonly payloadBytes: number;
  readonly maxItemBytes: number;
  readonly chunkCount: number;
  readonly duplicateKeys: number;
  readonly inserted: number;
  readonly unchanged: number;
  readonly timingsMs: {
    readonly connection: number;
    readonly setup: number;
    readonly upload: number;
    readonly apply: number;
    readonly noChanges: number;
    readonly transaction: number;
  };
}

const TEXT_OID = 25;

class ShadowRollback extends Error {
  constructor() {
    super('postgres-shadow-rollback');
    this.name = 'ShadowRollback';
  }
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function elapsed(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function sqlState(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return undefined;
  const value = cause.code;
  return typeof value === 'string' && /^[0-9A-Z]{5}$/u.test(value) ? value : undefined;
}

function integer(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new TypeError('postgres-shadow-count-invalid');
  }
  return parsed;
}

interface PreparedItemsV1 extends PostgresShadowInspectionV1 {
  readonly groups: readonly (readonly PostgresShadowItemV1[])[];
}

function emptyDiagnostics(itemCount: number): PostgresShadowDiagnosticsV1 {
  return {
    itemCount,
    payloadBytes: 0,
    maxItemBytes: 0,
    chunkCount: 0,
    duplicateKeys: 0,
    timingsMs: {
      connection: null,
      setup: null,
      upload: null,
      apply: null,
      noChanges: null,
      transaction: null,
    },
  };
}

function inspectionError(
  code: Extract<
    PostgresShadowErrorCodeV1,
    'serialization-failed' | 'item-count-invalid' | 'item-too-large' | 'payload-too-large' | 'duplicate-key'
  >,
  diagnostics: PostgresShadowDiagnosticsV1,
): never {
  throw new PostgresShadowApplyErrorV1({ stage: 'inspect', code, diagnostics });
}

function prepareItems(
  items: readonly PostgresShadowItemV1[],
  bounds: PostgresShadowBoundsV1,
): PreparedItemsV1 {
  const diagnostics = emptyDiagnostics(items.length);
  if (
    !Number.isInteger(bounds.maxItems) ||
    !Number.isInteger(bounds.maxBytes) ||
    !Number.isInteger(bounds.chunkBytes) ||
    !Number.isInteger(bounds.chunkItems) ||
    bounds.maxItems < 1 ||
    bounds.maxBytes < 2 ||
    bounds.chunkBytes < 2 ||
    bounds.chunkItems < 1 ||
    items.length === 0 ||
    items.length > bounds.maxItems
  ) {
    return inspectionError('item-count-invalid', diagnostics);
  }

  const encoder = new TextEncoder();
  const sizes: number[] = [];
  const keys = new Set<string>();
  let duplicateKeys = 0;
  let payloadBytes = 2;
  let maxItemBytes = 0;

  for (const item of items) {
    let serialized: string;
    try {
      serialized = JSON.stringify(item);
    } catch {
      return inspectionError('serialization-failed', {
        ...diagnostics,
        payloadBytes,
        maxItemBytes,
        duplicateKeys,
      });
    }
    if (typeof serialized !== 'string') {
      return inspectionError('serialization-failed', {
        ...diagnostics,
        payloadBytes,
        maxItemBytes,
        duplicateKeys,
      });
    }
    const bytes = encoder.encode(serialized).byteLength;
    sizes.push(bytes);
    payloadBytes += bytes + (sizes.length > 1 ? 1 : 0);
    maxItemBytes = Math.max(maxItemBytes, bytes);
    const key = `${item.category}\u0000${item.stream_key}`;
    if (keys.has(key)) duplicateKeys += 1;
    else keys.add(key);
  }

  const inspected = {
    ...diagnostics,
    payloadBytes,
    maxItemBytes,
    duplicateKeys,
  };
  if (maxItemBytes > bounds.chunkBytes) return inspectionError('item-too-large', inspected);
  if (payloadBytes > bounds.maxBytes) return inspectionError('payload-too-large', inspected);
  if (duplicateKeys > 0) return inspectionError('duplicate-key', inspected);

  const groups: PostgresShadowItemV1[][] = [];
  let current: PostgresShadowItemV1[] = [];
  let currentBytes = 2;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const bytes = sizes[index]!;
    const nextBytes = currentBytes + bytes + (current.length > 0 ? 1 : 0);
    if (
      current.length > 0 &&
      (current.length >= bounds.chunkItems || nextBytes > bounds.chunkBytes)
    ) {
      groups.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += bytes + (current.length > 1 ? 1 : 0);
  }
  if (current.length > 0) groups.push(current);

  return {
    itemCount: items.length,
    payloadBytes,
    maxItemBytes,
    chunkCount: groups.length,
    duplicateKeys,
    groups,
  };
}

export function inspectPostgresShadowItemsV1(
  items: readonly PostgresShadowItemV1[],
  bounds: PostgresShadowBoundsV1 = POSTGRES_SHADOW_BOUNDS_V1,
): PostgresShadowInspectionV1 {
  const prepared = prepareItems(items, bounds);
  return {
    itemCount: prepared.itemCount,
    payloadBytes: prepared.payloadBytes,
    maxItemBytes: prepared.maxItemBytes,
    chunkCount: prepared.chunkCount,
    duplicateKeys: prepared.duplicateKeys,
  };
}

export async function applyPostgresShadowV1(
  connectionString: string,
  items: readonly PostgresShadowItemV1[],
): Promise<PostgresShadowApplyResultV1> {
  const prepared = prepareItems(items, POSTGRES_SHADOW_BOUNDS_V1);
  let connection: number | null = null;
  let setup: number | null = null;
  let upload: number | null = null;
  let apply: number | null = null;
  let noChanges: number | null = null;
  let transaction: number | null = null;
  let transactionStartedAt: number | null = null;
  let inserted = 0;
  let unchanged = 0;

  const diagnostics = (): PostgresShadowDiagnosticsV1 => ({
    itemCount: prepared.itemCount,
    payloadBytes: prepared.payloadBytes,
    maxItemBytes: prepared.maxItemBytes,
    chunkCount: prepared.chunkCount,
    duplicateKeys: prepared.duplicateKeys,
    timingsMs: {
      connection,
      setup,
      upload,
      apply,
      noChanges,
      transaction:
        transactionStartedAt === null ? transaction : (transaction ?? elapsed(transactionStartedAt)),
    },
  });

  const fail = (
    stage: Exclude<PostgresShadowStageV1, 'inspect'>,
    code: Exclude<
      PostgresShadowErrorCodeV1,
      'serialization-failed' | 'item-count-invalid' | 'item-too-large' | 'payload-too-large' | 'duplicate-key'
    >,
    cause?: unknown,
  ): never => {
    throw new PostgresShadowApplyErrorV1({
      stage,
      code,
      diagnostics: diagnostics(),
      ...(sqlState(cause) ? { sqlState: sqlState(cause) } : {}),
    });
  };

  let postgres: PostgresFactoryV1;
  try {
    const module = await import('postgres');
    postgres = ((module as unknown as { default?: PostgresFactoryV1 }).default ??
      module) as PostgresFactoryV1;
  } catch (cause) {
    return fail('driver', 'driver-load-failed', cause);
  }

  const sql = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
    idle_timeout: 2,
    max_lifetime: 60,
  });

  try {
    const connectionStartedAt = nowMs();
    try {
      await sql`select 1::int as ok`;
      connection = elapsed(connectionStartedAt);
    } catch (cause) {
      connection = elapsed(connectionStartedAt);
      return fail('connection', 'connection-failed', cause);
    }

    transactionStartedAt = nowMs();
    try {
      await sql.begin(async (transactionSql) => {
        const setupStartedAt = nowMs();
        try {
          await transactionSql`create temporary table gradebook_shadow_incoming_v1 (category text not null, stream_key text not null, expected_version integer, payload jsonb not null, primary key (category, stream_key)) on commit drop`;
          await transactionSql`create temporary table gradebook_shadow_streams_v1 (category text not null, stream_key text not null, current_version integer not null, payload jsonb not null, primary key (category, stream_key)) on commit drop`;
          await transactionSql`create temporary table gradebook_shadow_versions_v1 (category text not null, stream_key text not null, version integer not null, payload jsonb not null, primary key (category, stream_key, version)) on commit drop`;
          setup = elapsed(setupStartedAt);
        } catch (cause) {
          setup = elapsed(setupStartedAt);
          return fail('setup', 'setup-failed', cause);
        }

        const uploadStartedAt = nowMs();
        try {
          for (const group of prepared.groups) {
            const json = JSON.stringify(group);
            await transactionSql`
              insert into gradebook_shadow_incoming_v1 (category, stream_key, expected_version, payload)
              select category, stream_key, expected_version, payload
                from jsonb_to_recordset(${transactionSql.typed(json, TEXT_OID)}::jsonb)
                  as incoming(category text, stream_key text, expected_version integer, payload jsonb)
            `;
          }
          upload = elapsed(uploadStartedAt);
        } catch (cause) {
          upload = elapsed(uploadStartedAt);
          return fail('upload', 'upload-failed', cause);
        }

        const applyStartedAt = nowMs();
        try {
          await transactionSql`
            with upserted as (
              insert into gradebook_shadow_streams_v1 (category, stream_key, current_version, payload)
              select category, stream_key, 1, payload from gradebook_shadow_incoming_v1
              on conflict (category, stream_key) do update
                set current_version = gradebook_shadow_streams_v1.current_version + 1,
                    payload = excluded.payload
                where gradebook_shadow_streams_v1.payload is distinct from excluded.payload
              returning category, stream_key, current_version, payload
            )
            insert into gradebook_shadow_versions_v1 (category, stream_key, version, payload)
            select category, stream_key, current_version, payload from upserted
          `;
          try {
            inserted = integer(
              (await transactionSql`select count(*)::int as n from gradebook_shadow_versions_v1`)[0]
                ?.n,
            );
          } catch (cause) {
            apply = elapsed(applyStartedAt);
            return fail('apply', 'count-invalid', cause);
          }
          apply = elapsed(applyStartedAt);
        } catch (cause) {
          if (cause instanceof PostgresShadowApplyErrorV1) throw cause;
          apply = elapsed(applyStartedAt);
          return fail('apply', 'apply-failed', cause);
        }

        const noChangesStartedAt = nowMs();
        try {
          const result = await transactionSql`
            with changed as (
              update gradebook_shadow_streams_v1 as current
                 set current_version = current.current_version + 1,
                     payload = incoming.payload
                from gradebook_shadow_incoming_v1 as incoming
               where current.category = incoming.category
                 and current.stream_key = incoming.stream_key
                 and current.payload is distinct from incoming.payload
              returning 1
            )
            select count(*)::int as n from changed
          `;
          try {
            unchanged = items.length - integer(result[0]?.n);
          } catch (cause) {
            noChanges = elapsed(noChangesStartedAt);
            return fail('no-changes', 'count-invalid', cause);
          }
          noChanges = elapsed(noChangesStartedAt);
        } catch (cause) {
          if (cause instanceof PostgresShadowApplyErrorV1) throw cause;
          noChanges = elapsed(noChangesStartedAt);
          return fail('no-changes', 'no-changes-failed', cause);
        }
        throw new ShadowRollback();
      });
      transaction = elapsed(transactionStartedAt);
      return fail('transaction', 'commit-forbidden');
    } catch (cause) {
      transaction = elapsed(transactionStartedAt);
      if (cause instanceof ShadowRollback) {
        // Expected: every shadow run is rolled back after all measurements complete.
      } else if (cause instanceof PostgresShadowApplyErrorV1) {
        throw cause;
      } else {
        return fail('transaction', 'transaction-failed', cause);
      }
    }
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }

  return {
    payloadBytes: prepared.payloadBytes,
    maxItemBytes: prepared.maxItemBytes,
    chunkCount: prepared.chunkCount,
    duplicateKeys: prepared.duplicateKeys,
    inserted,
    unchanged,
    timingsMs: {
      connection: connection ?? 0,
      setup: setup ?? 0,
      upload: upload ?? 0,
      apply: apply ?? 0,
      noChanges: noChanges ?? 0,
      transaction: transaction ?? 0,
    },
  };
}
