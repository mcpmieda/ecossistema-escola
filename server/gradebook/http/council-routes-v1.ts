import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  inspectCouncilDecisionRequestV1,
  inspectCouncilQueueRequestV1,
  inspectCouncilStudentRequestV1,
  type CouncilActorReferenceV1,
  type CouncilDecisionRequestV1,
  type CouncilQueueRequestV1,
  type CouncilStudentRequestV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import type {
  CouncilWorkspaceServerContextV1,
  CouncilWorkspaceV1,
} from '../application/council/council-workspace-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';

export const GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1 = '/api/gradebook/council-workspace';

type CouncilHttpOperationV1 = 'queue' | 'student' | 'decision';

export interface CouncilWorkspaceHttpDependenciesV1 {
  /** #328 may compose the runtime here. Returning null keeps the endpoint fail-closed. */
  createWorkspace(
    env: RuntimeEnv,
    server: CouncilWorkspaceServerContextV1,
  ): CouncilWorkspaceV1 | null;
  now?: () => Date;
}

function noStoreResponse(body: BodyInit | null, status: number, contentType?: string): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Expires: '0',
    Pragma: 'no-cache',
  });
  if (contentType) headers.set('Content-Type', contentType);
  return new Response(body, { status, headers });
}

function noStoreJson(value: unknown, status = 200): Response {
  return noStoreResponse(JSON.stringify(value), status, 'application/json; charset=utf-8');
}

function accessDenied(status: 401 | 403): Response {
  return noStoreResponse(null, status);
}

function unavailable(status = 503): Response {
  return noStoreResponse(null, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function operationFromPayload(value: unknown): CouncilHttpOperationV1 | null {
  if (!isRecord(value)) return null;
  return value.operation === 'queue' || value.operation === 'student' || value.operation === 'decision'
    ? value.operation
    : null;
}

function invalidQueue(outcome: 'invalid-request' | 'invalid-cursor'): Response {
  return noStoreJson(
    {
      contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
      outcome,
      items: [],
      nextCursor: null,
    },
    400,
  );
}

function invalidStudent(): Response {
  return noStoreJson(
    {
      contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'invalid-request',
      detail: null,
    },
    400,
  );
}

function invalidDecision(): Response {
  return noStoreJson(
    {
      contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'invalid-request',
      currentVersion: null,
    },
    400,
  );
}

export function createCouncilWorkspaceRequestHandlerV1(
  dependencies: CouncilWorkspaceHttpDependenciesV1,
): (request: Request, env: RuntimeEnv) => Promise<Response | null> {
  return async (request, env) => {
    if (new URL(request.url).pathname !== GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1) return null;

    enforceOfficialOrigin(request, env);
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    enforceWriteOrigin(request, env);

    let session: Awaited<ReturnType<typeof requireAuth>>;
    try {
      session = await requireAuth(request, env);
      authorizeGradebookD1RuntimeV1(session);
    } catch (cause) {
      if (cause instanceof AuthenticationError) return accessDenied(401);
      if (cause instanceof AuthorizationError) return accessDenied(403);
      return unavailable(500);
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(request, 16_384);
    } catch (cause) {
      return unavailable(cause instanceof HttpError ? cause.status : 400);
    }

    const operation = operationFromPayload(payload);
    if (operation === null) return unavailable(400);

    if (operation === 'queue') {
      const readiness = inspectCouncilQueueRequestV1(payload);
      if (readiness !== 'ready') return invalidQueue(readiness);
    } else if (operation === 'student') {
      if (inspectCouncilStudentRequestV1(payload) !== 'ready') return invalidStudent();
    } else if (inspectCouncilDecisionRequestV1(payload) !== 'ready') {
      return invalidDecision();
    }

    // The academic production runtime remains explicitly closed in this front and is wired only by #328.
    if (env.RUNTIME_ENVIRONMENT === 'production') return unavailable();

    const now = dependencies.now ?? (() => new Date());
    const server: CouncilWorkspaceServerContextV1 = {
      isAuthorized: () => true,
      decisionIdentity: () => ({
        actorReference: session.oid as CouncilActorReferenceV1,
        decidedAt: now().toISOString(),
      }),
    };
    const workspace = dependencies.createWorkspace(env, server);
    if (workspace === null) return unavailable();

    try {
      if (operation === 'queue') {
        return noStoreJson(await workspace.queue(payload as CouncilQueueRequestV1));
      }
      if (operation === 'student') {
        return noStoreJson(await workspace.student(payload as CouncilStudentRequestV1));
      }
      return noStoreJson(await workspace.decide(payload as CouncilDecisionRequestV1));
    } catch {
      return unavailable();
    }
  };
}

/**
 * Safe default until #328 composes an academic source/runtime. Presence of this file alone never
 * activates Council data access.
 */
export const handleCouncilWorkspaceRequestV1 = createCouncilWorkspaceRequestHandlerV1({
  createWorkspace: () => null,
});
