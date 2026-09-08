import { capabilitiesForRoles, requireCapability } from '../../../server/auth/capabilities';
import { requireAuth } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import { enforceOfficialOrigin, enforceWriteOrigin, HttpError } from '../../../server/http/security';
import {
  GRADEBOOK_IMPORT_VALUES_BODY_BYTES_V8,
  inspectGradebookImportPersistenceRequestV8,
  isGradebookImportPersistenceRequestV8,
  type GradebookImportPersistenceRequestV8,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import { createGradebookImportPersistenceServiceV8 } from '../../../server/gradebook/application/import/import-persistence-service-v8';
import {
  GradebookImportStagingCaptureTransactionV1,
  type StagedImportCaptureV1,
} from '../../../server/gradebook/application/import/import-staging-capture-v1';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import {
  createGradebookShadowEmptyTargetUnitOfWorkV1,
  createGradebookShadowReadOnlyD1V1,
} from '../../../server/gradebook/persistence/shadow/gradebook-shadow-d1-v1';

type HyperdriveBindingV1 = { readonly connectionString: string };
type ShadowEnvV1 = RuntimeEnv & { readonly PROD_DB?: HyperdriveBindingV1 };
type Context = EventContext<ShadowEnvV1, string, unknown>;
type PostgresFactoryV1 = typeof import('postgres');

interface ShadowItemV1 {
  readonly category:
    | 'logical-source'
    | 'source-file'
    | 'import-batch'
    | 'academic-entity'
    | 'academic-record'
    | 'association';
  readonly stream_key: string;
  readonly expected_version: number | null;
  readonly payload: unknown;
}

const MAX_ITEMS_V1 = 50_000;
const MAX_SERIALIZED_BYTES_V1 = 32 * 1024 * 1024;
const CHUNK_BYTES_V1 = 480 * 1024;
const CHUNK_ITEMS_V1 = 250;
const TEXT_OID = 25;

class ShadowRollbackV1 extends Error {
  constructor() {
    super('gradebook-v8-shadow-rollback');
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
    throw new TypeError('gradebook-v8-shadow-count-invalid');
  }
  return parsed;
}
function writeDatabase(value: unknown): D1WriteDatabaseV1 {
  if (
    !value ||
    typeof value !== 'object' ||
    !('prepare' in value) ||
    typeof value.prepare !== 'function' ||
    !('exec' in value) ||
    typeof value.exec !== 'function'
  ) {
    throw new HttpError(503, 'Gradebook database unavailable');
  }
  return value as D1WriteDatabaseV1;
}
async function parseRequest(request: Request): Promise<GradebookImportPersistenceRequestV8> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > GRADEBOOK_IMPORT_VALUES_BODY_BYTES_V8) {
    throw new HttpError(413, 'Shadow benchmark request too large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid shadow benchmark request');
  }
  if (
    inspectGradebookImportPersistenceRequestV8(parsed) !== 'ready' ||
    !isGradebookImportPersistenceRequestV8(parsed)
  ) {
    throw new HttpError(400, 'Invalid shadow benchmark request');
  }
  return parsed;
}
function chunks(items: readonly ShadowItemV1[]): readonly (readonly ShadowItemV1[])[] {
  const encoder = new TextEncoder();
  const result: ShadowItemV1[][] = [];
  let current: ShadowItemV1[] = [];
  let currentBytes = 2;
  for (const item of items) {
    const bytes = encoder.encode(JSON.stringify(item)).byteLength + 1;
    if (bytes > CHUNK_BYTES_V1) throw new RangeError('gradebook-v8-shadow-item-too-large');
    if (
      current.length > 0 &&
      (current.length >= CHUNK_ITEMS_V1 || currentBytes + bytes > CHUNK_BYTES_V1)
    ) {
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
function captureItems(capture: StagedImportCaptureV1): readonly ShadowItemV1[] {
  return [
    ...capture.meta.logicalSourceCreates.map<ShadowItemV1>((source) => ({
      category: 'logical-source',
      stream_key: source.id,
      expected_version: null,
      payload: source,
    })),
    ...capture.meta.sourceFileWrites.map<ShadowItemV1>((write) => ({
      category: 'source-file',
      stream_key: write.value.manifest.id,
      expected_version: write.expectedVersion,
      payload: write.value,
    })),
    ...capture.meta.importBatchWrites.map<ShadowItemV1>((write) => ({
      category: 'import-batch',
      stream_key: write.value.id,
      expected_version: write.expectedVersion,
      payload: write.value,
    })),
    ...capture.payload.entities.map<ShadowItemV1>((write) => ({
      category: 'academic-entity',
      stream_key: `${write.record.kind}:${write.record.value.id}`,
      expected_version: write.expectedVersion,
      payload: { record: write.record, recordedAt: write.recordedAt },
    })),
    ...capture.payload.academicRecords.map<ShadowItemV1>((write) => ({
      category: 'academic-record',
      stream_key: write.streamKey,
      expected_version: write.expectedVersion,
      payload: { stream: write.stream, record: write.record, recordedAt: write.recordedAt },
    })),
    ...capture.payload.associations.map<ShadowItemV1>((write) => ({
      category: 'association',
      stream_key: write.streamKey,
      expected_version: write.expectedVersion,
      payload: { stream: write.stream, value: write.value, recordedAt: write.recordedAt },
    })),
  ];
}
function countCategories(items: readonly ShadowItemV1[]) {
  const result = {
    logicalSources: 0,
    sourceFiles: 0,
    importBatches: 0,
    academicEntities: 0,
    academicRecords: 0,
    associations: 0,
  };
  for (const item of items) {
    if (item.category === 'logical-source') result.logicalSources += 1;
    else if (item.category === 'source-file') result.sourceFiles += 1;
    else if (item.category === 'import-batch') result.importBatches += 1;
    else if (item.category === 'academic-entity') result.academicEntities += 1;
    else if (item.category === 'academic-record') result.academicRecords += 1;
    else result.associations += 1;
  }
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
  const requestBytes = Number(context.request.headers.get('content-length') ?? 0) || null;
  const request = await parseRequest(context.request);
  const binding = rawEnv.PROD_DB;
  if (!binding?.connectionString) {
    return noStoreJson({ version: 1, state: 'failed', stage: 'binding', code: 'binding-missing' }, 503);
  }

  const fixedNow = new Date().toISOString();
  const guard = createGradebookShadowReadOnlyD1V1(writeDatabase(rawEnv.GRADEBOOK_D1));
  const officialUnitOfWork = createGradebookD1PersistenceUnitOfWorkV2(guard.database, {
    now: () => fixedNow,
  });
  const shadowUnitOfWork = createGradebookShadowEmptyTargetUnitOfWorkV1(officialUnitOfWork);
  const capture = new GradebookImportStagingCaptureTransactionV1(
    shadowUnitOfWork,
    () => fixedNow,
  );
  let sequence = 0;
  const planningStartedAt = nowMs();
  const response = await createGradebookImportPersistenceServiceV8({
    unitOfWork: shadowUnitOfWork,
    transaction: capture,
    annualStateSource: createGradebookD1ImportAnnualStateSourceV1(guard.database),
    now: () => fixedNow,
    createId: (kind) => `${kind}:shadow:${++sequence}:${crypto.randomUUID()}`,
  }).execute(request);
  const d1PlanningMs = elapsed(planningStartedAt);
  if (guard.writeAttempts() !== 0) {
    return noStoreJson(
      { version: 1, state: 'failed', stage: 'd1-guard', code: 'd1-write-attempt-blocked' },
      503,
    );
  }
  if (response.state !== 'applied' && response.state !== 'no-changes') {
    return noStoreJson({
      version: 1,
      state: 'planning-rejected',
      serviceState: response.state,
      d1Written: false,
      postgresCommitted: false,
      persisted: false,
      timingsMs: { d1Planning: d1PlanningMs, total: elapsed(totalStartedAt) },
    });
  }

  let captured: StagedImportCaptureV1;
  try {
    captured = capture.takeCapture();
  } catch {
    return noStoreJson(
      { version: 1, state: 'failed', stage: 'capture', code: 'capture-unavailable' },
      503,
    );
  }
  const serializeStartedAt = nowMs();
  const items = captureItems(captured);
  if (items.length === 0 || items.length > MAX_ITEMS_V1) {
    return noStoreJson(
      { version: 1, state: 'failed', stage: 'capture', code: 'capture-size-invalid' },
      503,
    );
  }
  const serialized = JSON.stringify(items);
  const payloadBytes = new TextEncoder().encode(serialized).byteLength;
  if (payloadBytes > MAX_SERIALIZED_BYTES_V1) {
    return noStoreJson(
      { version: 1, state: 'failed', stage: 'capture', code: 'capture-payload-too-large' },
      503,
    );
  }
  const batches = chunks(items);
  const serializeMs = elapsed(serializeStartedAt);
  const categoryCounts = countCategories(items);

  const module = await import('postgres');
  const postgres = ((module as unknown as { default?: PostgresFactoryV1 }).default ??
    module) as PostgresFactoryV1;
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
  let postgresTransactionMs = 0;
  let inserted = 0;
  let unchanged = 0;
  try {
    const connectionStartedAt = nowMs();
    await sql`select 1::int as ok`;
    connectionMs = elapsed(connectionStartedAt);
    const transactionStartedAt = nowMs();
    try {
      await sql.begin(async (transaction) => {
        const setupStartedAt = nowMs();
        await transaction`
          create temporary table gradebook_v8_shadow_incoming_v1 (
            category text not null,
            stream_key text not null,
            expected_version integer,
            payload jsonb not null,
            primary key (category, stream_key)
          ) on commit drop
        `;
        await transaction`
          create temporary table gradebook_v8_shadow_streams_v1 (
            category text not null,
            stream_key text not null,
            current_version integer not null,
            payload jsonb not null,
            primary key (category, stream_key)
          ) on commit drop
        `;
        await transaction`
          create temporary table gradebook_v8_shadow_versions_v1 (
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
            insert into gradebook_v8_shadow_incoming_v1
              (category, stream_key, expected_version, payload)
            select category, stream_key, expected_version, payload
              from jsonb_to_recordset(${transaction.typed(batchJson, TEXT_OID)}::jsonb)
                as incoming(category text, stream_key text, expected_version integer, payload jsonb)
          `;
        }
        postgresUploadMs = elapsed(uploadStartedAt);

        const applyStartedAt = nowMs();
        await transaction`
          with upserted as (
            insert into gradebook_v8_shadow_streams_v1
              (category, stream_key, current_version, payload)
            select category, stream_key, 1, payload
              from gradebook_v8_shadow_incoming_v1
            on conflict (category, stream_key) do update
              set current_version = gradebook_v8_shadow_streams_v1.current_version + 1,
                  payload = excluded.payload
              where gradebook_v8_shadow_streams_v1.payload is distinct from excluded.payload
            returning category, stream_key, current_version, payload
          )
          insert into gradebook_v8_shadow_versions_v1
            (category, stream_key, version, payload)
          select category, stream_key, current_version, payload from upserted
        `;
        inserted = integer(
          (await transaction`select count(*)::int as n from gradebook_v8_shadow_versions_v1`)[0]
            ?.n,
        );
        postgresApplyMs = elapsed(applyStartedAt);

        const noChangesStartedAt = nowMs();
        const changedRows = await transaction`
          with changed as (
            update gradebook_v8_shadow_streams_v1 as current
               set current_version = current.current_version + 1,
                   payload = incoming.payload
              from gradebook_v8_shadow_incoming_v1 as incoming
             where current.category = incoming.category
               and current.stream_key = incoming.stream_key
               and current.payload is distinct from incoming.payload
            returning 1
          )
          select count(*)::int as n from changed
        `;
        unchanged = items.length - integer(changedRows[0]?.n);
        postgresNoChangesMs = elapsed(noChangesStartedAt);
        throw new ShadowRollbackV1();
      });
      throw new Error('gradebook-v8-shadow-commit-forbidden');
    } catch (cause) {
      if (!(cause instanceof ShadowRollbackV1)) throw cause;
    } finally {
      postgresTransactionMs = elapsed(transactionStartedAt);
    }
  } catch (cause) {
    return noStoreJson(
      {
        version: 1,
        state: 'failed',
        stage: 'postgres',
        code: 'shadow-runtime-failed',
        ...(safeSqlState(cause) ? { sqlState: safeSqlState(cause) } : {}),
        d1Written: false,
        postgresCommitted: false,
        persisted: false,
      },
      503,
    );
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }

  return noStoreJson({
    version: 1,
    state: 'completed',
    provider: 'postgres-hyperdrive-v8-shadow',
    sourceTransport: 'values-v8',
    requestBytes,
    payloadBytes,
    chunkCount: batches.length,
    counts: {
      ...categoryCounts,
      totalItems: items.length,
      inserted,
      unchanged,
    },
    d1Written: false,
    d1WriteAttempts: guard.writeAttempts(),
    postgresCommitted: false,
    persisted: false,
    timingsMs: {
      d1Planning: d1PlanningMs,
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
};
