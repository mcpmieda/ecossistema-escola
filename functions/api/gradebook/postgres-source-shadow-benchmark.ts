import { capabilitiesForRoles, requireCapability } from '../../../server/auth/capabilities';
import { requireAuth } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import { enforceOfficialOrigin, enforceWriteOrigin, HttpError } from '../../../server/http/security';

type HyperdriveBindingV1 = { readonly connectionString: string };
type ShadowEnvV1 = RuntimeEnv & { readonly PROD_DB?: HyperdriveBindingV1 };
type Context = EventContext<ShadowEnvV1, string, unknown>;
type PostgresFactoryV1 = typeof import('postgres');
type PostgresClientV1 = ReturnType<PostgresFactoryV1>;

type D1RowV1 = Record<string, unknown>;
type D1ReadStatementV1 = {
  bind(...values: (string | number | null)[]): D1ReadStatementV1;
  all<Row extends D1RowV1>(): Promise<{ readonly results: readonly Row[] }>;
};
type D1ReadDatabaseV1 = { prepare(sql: string): D1ReadStatementV1 };

interface ShadowBenchmarkRequestV1 {
  readonly operation: 'run';
  readonly fileName: string;
  readonly academicYear: number;
}

interface ShadowItemV1 {
  readonly category: 'logical-source' | 'source-file' | 'assessment-component' | 'academic-record' | 'association';
  readonly stream_key: string;
  readonly expected_version: null;
  readonly payload: unknown;
}

interface SourceRowV1 extends D1RowV1 {
  readonly academic_year_id: string;
  readonly manifest_id: string;
  readonly version: number;
  readonly confirmed_logical_source_id: string;
  readonly payload_json: string;
}
interface LogicalSourceRowV1 extends D1RowV1 {
  readonly teacher_id: string;
  readonly source_context: string;
  readonly created_at: string;
}
interface RecordRowV1 extends D1RowV1 {
  readonly record_kind: string;
  readonly stream_key: string;
  readonly payload_json: string;
  readonly association_version: number;
  readonly association_state: string;
  readonly source_manifest_id: string;
  readonly source_manifest_version: number;
}
interface ComponentRowV1 extends D1RowV1 {
  readonly entity_id: string;
  readonly payload_json: string;
}

const MAX_BODY_BYTES_V1 = 1_024;
const MAX_ITEMS_V1 = 50_000;
const MAX_SERIALIZED_BYTES_V1 = 32 * 1024 * 1024;
const CHUNK_BYTES_V1 = 480 * 1024;
const CHUNK_ITEMS_V1 = 250;
const TEXT_OID = 25;

