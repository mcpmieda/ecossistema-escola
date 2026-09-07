import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V4,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
  inspectGradebookImportPersistenceRequestV4,
  isGradebookImportPersistenceRequestV4,
  isGradebookImportPersistenceResponseV4,
  type GradebookImportPersistenceResponseV4,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
  inspectGradebookImportPersistenceRequestV5,
  isGradebookImportPersistenceRequestV5,
  isGradebookImportPersistenceResponseV5,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6,
  inspectGradebookImportPersistenceRequestV6,
  isGradebookImportPersistenceRequestV6,
  isGradebookImportPersistenceResponseV6,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V7,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
  inspectGradebookImportPersistenceBatchRequestV7,
  isGradebookImportPersistenceBatchRequestV7,
  isGradebookImportPersistenceBatchResponseV7,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v7';
import type {
  AcademicEntityRecordV1,
  VersionedRecordV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  ImportBootstrapTransactionPortV2,
  PersistenceUnitOfWorkV2,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { createGradebookImportCatalogBatchReadCacheV1 } from '../application/import/import-catalog-bootstrap-read-cache-v1';
import {
  createGradebookImportPersistenceBatchServiceV7,
  type GradebookImportPersistenceBatchRetryabilityV7,
} from '../application/import/import-persistence-batch-service-v7';
import { createGradebookImportPersistenceServiceV4 } from '../application/import/import-persistence-service-v2';
import { createGradebookImportPersistenceServiceV5 } from '../application/import/import-persistence-service-v5';
import { createGradebookImportPersistenceServiceV6 } from '../application/import/import-persistence-service-v6';
import { createGradebookImportSharedSourceReadCacheV1 } from '../application/import/import-shared-source-read-cache-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../persistence/d1/imports/d1-import-annual-state-source-v1';
import type { D1ReadDatabaseV1 } from '../persistence/d1/read/d1-read-adapter-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  instrumentGradebookD1ForBenchmarkV1,
  type GradebookD1BenchmarkSnapshotV1,
} from '../persistence/d1/runtime/d1-benchmark-instrumentation-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';
import { isGradebookD1TransientTransactionErrorV1 } from '../persistence/d1/transaction/d1-batch-promotion-transaction-v1';
import type { D1WriteDatabaseV1 } from '../persistence/d1/write/d1-write-adapter-v1';
import { handleGradebookImportStagingRequestV1 } from './import-staging-routes-v1';

export const GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V4 = '/api/gradebook/import-persistence';
const GRADEBOOK_IMPORT_SERVER_MS_HEADER_V1 = 'X-Gradebook-Server-Ms';
const GRADEBOOK_IMPORT_BENCHMARK_HEADER_V1 = 'X-Gradebook-Benchmark';
const GRADEBOOK_IMPORT_BENCHMARK_VALUE_V1 = 'paid-direct-v1';

interface GradebookImportBenchmarkPhasesV1 {
  readonly preServiceMs: number;
  readonly authMs: number;
  readonly bodyMs: number;
  readonly inspectMs: number;
}

function noStore(
  value: unknown,
  status = 200,
  additionalHeaders: Readonly<Record<string, string>> = {},
): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Expires: '0',
      Pragma: 'no-cache',
      ...additionalHeaders,
    },
  });
}

function state(
  value: Extract<
    GradebookImportPersistenceResponseV4,
    { state: 'not-authorized' | 'unavailable' }
  >['state'],
  status: number,
): Response {
  return noStore(
    { transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4, state: value },
    status,
  );
}

function declaredVersion(payload: unknown): 4 | 5 | 6 | 7 {
  if (payload !== null && typeof payload === 'object' && 'transportVersion' in payload) {
    if (payload.transportVersion === GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7) return 7;
    if (payload.transportVersion === GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6) return 6;
    if (payload.transportVersion === GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5) return 5;
  }
  return 4;
}

function serializedByteLength(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function benchmarkRequested(request: Request): boolean {
  return request.headers.get(GRADEBOOK_IMPORT_BENCHMARK_HEADER_V1) === GRADEBOOK_IMPORT_BENCHMARK_VALUE_V1;
}

function benchmarkHeaders(
  serviceStartedAt: number,
  snapshot: GradebookD1BenchmarkSnapshotV1 | null,
  phases: GradebookImportBenchmarkPhasesV1 | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    [GRADEBOOK_IMPORT_SERVER_MS_HEADER_V1]: String(Date.now() - serviceStartedAt),
  };
  if (phases) {
    headers['X-Gradebook-Pre-Service-Ms'] = String(phases.preServiceMs);
    headers['X-Gradebook-Auth-Ms'] = String(phases.authMs);
    headers['X-Gradebook-Body-Ms'] = String(phases.bodyMs);
    headers['X-Gradebook-Inspect-Ms'] = String(phases.inspectMs);
  }
  if (!snapshot) return headers;
  headers['X-Gradebook-D1-Calls'] = String(snapshot.calls);
  headers['X-Gradebook-D1-First-Calls'] = String(snapshot.firstCalls);
  headers['X-Gradebook-D1-All-Calls'] = String(snapshot.allCalls);
  headers['X-Gradebook-D1-Run-Calls'] = String(snapshot.runCalls);
  headers['X-Gradebook-D1-Batch-Calls'] = String(snapshot.batchCalls);
  headers['X-Gradebook-D1-Exec-Calls'] = String(snapshot.execCalls);
  headers['X-Gradebook-D1-Catalog-Snapshot-Calls'] = String(snapshot.catalogSnapshotCalls);
  headers['X-Gradebook-D1-Wall-Ms'] = String(snapshot.wallMs);
  headers['X-Gradebook-D1-Max-Ms'] = String(snapshot.maxCallMs);
  headers['X-Gradebook-D1-Breakdown'] = JSON.stringify(snapshot.categories);
  if (snapshot.sqlMs !== null) headers['X-Gradebook-D1-Sql-Ms'] = String(snapshot.sqlMs);
  return headers;
}

