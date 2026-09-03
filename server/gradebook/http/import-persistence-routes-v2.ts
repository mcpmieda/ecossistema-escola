import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V2,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V2,
  inspectGradebookImportPersistenceRequestV2,
  isGradebookImportPersistenceRequestV2,
  isGradebookImportPersistenceResponseV2,
  type GradebookImportPersistenceResponseV2,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { createGradebookImportPersistenceServiceV2 } from '../application/import/import-persistence-service-v2';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2 = '/api/gradebook/import-persistence';

function noStore(value: GradebookImportPersistenceResponseV2, status = 200): Response {
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
    GradebookImportPersistenceResponseV2,
    { state: 'not-authorized' | 'unavailable' }
  >['state'],
  status: number,
): Response {
  return noStore(
    { transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V2, state: value },
    status,
  );
}

export async function handleGradebookImportPersistenceRequestV2(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2) return null;
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
    payload = await readBoundedJson(request, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V2.maxBodyBytes);
  } catch (cause) {
    const reason =
      cause instanceof HttpError && cause.status === 413 ? 'payload-too-large' : 'invalid-request';
    return noStore(
      { transportVersion: 2, state: 'invalid-request', reason },
      cause instanceof HttpError ? cause.status : 400,
    );
  }
  const inspection = inspectGradebookImportPersistenceRequestV2(payload);
  if (inspection !== 'ready' || !isGradebookImportPersistenceRequestV2(payload)) {
    return noStore(
      {
        transportVersion: 2,
        state: 'invalid-request',
        reason: inspection === 'ready' ? 'invalid-request' : inspection,
      },
      400,
    );
  }

  try {
    const runtime = createGradebookD1RuntimeV1(env, authorization);
    const service = createGradebookImportPersistenceServiceV2({
      unitOfWork: runtime.persistenceUnitOfWorkV2(),
      transaction: runtime.importBootstrapTransactionV2(),
      now: () => new Date().toISOString(),
      createId: (kind) => `${kind}:${crypto.randomUUID()}`,
    });
    const response = await service.execute(payload);
    return isGradebookImportPersistenceResponseV2(response)
      ? noStore(response)
      : state('unavailable', 500);
  } catch {
    return state('unavailable', 503);
  }
}
