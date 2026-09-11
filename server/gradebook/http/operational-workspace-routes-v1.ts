import type {
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
  type OperationalWorkspaceNotAuthorizedV1,
  type OperationalWorkspaceUnavailableV1,
} from '../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';
import {
  isOperationalWorkspaceTransportRequestV1,
  isOperationalWorkspaceTransportResponseV1,
} from '../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import { isOperationalWorkspaceRequestV2 } from '../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { createOperationalWorkspaceServiceV1 } from '../application/operational-workspace/operational-workspace-service-v1';
import { createRelationalWorkspaceV2 } from '../application/operational-workspace/relational-workspace-v2';
import {
  createTeacherAssignmentMaintenanceV1,
  isTeacherAssignmentMaintenanceRequestV1,
} from '../application/operational-workspace/teacher-assignment-maintenance-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';
import type { D1WriteDatabaseV1 } from '../persistence/d1/write/d1-write-adapter-v1';

export const GRADEBOOK_OPERATIONAL_WORKSPACE_ROUTE_V1 = '/api/gradebook/operational-workspace';

function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Expires: '0',
      Pragma: 'no-cache',
    },
  });
}
function unavailable(status = 503): Response {
  const response: OperationalWorkspaceUnavailableV1 = {contractVersion:OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,state:'unavailable'};
  return noStoreJson(response, status);
}
function notAuthorized(status: 401 | 403): Response {
  const response: OperationalWorkspaceNotAuthorizedV1 = {contractVersion:OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,state:'not-authorized'};
  return noStoreJson(response, status);
}
function isMaintenanceCandidate(value: unknown): boolean {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, 'maintenanceVersion');
}
function newTeacherId(): TeacherId { return `teacher:${crypto.randomUUID()}` as TeacherId; }
function newTeachingAssignmentId(): TeachingAssignmentId { return `teaching-assignment:${crypto.randomUUID()}` as TeachingAssignmentId; }

export async function handleOperationalWorkspaceRequestV1(request: Request, env: RuntimeEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_OPERATIONAL_WORKSPACE_ROUTE_V1) return null;
  enforceOfficialOrigin(request, env);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);

  let authorization: ReturnType<typeof authorizeGradebookD1RuntimeV1>;
  try {
    const session = await requireAuth(request, env);
    authorization = authorizeGradebookD1RuntimeV1(session);
  } catch (cause) {
    if (cause instanceof AuthenticationError) return notAuthorized(401);
    if (cause instanceof AuthorizationError) return notAuthorized(403);
    return unavailable(500);
  }
  let payload: unknown;
  try { payload = await readBoundedJson(request, 16_384); }
  catch (cause) { return unavailable(cause instanceof HttpError ? cause.status : 400); }

  // V2 never instantiates the legacy entity/version runtime. Same authorization and origin boundary.
  if (payload !== null && typeof payload === 'object' && 'contractVersion' in payload && payload.contractVersion === 2) {
    if (!isOperationalWorkspaceRequestV2(payload)) return noStoreJson({contractVersion:2,state:'invalid-request'},400);
    const environment = env.RUNTIME_ENVIRONMENT ?? 'production';
    if (env.GRADEBOOK_STORAGE_PROVIDER !== 'postgres' ||
        !['production','local','preview'].includes(environment) ||
        (environment === 'production' && env.GRADEBOOK_PRODUCTION_ENABLED !== 'true') ||
        !env.GRADEBOOK_D1) return noStoreJson({contractVersion:2,state:'unavailable'},503);
    try {
      const response = await createRelationalWorkspaceV2(env.GRADEBOOK_D1 as D1WriteDatabaseV1).execute(payload);
      return noStoreJson(response, response.state === 'not-found' ? 404 : response.state === 'invalid-request' ? 400 : 200);
    } catch { return noStoreJson({contractVersion:2,state:'unavailable'},503); }
  }

  const maintenanceCandidate = isMaintenanceCandidate(payload);
  if (maintenanceCandidate) {
    if (!isTeacherAssignmentMaintenanceRequestV1(payload)) return unavailable(400);
  } else if (!isOperationalWorkspaceTransportRequestV1(payload)) return unavailable(400);

  try {
    const runtime = createGradebookD1RuntimeV1(env, authorization);
    if (maintenanceCandidate) {
      if (!isTeacherAssignmentMaintenanceRequestV1(payload)) return unavailable(400);
      const maintenance = createTeacherAssignmentMaintenanceV1({
        entities:runtime.persistenceUnitOfWork().entities,teachers:runtime.operationalReadModels().teachers,
        createTeacherId:newTeacherId,createTeachingAssignmentId:newTeachingAssignmentId,
      });
      return noStoreJson(await maintenance.execute(payload));
    }
    if (!isOperationalWorkspaceTransportRequestV1(payload)) return unavailable(400);
    const service = createOperationalWorkspaceServiceV1({academicYears:runtime.operationalWorkspaceAcademicYears(),readModels:runtime.operationalReadModels()});
    const response = await service.execute(payload);
    return isOperationalWorkspaceTransportResponseV1(response) ? noStoreJson(response) : unavailable(500);
  } catch (cause) {
    if (cause instanceof AuthenticationError || cause instanceof AuthorizationError) return notAuthorized(cause instanceof AuthenticationError ? 401 : 403);
    return unavailable();
  }
}