export async function handleGradebookImportPersistenceRequestV4(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V4) return null;
  const routeStartedAt = Date.now();
  enforceOfficialOrigin(request, env);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);
  const benchmarkMode = benchmarkRequested(request);

  const authStartedAt = Date.now();
  let authorization: ReturnType<typeof authorizeGradebookD1RuntimeV1>;
  try {
    authorization = authorizeGradebookD1RuntimeV1(await requireAuth(request, env));
  } catch (cause) {
    if (cause instanceof AuthenticationError) return state('not-authorized', 401);
    if (cause instanceof AuthorizationError) return state('not-authorized', 403);
    return state('unavailable', 500);
  }
  const authMs = Date.now() - authStartedAt;

  const bodyStartedAt = Date.now();
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V7.maxBodyBytes);
  } catch (cause) {
    const reason =
      cause instanceof HttpError && cause.status === 413 ? 'payload-too-large' : 'invalid-request';
    return noStore(
      {
        transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
        state: 'invalid-request',
        reason,
      },
      cause instanceof HttpError ? cause.status : 400,
    );
  }
  const bodyMs = Date.now() - bodyStartedAt;

  const inspectStartedAt = Date.now();
  const version = declaredVersion(payload);
  const bytes = serializedByteLength(payload);
  if (
    bytes === null ||
    (version !== 7 && bytes > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V4.maxBodyBytes)
  ) {
    return noStore(
      {
        transportVersion: version,
        state: 'invalid-request',
        reason: bytes === null ? 'invalid-request' : 'payload-too-large',
      },
      bytes === null ? 400 : 413,
    );
  }
  const inspection =
    version === 7
      ? inspectGradebookImportPersistenceBatchRequestV7(payload)
      : version === 6
        ? inspectGradebookImportPersistenceRequestV6(payload)
        : version === 5
          ? inspectGradebookImportPersistenceRequestV5(payload)
          : inspectGradebookImportPersistenceRequestV4(payload);
  const compatible =
    inspection === 'ready' &&
    (version === 7
      ? isGradebookImportPersistenceBatchRequestV7(payload)
      : version === 6
        ? isGradebookImportPersistenceRequestV6(payload)
        : version === 5
          ? isGradebookImportPersistenceRequestV5(payload)
          : isGradebookImportPersistenceRequestV4(payload));
  const inspectMs = Date.now() - inspectStartedAt;
  if (!compatible) {
    return noStore(
      {
        transportVersion: version,
        state: 'invalid-request',
        reason: inspection === 'ready' ? 'invalid-request' : inspection,
      },
      inspection === 'payload-too-large' ? 413 : 400,
    );
  }

  const serviceStartedAt = Date.now();
  const phases = benchmarkMode
    ? {
        preServiceMs: serviceStartedAt - routeStartedAt,
        authMs,
        bodyMs,
        inspectMs,
      }
    : null;
  const rawDatabase = env.GRADEBOOK_D1 as D1WriteDatabaseV1;
  const benchmark = benchmarkMode ? instrumentGradebookD1ForBenchmarkV1(rawDatabase) : null;
  const executionEnv = benchmark
    ? ({ ...env, GRADEBOOK_D1: benchmark.database } as RuntimeEnv)
    : env;

  const createDependencies = () => {
    const runtime = createGradebookD1RuntimeV1(executionEnv, authorization);
    const annualStateSource = createGradebookD1ImportAnnualStateSourceV1(
      executionEnv.GRADEBOOK_D1 as D1ReadDatabaseV1,
    );
    const unitOfWork = createGradebookImportSharedSourceReadCacheV1(
      runtime.persistenceUnitOfWorkV2(),
    );
    return {
      unitOfWork,
      transaction: runtime.importBootstrapTransactionV2(),
      annualStateSource,
      now: () => new Date().toISOString(),
      createId: (kind: 'logical-source' | 'manifest' | 'import-batch' | 'import-file') =>
        `${kind}:${crypto.randomUUID()}`,
    } satisfies Parameters<typeof createGradebookImportPersistenceServiceV4>[0];
  };

  try {
    let response:
      | Awaited<ReturnType<ReturnType<typeof createGradebookImportPersistenceBatchServiceV7>['execute']>>
      | Awaited<ReturnType<ReturnType<typeof createGradebookImportPersistenceServiceV6>['execute']>>
      | Awaited<ReturnType<ReturnType<typeof createGradebookImportPersistenceServiceV5>['execute']>>
      | Awaited<ReturnType<ReturnType<typeof createGradebookImportPersistenceServiceV4>['execute']>>
      | null = null;

    if (version === 7 && isGradebookImportPersistenceBatchRequestV7(payload)) {
      const batchRuntime = createGradebookD1RuntimeV1(executionEnv, authorization);
      const batchBaseUnitOfWork = batchRuntime.persistenceUnitOfWorkV2();
      const batchCatalog = createGradebookImportCatalogBatchReadCacheV1(
        batchBaseUnitOfWork.entities,
      );

      const createBatchDependencies = (
        observeRetryability: (value: GradebookImportPersistenceBatchRetryabilityV7) => void,
      ) => {
        const unitOfWork = createGradebookImportSharedSourceReadCacheV1({
          ...batchBaseUnitOfWork,
          entities: batchCatalog.repository,
        });
        const baseTransaction = batchRuntime.importBootstrapTransactionV2();
        const transaction: ImportBootstrapTransactionPortV2 = {
          async runImportBootstrap<T>(context, bootstrapRequest, operation): Promise<T> {
            const committedEntities: VersionedRecordV1<AcademicEntityRecordV1>[] = [];
            try {
              const result = await baseTransaction.runImportBootstrap(
                context,
                bootstrapRequest,
                async (transactionUnitOfWork) => {
                  const trackedUnitOfWork: PersistenceUnitOfWorkV2 = {
                    ...transactionUnitOfWork,
                    entities: {
                      ...transactionUnitOfWork.entities,
                      appendVersion: async (writeContext, record, expectation) => {
                        const write = await transactionUnitOfWork.entities.appendVersion(
                          writeContext,
                          record,
                          expectation,
                        );
                        if (write.status === 'written') committedEntities.push(write.record);
                        return write;
                      },
                    },
                  };
                  return operation(trackedUnitOfWork);
                },
              );
              batchCatalog.commit({ context, records: committedEntities });
              return result;
            } catch (cause) {
              observeRetryability(
                isGradebookD1TransientTransactionErrorV1(cause) ? 'transient-d1' : 'none',
              );
              throw cause;
            }
          },
        };
        return {
          unitOfWork,
          transaction,
          annualStateSource: createGradebookD1ImportAnnualStateSourceV1(
            executionEnv.GRADEBOOK_D1 as D1ReadDatabaseV1,
          ),
          now: () => new Date().toISOString(),
          createId: (kind: 'logical-source' | 'manifest' | 'import-batch' | 'import-file') =>
            `${kind}:${crypto.randomUUID()}`,
        } satisfies Parameters<typeof createGradebookImportPersistenceServiceV4>[0];
      };

      response = await createGradebookImportPersistenceBatchServiceV7(() => ({
        async execute(item) {
          let retryability: GradebookImportPersistenceBatchRetryabilityV7 = 'none';
          const dependencies = createBatchDependencies((value) => {
            retryability = value;
          });
          const itemResponse = await createGradebookImportPersistenceServiceV6(
            dependencies,
          ).execute(item);
          return { response: itemResponse, retryability };
        },
      })).execute(payload);
    } else if (version === 6 && isGradebookImportPersistenceRequestV6(payload)) {
      response = await createGradebookImportPersistenceServiceV6(createDependencies()).execute(payload);
    } else if (version === 5 && isGradebookImportPersistenceRequestV5(payload)) {
      response = await createGradebookImportPersistenceServiceV5(createDependencies()).execute(payload);
    } else if (isGradebookImportPersistenceRequestV4(payload)) {
      response = await createGradebookImportPersistenceServiceV4(createDependencies()).execute(payload);
    }

    const timingHeaders = benchmarkHeaders(
      serviceStartedAt,
      benchmark?.snapshot() ?? null,
      phases,
    );
    if (response === null) {
      return noStore({ transportVersion: version, state: 'unavailable' }, 500, timingHeaders);
    }

    const valid =
      version === 7
        ? isGradebookImportPersistenceBatchResponseV7(response)
        : version === 6
          ? isGradebookImportPersistenceResponseV6(response)
          : version === 5
            ? isGradebookImportPersistenceResponseV5(response)
            : isGradebookImportPersistenceResponseV4(response);
    return valid
      ? noStore(response, response.state === 'unavailable' ? 503 : 200, timingHeaders)
      : noStore({ transportVersion: version, state: 'unavailable' }, 500, timingHeaders);
  } catch {
    return noStore(
      { transportVersion: version, state: 'unavailable' },
      503,
      benchmarkHeaders(serviceStartedAt, benchmark?.snapshot() ?? null, phases),
    );
  }
}

/** Central Functions wiring handles the historical monolithic endpoint, V7 batch and staged V6 flow. */
export async function handleGradebookImportPersistenceRequestV2(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  const staged = await handleGradebookImportStagingRequestV1(request, env);
  return staged ?? handleGradebookImportPersistenceRequestV4(request, env);
}
