import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V4,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
  inspectGradebookImportPersistenceRequestV4,
  isGradebookImportPersistenceRequestV4,
  isGradebookImportPersistenceResponseV4,
  type GradebookImportPersistenceResponseV4,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
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
import { createGradebookD1ImportAnnualStateSourceV1 } from '../persistence/d1/imports/d1-import-annual-state-source-v1';
import type { D1ReadDatabaseV1 } from '../persistence/d1/read/d1-read-adapter-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V4 = '/api/gradebook/import-persistence';

function noStore(value: GradebookImportPersistenceResponseV4, status = 200): Response {
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
  if (inspection !== 'ready' || !isGradebookImportPersistenceRequestV4(payload)) {
    return noStore(
      {
        transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
        state: 'invalid-request',
        reason: inspection === 'ready' ? 'invalid-request' : inspection,
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
    const service = createGradebookImportPersistenceServiceV4({
      unitOfWork: runtime.persistenceUnitOfWorkV2(),
      transaction: runtime.importBootstrapTransactionV2(),
      annualStateSource,
      now: () => new Date().toISOString(),
      createId: (kind) => `${kind}:${crypto.randomUUID()}`,
    });
    const response = await service.execute(payload);
    return isGradebookImportPersistenceResponseV4(response)
      ? noStore(response)
      : state('unavailable', 500);
  } catch {
    return state('unavailable', 503);
  }
}
