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
import {
  applyPostgresShadowV1,
  PostgresShadowApplyErrorV1,
  type PostgresShadowItemV1,
} from '../../../server/gradebook/persistence/shadow/postgres-shadow-apply-v1';

type HyperdriveBindingV1 = { readonly connectionString: string };
type ShadowEnvV1 = RuntimeEnv & { readonly PROD_DB?: HyperdriveBindingV1 };
type Context = EventContext<ShadowEnvV1, string, unknown>;

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
async function parseRequest(request: Request): Promise<{
  readonly value: GradebookImportPersistenceRequestV8;
  readonly bytes: number;
}> {
  const text = await request.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > GRADEBOOK_IMPORT_VALUES_BODY_BYTES_V8) {
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
  return { value: parsed, bytes };
}
function captureItems(capture: StagedImportCaptureV1): readonly PostgresShadowItemV1[] {
  return [
    ...capture.meta.logicalSourceCreates.map<PostgresShadowItemV1>((source) => ({
      category: 'logical-source',
      stream_key: source.id,
      expected_version: null,
      payload: source,
    })),
    ...capture.meta.sourceFileWrites.map<PostgresShadowItemV1>((write) => ({
      category: 'source-file',
      stream_key: write.value.manifest.id,
      expected_version: write.expectedVersion,
      payload: write.value,
    })),
    ...capture.meta.importBatchWrites.map<PostgresShadowItemV1>((write) => ({
      category: 'import-batch',
      stream_key: write.value.id,
      expected_version: write.expectedVersion,
      payload: write.value,
    })),
    ...capture.payload.entities.map<PostgresShadowItemV1>((write) => ({
      category: 'academic-entity',
      stream_key: `${write.record.kind}:${write.record.value.id}`,
      expected_version: write.expectedVersion,
      payload: { record: write.record, recordedAt: write.recordedAt },
    })),
    ...capture.payload.academicRecords.map<PostgresShadowItemV1>((write) => ({
      category: 'academic-record',
      stream_key: write.streamKey,
      expected_version: write.expectedVersion,
      payload: { stream: write.stream, record: write.record, recordedAt: write.recordedAt },
    })),
    ...capture.payload.associations.map<PostgresShadowItemV1>((write) => ({
      category: 'association',
      stream_key: write.streamKey,
      expected_version: write.expectedVersion,
      payload: { stream: write.stream, value: write.value, recordedAt: write.recordedAt },
    })),
  ];
}
function categoryCounts(items: readonly PostgresShadowItemV1[]) {
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
    else if (item.category === 'association') result.associations += 1;
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
  const request = await parseRequest(context.request);
  const binding = rawEnv.PROD_DB;
  if (!binding?.connectionString) {
    return noStoreJson({ version: 1, state: 'failed', stage: 'binding', code: 'binding-missing' }, 503);
  }

  const fixedNow = new Date().toISOString();
  const guard = createGradebookShadowReadOnlyD1V1(writeDatabase(rawEnv.GRADEBOOK_D1));
  const official = createGradebookD1PersistenceUnitOfWorkV2(guard.database, {
    now: () => fixedNow,
  });
  const target = createGradebookShadowEmptyTargetUnitOfWorkV1(official);
  const capture = new GradebookImportStagingCaptureTransactionV1(target, () => fixedNow);
  let sequence = 0;
  const planningStartedAt = nowMs();
  const response = await createGradebookImportPersistenceServiceV8({
    unitOfWork: target,
    transaction: capture,
    annualStateSource: createGradebookD1ImportAnnualStateSourceV1(guard.database),
    now: () => fixedNow,
    createId: (kind) => `${kind}:shadow:${++sequence}:${crypto.randomUUID()}`,
  }).execute(request.value);
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
  const counts = categoryCounts(items);
  const serializeMs = elapsed(serializeStartedAt);

  try {
    const postgres = await applyPostgresShadowV1(binding.connectionString, items);
    return noStoreJson({
      version: 1,
      state: 'completed',
      provider: 'postgres-hyperdrive-v8-shadow',
      sourceTransport: 'values-v8',
      requestBytes: request.bytes,
      payloadBytes: postgres.payloadBytes,
      maxItemBytes: postgres.maxItemBytes,
      chunkCount: postgres.chunkCount,
      duplicateKeys: postgres.duplicateKeys,
      counts: {
        ...counts,
        totalItems: items.length,
        inserted: postgres.inserted,
        unchanged: postgres.unchanged,
      },
      d1Written: false,
      d1WriteAttempts: guard.writeAttempts(),
      postgresCommitted: false,
      persisted: false,
      timingsMs: {
        d1Planning: d1PlanningMs,
        serialize: serializeMs,
        connection: postgres.timingsMs.connection,
        postgresSetup: postgres.timingsMs.setup,
        postgresUpload: postgres.timingsMs.upload,
        postgresApply: postgres.timingsMs.apply,
        postgresNoChanges: postgres.timingsMs.noChanges,
        postgresTransaction: postgres.timingsMs.transaction,
        total: elapsed(totalStartedAt),
      },
    });
  } catch (cause) {
    if (cause instanceof PostgresShadowApplyErrorV1) {
      return noStoreJson(
        {
          version: 1,
          state: 'failed',
          provider: 'postgres-hyperdrive-v8-shadow',
          stage: `postgres-${cause.stage}`,
          code: cause.code,
          requestBytes: request.bytes,
          diagnostics: {
            itemCount: cause.diagnostics.itemCount,
            payloadBytes: cause.diagnostics.payloadBytes,
            maxItemBytes: cause.diagnostics.maxItemBytes,
            chunkCount: cause.diagnostics.chunkCount,
            duplicateKeys: cause.diagnostics.duplicateKeys,
          },
          counts: { ...counts, totalItems: items.length },
          ...(cause.sqlState ? { sqlState: cause.sqlState } : {}),
          d1Written: false,
          d1WriteAttempts: guard.writeAttempts(),
          postgresCommitted: false,
          persisted: false,
          timingsMs: {
            d1Planning: d1PlanningMs,
            serialize: serializeMs,
            connection: cause.diagnostics.timingsMs.connection,
            postgresSetup: cause.diagnostics.timingsMs.setup,
            postgresUpload: cause.diagnostics.timingsMs.upload,
            postgresApply: cause.diagnostics.timingsMs.apply,
            postgresNoChanges: cause.diagnostics.timingsMs.noChanges,
            postgresTransaction: cause.diagnostics.timingsMs.transaction,
            total: elapsed(totalStartedAt),
          },
        },
        503,
      );
    }
    return noStoreJson(
      {
        version: 1,
        state: 'failed',
        provider: 'postgres-hyperdrive-v8-shadow',
        stage: 'postgres-unknown',
        code: 'shadow-runtime-failed',
        ...(safeSqlState(cause) ? { sqlState: safeSqlState(cause) } : {}),
        counts: { ...counts, totalItems: items.length },
        d1Written: false,
        d1WriteAttempts: guard.writeAttempts(),
        postgresCommitted: false,
        persisted: false,
        timingsMs: {
          d1Planning: d1PlanningMs,
          serialize: serializeMs,
          total: elapsed(totalStartedAt),
        },
      },
      503,
    );
  }
};
