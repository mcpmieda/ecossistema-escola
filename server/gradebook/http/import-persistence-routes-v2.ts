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
import { createGradebookD1ImportAnnualStateSourceV1 } from '../persistence/d1/imports/d1-import-annual-state-source-v1';
import type { D1ReadDatabaseV1 } from '../persistence/d1/read/d1-read-adapter-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V4 = '/api/gradebook/import-persistence';

function noStore(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Expires: '0',
      Pragma: 'no-cache',
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
  const inspection = inspectGradebookImportPersistenceRequestV4(payload);
  const inspectionV5 = inspectGradebookImportPersistenceRequestV5(payload);
  const requestV5 = inspectionV5 === 'ready' && isGradebookImportPersistenceRequestV5(payload);
  const requestV4 = inspection === 'ready' && isGradebookImportPersistenceRequestV4(payload);
  if (!requestV4 && !requestV5) {
    const version =
      payload !== null &&
      typeof payload === 'object' &&
      'transportVersion' in payload &&
      payload.transportVersion === GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5
        ? GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5
        : GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4;
    const selectedInspection = version === 5 ? inspectionV5 : inspection;
    return noStore(
      {
        transportVersion: version,
        state: 'invalid-request',
        reason: selectedInspection === 'ready' ? 'invalid-request' : selectedInspection,
      },
      400,
    );
  }

  try {
    // Runtime construction remains the single production gate/binding validator. The annual
    // read source is instantiated only after this succeeds, so it cannot bypass fail-closed.
    const runtime = createGradebookD1RuntimeV1(env, authorization);
    const annualStateSource = createGradebookD1ImportAnnualStateSourceV1(
      env.GRADEBOOK_D1 as D1ReadDatabaseV1,
    );
    const dependencies = {
      unitOfWork: runtime.persistenceUnitOfWorkV2(),
      transaction: runtime.importBootstrapTransactionV2(),
      annualStateSource,
      now: () => new Date().toISOString(),
      createId: (kind) => `${kind}:${crypto.randomUUID()}`,
    } satisfies Parameters<typeof createGradebookImportPersistenceServiceV4>[0];
    const response = isGradebookImportPersistenceRequestV5(payload)
      ? await createGradebookImportPersistenceServiceV5(dependencies).execute(payload)
      : isGradebookImportPersistenceRequestV4(payload)
        ? await createGradebookImportPersistenceServiceV4(dependencies).execute(payload)
        : null;
    if (response === null) return state('unavailable', 500);
    return (
      requestV5
        ? isGradebookImportPersistenceResponseV5(response)
        : isGradebookImportPersistenceResponseV4(response)
    )
      ? noStore(response)
      : requestV5
        ? noStore(
            {
              transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
              state: 'unavailable',
            },
            500,
          )
        : state('unavailable', 500);
  } catch {
    return requestV5
      ? noStore(
          {
            transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
            state: 'unavailable',
          },
          503,
        )
      : state('unavailable', 503);
  }
}

/** Central Functions wiring keeps its historical symbol; the endpoint accepts V4 and V5. */
export const handleGradebookImportPersistenceRequestV2 = handleGradebookImportPersistenceRequestV4;
