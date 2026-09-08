type PostgresFactoryV1 = typeof import('postgres');

export interface PostgresShadowItemV1 {
  readonly category: string;
  readonly stream_key: string;
  readonly expected_version: number | null;
  readonly payload: unknown;
}

export interface PostgresShadowApplyResultV1 {
  readonly payloadBytes: number;
  readonly chunkCount: number;
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

const MAX_ITEMS = 50_000;
const MAX_BYTES = 32 * 1024 * 1024;
const CHUNK_BYTES = 480 * 1024;
const CHUNK_ITEMS = 250;
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
function integer(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new TypeError('postgres-shadow-count-invalid');
  }
  return parsed;
}
function chunks(items: readonly PostgresShadowItemV1[]): readonly (readonly PostgresShadowItemV1[])[] {
  if (items.length === 0 || items.length > MAX_ITEMS) throw new RangeError('postgres-shadow-item-count-invalid');
  const encoder = new TextEncoder();
  const result: PostgresShadowItemV1[][] = [];
  let current: PostgresShadowItemV1[] = [];
  let currentBytes = 2;
  for (const item of items) {
    const bytes = encoder.encode(JSON.stringify(item)).byteLength + 1;
    if (bytes > CHUNK_BYTES) throw new RangeError('postgres-shadow-item-too-large');
    if (current.length > 0 && (current.length >= CHUNK_ITEMS || currentBytes + bytes > CHUNK_BYTES)) {
      result.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += bytes;
  }
  if (current.length > 0) result.push(current);
  return result;
}

export async function applyPostgresShadowV1(
  connectionString: string,
  items: readonly PostgresShadowItemV1[],
): Promise<PostgresShadowApplyResultV1> {
  const serialized = JSON.stringify(items);
  const payloadBytes = new TextEncoder().encode(serialized).byteLength;
  if (payloadBytes > MAX_BYTES) throw new RangeError('postgres-shadow-payload-too-large');
  const groups = chunks(items);

  const module = await import('postgres');
  const postgres = ((module as unknown as { default?: PostgresFactoryV1 }).default ?? module) as PostgresFactoryV1;
  const sql = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
    idle_timeout: 2,
    max_lifetime: 60,
  });

  const connectionStartedAt = nowMs();
  await sql`select 1::int as ok`;
  const connection = elapsed(connectionStartedAt);
  const transactionStartedAt = nowMs();
  let setup = 0;
  let upload = 0;
  let apply = 0;
  let noChanges = 0;
  let inserted = 0;
  let unchanged = 0;

  try {
    try {
      await sql.begin(async (transaction) => {
        const setupStartedAt = nowMs();
        await transaction`create temporary table gradebook_shadow_incoming_v1 (category text not null, stream_key text not null, expected_version integer, payload jsonb not null, primary key (category, stream_key)) on commit drop`;
        await transaction`create temporary table gradebook_shadow_streams_v1 (category text not null, stream_key text not null, current_version integer not null, payload jsonb not null, primary key (category, stream_key)) on commit drop`;
        await transaction`create temporary table gradebook_shadow_versions_v1 (category text not null, stream_key text not null, version integer not null, payload jsonb not null, primary key (category, stream_key, version)) on commit drop`;
        setup = elapsed(setupStartedAt);

        const uploadStartedAt = nowMs();
        for (const group of groups) {
          const json = JSON.stringify(group);
          await transaction`
            insert into gradebook_shadow_incoming_v1 (category, stream_key, expected_version, payload)
            select category, stream_key, expected_version, payload
              from jsonb_to_recordset(${transaction.typed(json, TEXT_OID)}::jsonb)
                as incoming(category text, stream_key text, expected_version integer, payload jsonb)
          `;
        }
        upload = elapsed(uploadStartedAt);

        const applyStartedAt = nowMs();
        await transaction`
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
        inserted = integer((await transaction`select count(*)::int as n from gradebook_shadow_versions_v1`)[0]?.n);
        apply = elapsed(applyStartedAt);

        const noChangesStartedAt = nowMs();
        const result = await transaction`
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
        unchanged = items.length - integer(result[0]?.n);
        noChanges = elapsed(noChangesStartedAt);
        throw new ShadowRollback();
      });
      throw new Error('postgres-shadow-commit-forbidden');
    } catch (cause) {
      if (!(cause instanceof ShadowRollback)) throw cause;
    }
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }

  return {
    payloadBytes,
    chunkCount: groups.length,
    inserted,
    unchanged,
    timingsMs: {
      connection,
      setup,
      upload,
      apply,
      noChanges,
      transaction: elapsed(transactionStartedAt),
    },
  };
}
