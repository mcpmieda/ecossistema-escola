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
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { createGradebookImportPersistenceServiceV4 } from '../application/import/import-persistence-service-v2';
import { createGradebookImportPersistenceServiceV5 } from '../application/import/import-persistence-service-v5';
import { createGradebookImportPersistenceServiceV6 } from '../application/import/import-persistence-service-v6';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../persistence/d1/imports/d1-import-annual-state-source-v1';
import type { D1ReadDatabaseV1 } from '../persistence/d1/read/d1-read-adapter-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  instrumentGradebookD1ForBenchmarkV1,
  type GradebookD1BenchmarkSnapshotV1,
} from '../persistence/d1/runtime/d1-benchmark-instrumentation-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';
import type { D1WriteDatabaseV1 } from '../persistence/d1/write/d1-write-adapter-v1';
import { handleGradebookImportStagingRequestV1 } from './import-staging-routes-v1';

export const GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V4 = '/api/gradebook/import-persistence';
const GRADEBOOK_IMPORT_SERVER_MS_HEADER_V1 = 'X-Gradebook-Server-Ms';
const GRADEBOOK_IMPORT_BENCHMARK_HEADER_V1 = 'X-Gradebook-Benchmark';
const GRADEBOOK_IMPORT_BENCHMARK_VALUE_V1 = 'paid-direct-v1';

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

function declaredVersion(payload: unknown): 4 | 5 | 6 {
  if (payload !== null && typeof payload === 'object' && 'transportVersion' in payload) {
    if (payload.transportVersion === GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6) return 6;
    if (payload.transportVersion === GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5) return 5;
  }
  return 4;
}

function benchmarkRequested(request: Request): boolean {
  return request.headers.get(GRADEBOOK_IMPORT_BENCHMARK_HEADER_V1) === GRADEBOOK_IMPORT_BENCHMARK_VALUE_V1;
}

function benchmarkHeaders(
  serviceStartedAt: number,
  snapshot: GradebookD1BenchmarkSnapshotV1 | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    [GRADEBOOK_IMPORT_SERVER_MS_HEADER_V1]: String(Date.now() - serviceStartedAt),
  };
  if (!snapshot) return headers;
  headers['X-Gradebook-D1-Calls'] = String(snapshot.calls);
  headers['X-Gradebook-D1-First-Calls'] = String(snapshot.firstCalls);
  headers['X-Gradebook-D1-All-Calls'] = String(snapshot.allCalls);
  headers['X-Gradebook-D1-Run-Calls'] = String(snapshot.runCalls);
  headers['X-Gradebook-D1-Batch-Calls'] = String(snapshot.batchCalls);
  headers['X-Gradebook-D1-Exec-Calls'] = String(snapshot.execCalls);
  headers['X-Gradebook-D1-Wall-Ms'] = String(snapshot.wallMs);
  headers['X-Gradebook-D1-Max-Ms'] = String(snapshot.maxCallMs);
  if (snapshot.sqlMs !== null) headers['X-Gradebook-D1-Sql-Ms'] = String(snapshot.sqlMs);
  return headers;
}

export async function handleGradebookImportPersistenceRequestV4(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V4) return null;
  enforceOfficialOrigin(request, env);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);

  let authorization: ReturnType<typeof authorizeGradebookD1RuntimeV1>;
  try {
    authorization = authorizeGradebookD1RuntimeV1(await requireAuth(request, env));
  } catch (cause) {
    if (cause instanceof AuthenticationError) return state('not-authorized', 401);
    if (cause instanceof AuthorizationError) return state('not-authorized', 403);
    return state('unavailable', 500);
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(request, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V4.maxBodyBytes);
  } catch (cause) {
    const reason =
      cause instanceof HttpError && cause.status === 413 ? 'payload-too-large' : 'invalid-request';
    return noStore(
      {
        transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
        state: 'invalid-request',
        reason,
      },
      cause instanceof HttpError ? cause.status : 400,
    );
  }

  const version = declaredVersion(payload);
  const inspection =
    version === 6
      ? inspectGradebookImportPersistenceRequestV6(payload)
      : version === 5
        ? inspectGradebookImportPersistenceRequestV5(payload)
        : inspectGradebookImportPersistenceRequestV4(payload);
  const compatible =
    inspection === 'ready' &&
    (version === 6
      ? isGradebookImportPersistenceRequestV6(payload)
      : version === 5
        ? isGradebookImportPersistenceRequestV5(payload)
        : isGradebookImportPersistenceRequestV4(payload));
  if (!compatible) {
    return noStore(
      {
        transportVersion: version,
        state: 'invalid-request',
        reason: inspection === 'ready' ? 'invalid-request' : inspection,
      },
      400,
    );
  }

  const serviceStartedAt = Date.now();
  const rawDatabase = env.GRADEBOOK_D1 as D1WriteDatabaseV1;
  const benchmark = benchmarkRequested(request)
    ? instrumentGradebookD1ForBenchmarkV1(rawDatabase)
    : null;
  const executionEnv = benchmark
    ? ({ ...env, GRADEBOOK_D1: benchmark.database } as RuntimeEnv)
    : env;
  try {
    const runtime = createGradebookD1RuntimeV1(executionEnv, authorization);
    const annualStateSource = createGradebookD1ImportAnnualStateSourceV1(
      executionEnv.GRADEBOOK_D1 as D1ReadDatabaseV1,
    );
    const dependencies = {
      unitOfWork: runtime.persistenceUnitOfWorkV2(),
      transaction: runtime.importBootstrapTransactionV2(),
      annualStateSource,
      now: () => new Date().toISOString(),
      createId: (kind) => `${kind}:${crypto.randomUUID()}`,
    } satisfies Parameters<typeof createGradebookImportPersistenceServiceV4>[0];

    const response =
      version === 6 && isGradebookImportPersistenceRequestV6(payload)
        ? await createGradebookImportPersistenceServiceV6(dependencies).execute(payload)
        : version === 5 && isGradebookImportPersistenceRequestV5(payload)
          ? await createGradebookImportPersistenceServiceV5(dependencies).execute(payload)
          : isGradebookImportPersistenceRequestV4(payload)
            ? await createGradebookImportPersistenceServiceV4(dependencies).execute(payload)
            : null;
    const timingHeaders = benchmarkHeaders(serviceStartedAt, benchmark?.snapshot() ?? null);
    if (response === null) {
      return noStore({ transportVersion: version, state: 'unavailable' }, 500, timingHeaders);
    }

    const valid =
      version === 6
        ? isGradebookImportPersistenceResponseV6(response)
        : version === 5
          ? isGradebookImportPersistenceResponseV5(response)
          : isGradebookImportPersistenceResponseV4(response);
    return valid
      ? noStore(response, 200, timingHeaders)
      : noStore({ transportVersion: version, state: 'unavailable' }, 500, timingHeaders);
  } catch {
    return noStore(
      { transportVersion: version, state: 'unavailable' },
      503,
      benchmarkHeaders(serviceStartedAt, benchmark?.snapshot() ?? null),
    );
  }
}

/** Central Functions wiring handles both the historical monolithic endpoint and staged V6 flow. */
export async function handleGradebookImportPersistenceRequestV2(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  const staged = await handleGradebookImportStagingRequestV1(request, env);
  return staged ?? handleGradebookImportPersistenceRequestV4(request, env);
}