class ShadowRollbackV1 extends Error {
  constructor() {
    super('shadow-benchmark-rollback');
    this.name = 'ShadowRollbackV1';
  }
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}
function elapsed(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}
function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  });
}
function safeSqlState(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return undefined;
  const value = cause.code;
  return typeof value === 'string' && /^[0-9A-Z]{5}$/u.test(value) ? value : undefined;
}
function integer(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new TypeError('shadow-benchmark-count-invalid');
  }
  return parsed;
}
function objectFromJson(value: unknown): unknown {
  if (typeof value !== 'string') throw new TypeError('shadow-benchmark-json-invalid');
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object') throw new TypeError('shadow-benchmark-json-invalid');
  return parsed;
}
async function parseRequest(request: Request): Promise<ShadowBenchmarkRequestV1> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES_V1) {
    throw new HttpError(413, 'Shadow benchmark request too large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid shadow benchmark request');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'Invalid shadow benchmark request');
  }
  const value = parsed as Record<string, unknown>;
  if (
    value.operation !== 'run' ||
    typeof value.fileName !== 'string' ||
    value.fileName.trim().length < 1 ||
    value.fileName.length > 180 ||
    !Number.isInteger(value.academicYear) ||
    (value.academicYear as number) < 2000 ||
    (value.academicYear as number) > 9999
  ) {
    throw new HttpError(400, 'Invalid shadow benchmark request');
  }
  return {
    operation: 'run',
    fileName: value.fileName,
    academicYear: value.academicYear as number,
  };
}
function readDatabase(value: unknown): D1ReadDatabaseV1 {
  if (!value || typeof value !== 'object' || !('prepare' in value) || typeof value.prepare !== 'function') {
    throw new HttpError(503, 'Gradebook database unavailable');
  }
  return value as D1ReadDatabaseV1;
}
async function all<Row extends D1RowV1>(
  database: D1ReadDatabaseV1,
  sql: string,
  ...values: (string | number | null)[]
): Promise<readonly Row[]> {
  return (await database.prepare(sql).bind(...values).all<Row>()).results;
}
function chunks(items: readonly ShadowItemV1[]): readonly (readonly ShadowItemV1[])[] {
  const encoder = new TextEncoder();
  const result: ShadowItemV1[][] = [];
  let current: ShadowItemV1[] = [];
  let currentBytes = 2;
  for (const item of items) {
    const bytes = encoder.encode(JSON.stringify(item)).byteLength + 1;
    if (bytes > CHUNK_BYTES_V1) throw new RangeError('shadow-benchmark-item-too-large');
    if (current.length > 0 && (current.length >= CHUNK_ITEMS_V1 || currentBytes + bytes > CHUNK_BYTES_V1)) {
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

export const onRequestPost: PagesFunction<ShadowEnvV1> = async (context: Context) => {
  const totalStartedAt = nowMs();
  const rawEnv = context.env;
  const env = validateEnv(rawEnv as RuntimeEnv);
  enforceOfficialOrigin(context.request, env);
  enforceWriteOrigin(context.request, env);
  const session = await requireAuth(context.request, env);
  requireCapability(capabilitiesForRoles(session.roles), 'gradebook.persistence.admin');
  const input = await parseRequest(context.request);
  const database = readDatabase(rawEnv.GRADEBOOK_D1);
  const binding = rawEnv.PROD_DB;
  if (!binding?.connectionString) {
    return noStoreJson({ version: 1, state: 'failed', stage: 'binding', code: 'binding-missing' }, 503);
  }

  try {
    const locateStartedAt = nowMs();
    const sources = await all<SourceRowV1>(
      database,
      `SELECT v.academic_year_id, v.manifest_id, v.version,
              v.confirmed_logical_source_id, v.payload_json
         FROM source_file_streams s
         JOIN source_file_versions v
           ON v.academic_year_id=s.academic_year_id
          AND v.manifest_id=s.manifest_id
          AND v.version=s.current_version
         JOIN academic_years y
           ON y.academic_year_id=v.academic_year_id
        WHERE v.file_name=?
          AND y.year=?
          AND v.logical_source_state='confirmed'
          AND v.confirmed_logical_source_id IS NOT NULL
        ORDER BY v.manifest_id
        LIMIT 2`,
      input.fileName,
      input.academicYear,
    );
    const d1LocateMs = elapsed(locateStartedAt);
    if (sources.length === 0) {
      return noStoreJson({ version: 1, state: 'not-found' }, 404);
    }
    if (sources.length !== 1) {
      return noStoreJson({ version: 1, state: 'ambiguous-source' }, 409);
    }
    const source = sources[0]!;
    if (
      typeof source.academic_year_id !== 'string' ||
      typeof source.manifest_id !== 'string' ||
      !Number.isInteger(source.version) ||
      typeof source.confirmed_logical_source_id !== 'string'
    ) {
      throw new TypeError('shadow-benchmark-source-invalid');
    }

    const loadStartedAt = nowMs();
    const logicalRows = await all<LogicalSourceRowV1>(
      database,
      `SELECT teacher_id, source_context, created_at
         FROM logical_sources
        WHERE academic_year_id=? AND logical_source_id=?`,
      source.academic_year_id,
      source.confirmed_logical_source_id,
    );
    if (logicalRows.length !== 1) throw new TypeError('shadow-benchmark-logical-source-invalid');
    const records = await all<RecordRowV1>(
      database,
      `SELECT c.record_kind, c.stream_key, rv.payload_json,
              av.version AS association_version, av.association_state,
              av.source_manifest_id, av.source_manifest_version
         FROM logical_source_record_streams c
         JOIN logical_source_record_versions av
           ON av.academic_year_id=c.academic_year_id
          AND av.logical_source_id=c.logical_source_id
          AND av.record_kind=c.record_kind
          AND av.stream_key=c.stream_key
          AND av.version=c.current_version
         JOIN academic_record_streams rs
           ON rs.academic_year_id=c.academic_year_id
          AND rs.record_kind=c.record_kind
          AND rs.stream_key=c.stream_key
         JOIN academic_record_versions rv
           ON rv.academic_year_id=rs.academic_year_id
          AND rv.record_kind=rs.record_kind
          AND rv.stream_key=rs.stream_key
          AND rv.version=rs.current_version
        WHERE c.academic_year_id=?
          AND c.logical_source_id=?
          AND c.current_state='active'
        ORDER BY c.record_kind, c.stream_key`,
      source.academic_year_id,
      source.confirmed_logical_source_id,
    );
    const components = await all<ComponentRowV1>(
      database,
      `SELECT DISTINCT ev.entity_id, ev.payload_json
         FROM logical_source_record_streams c
         JOIN academic_record_streams rs
           ON rs.academic_year_id=c.academic_year_id
          AND rs.record_kind=c.record_kind
          AND rs.stream_key=c.stream_key
         JOIN academic_entity_streams es
           ON es.academic_year_id=rs.academic_year_id
          AND es.entity_kind='assessment-component'
          AND es.entity_id=rs.assessment_component_id
         JOIN academic_entity_versions ev
           ON ev.academic_year_id=es.academic_year_id
          AND ev.entity_kind=es.entity_kind
          AND ev.entity_id=es.entity_id
          AND ev.version=es.current_version
        WHERE c.academic_year_id=?
          AND c.logical_source_id=?
          AND c.current_state='active'
          AND c.record_kind='grade-entry'
          AND rs.assessment_component_id IS NOT NULL
        ORDER BY ev.entity_id`,
      source.academic_year_id,
      source.confirmed_logical_source_id,
    );
    const d1LoadMs = elapsed(loadStartedAt);

    const serializeStartedAt = nowMs();
    const logical = logicalRows[0]!;
    const items: ShadowItemV1[] = [
      {
        category: 'logical-source',
        stream_key: `logical-source:${source.confirmed_logical_source_id}`,
        expected_version: null,
        payload: {
          academicYearId: source.academic_year_id,
          logicalSourceId: source.confirmed_logical_source_id,
          teacherId: logical.teacher_id,
          sourceContext: logical.source_context,
          createdAt: logical.created_at,
        },
      },
      {
        category: 'source-file',
        stream_key: `source-file:${source.manifest_id}`,
        expected_version: null,
        payload: objectFromJson(source.payload_json),
      },
      ...components.map<ShadowItemV1>((row) => ({
        category: 'assessment-component',
        stream_key: `assessment-component:${row.entity_id}`,
        expected_version: null,
        payload: objectFromJson(row.payload_json),
      })),
      ...records.flatMap<ShadowItemV1>((row) => [
        {
          category: 'academic-record',
          stream_key: `academic-record:${row.record_kind}:${row.stream_key}`,
          expected_version: null,
          payload: objectFromJson(row.payload_json),
        },
        {
          category: 'association',
          stream_key: `association:${row.record_kind}:${row.stream_key}`,
          expected_version: null,
          payload: {
            recordKind: row.record_kind,
            streamKey: row.stream_key,
            associationVersion: row.association_version,
            state: row.association_state,
            sourceManifestId: row.source_manifest_id,
            sourceManifestVersion: row.source_manifest_version,
          },
        },
      ]),
    ];
    if (items.length === 0 || items.length > MAX_ITEMS_V1) {
      throw new RangeError('shadow-benchmark-item-count-invalid');
    }
    const serialized = JSON.stringify(items);
    const payloadBytes = new TextEncoder().encode(serialized).byteLength;
    if (payloadBytes > MAX_SERIALIZED_BYTES_V1) throw new RangeError('shadow-benchmark-payload-too-large');
    const batches = chunks(items);
    const serializeMs = elapsed(serializeStartedAt);

    const module = await import('postgres');
    const postgres = ((module as unknown as { default?: PostgresFactoryV1 }).default ?? module) as PostgresFactoryV1;
    const sql = postgres(binding.connectionString, {
      max: 5,
      fetch_types: false,
      prepare: true,
      connect_timeout: 10,
      idle_timeout: 2,
      max_lifetime: 60,
    });

    let connectionMs = 0;
    let postgresSetupMs = 0;
    let postgresUploadMs = 0;
    let postgresApplyMs = 0;
    let postgresNoChangesMs = 0;
    let insertedCount = 0;
    let unchangedCount = 0;
    const transactionStartedAt = nowMs();
    try {
      const connectionStartedAt = nowMs();
      await sql`select 1::int as ok`;
      connectionMs = elapsed(connectionStartedAt);
      try {
        await sql.begin(async (transaction) => {
          const setupStartedAt = nowMs();
          await transaction`
            create temporary table gradebook_shadow_incoming_v1 (
              category text not null,
              stream_key text not null,
              expected_version integer,
              payload jsonb not null,
              primary key (category, stream_key)
            ) on commit drop
          `;
          await transaction`
            create temporary table gradebook_shadow_streams_v1 (
              category text not null,
              stream_key text not null,
              current_version integer not null,
              payload jsonb not null,
              primary key (category, stream_key)
            ) on commit drop
          `;
          await transaction`
            create temporary table gradebook_shadow_versions_v1 (
              category text not null,
              stream_key text not null,
              version integer not null,
              payload jsonb not null,
              primary key (category, stream_key, version)
            ) on commit drop
          `;
          postgresSetupMs = elapsed(setupStartedAt);

          const uploadStartedAt = nowMs();
          for (const batch of batches) {
            const batchJson = JSON.stringify(batch);
            await transaction`
              insert into gradebook_shadow_incoming_v1 (category, stream_key, expected_version, payload)
              select category, stream_key, expected_version, payload
                from jsonb_to_recordset(${transaction.typed(batchJson, TEXT_OID)}::jsonb)
                  as x(category text, stream_key text, expected_version integer, payload jsonb)
            `;
          }
          postgresUploadMs = elapsed(uploadStartedAt);

          const applyStartedAt = nowMs();
          const invalidRows = await transaction`
            select count(*)::int as count
              from gradebook_shadow_incoming_v1
             where expected_version is not null
          `;
          if (integer(invalidRows[0]?.count) !== 0) throw new TypeError('shadow-benchmark-not-fresh');
          await transaction`
            insert into gradebook_shadow_streams_v1 (category, stream_key, current_version, payload)
            select category, stream_key, 1, payload
              from gradebook_shadow_incoming_v1
          `;
          await transaction`
            insert into gradebook_shadow_versions_v1 (category, stream_key, version, payload)
            select category, stream_key, 1, payload
              from gradebook_shadow_incoming_v1
          `;
          const insertedRows = await transaction`
            select count(*)::int as count from gradebook_shadow_versions_v1
          `;
          insertedCount = integer(insertedRows[0]?.count);
          if (insertedCount !== items.length) throw new TypeError('shadow-benchmark-write-count-mismatch');
          postgresApplyMs = elapsed(applyStartedAt);

          const noChangesStartedAt = nowMs();
          const unchangedRows = await transaction`
            select count(*)::int as count
              from gradebook_shadow_incoming_v1 i
              join gradebook_shadow_streams_v1 s
                on s.category=i.category and s.stream_key=i.stream_key
             where s.payload=i.payload
          `;
          unchangedCount = integer(unchangedRows[0]?.count);
          if (unchangedCount !== items.length) throw new TypeError('shadow-benchmark-no-change-mismatch');
          postgresNoChangesMs = elapsed(noChangesStartedAt);

          throw new ShadowRollbackV1();
        });
      } catch (cause) {
        if (!(cause instanceof ShadowRollbackV1)) throw cause;
      }
    } finally {
      try {
        await sql.end({ timeout: 2 });
      } catch {
        // Closing a benchmark connection cannot turn a confirmed rollback into a data write.
      }
    }
    const postgresTransactionMs = elapsed(transactionStartedAt);

    return noStoreJson({
      version: 1,
      state: 'completed',
      provider: 'postgres-hyperdrive-shadow',
      persisted: false,
      d1Written: false,
      postgresCommitted: false,
      counts: {
        assessmentComponents: components.length,
        academicRecords: records.length,
        associations: records.length,
        totalItems: items.length,
        inserted: insertedCount,
        unchanged: unchangedCount,
      },
      payloadBytes,
      chunkCount: batches.length,
      timingsMs: {
        d1Locate: d1LocateMs,
        d1Load: d1LoadMs,
        serialize: serializeMs,
        connection: connectionMs,
        postgresSetup: postgresSetupMs,
        postgresUpload: postgresUploadMs,
        postgresApply: postgresApplyMs,
        postgresNoChanges: postgresNoChangesMs,
        postgresTransaction: postgresTransactionMs,
        total: elapsed(totalStartedAt),
      },
    });
  } catch (cause) {
    const sqlState = safeSqlState(cause);
    console.error(
      JSON.stringify({
        message: 'postgres_source_shadow_benchmark_failed',
        errorType: cause instanceof Error ? cause.name : 'unknown',
        sqlState: sqlState ?? null,
      }),
    );
    return noStoreJson(
      {
        version: 1,
        state: 'failed',
        code: 'shadow-benchmark-failed',
        ...(sqlState ? { sqlState } : {}),
      },
      503,
    );
  }
};
