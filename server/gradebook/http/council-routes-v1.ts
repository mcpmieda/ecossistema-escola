import {
  COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
  COUNCIL_INSTITUTIONAL_OPERATIONS_V2,
  inspectCouncilInstitutionalRequestV2,
  type CouncilClosureCloseRequestV2,
  type CouncilClosureHistoryRequestV2,
  type CouncilClosureReviewRequestV2,
  type CouncilInstitutionalOperationV2,
  type CouncilTieBreakRequestV2,
  type CouncilVoteRequestV2,
} from '../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
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
  CouncilInstitutionalServerContextV2,
  CouncilInstitutionalWorkspaceV2,
} from '../application/council/council-institutional-workspace-v2';
import type {
  CouncilWorkspaceServerContextV1,
  CouncilWorkspaceV1,
} from '../application/council/council-workspace-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';

export const GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1 = '/api/gradebook/council-workspace';

type CouncilHttpOperationV1 =
  | 'queue'
  | 'student'
  | 'decision'
  | CouncilInstitutionalOperationV2;

export interface CouncilWorkspaceHttpDependenciesV1 {
  /** #328 composes the V1 runtime. Returning null keeps the endpoint fail-closed. */
  createWorkspace(
    env: RuntimeEnv,
    server: CouncilWorkspaceServerContextV1,
  ): CouncilWorkspaceV1 | null;
  /** #343 owns central composition. When present, V1 decisions are guarded by V2 closure state. */
  createInstitutionalWorkspace?(
    env: RuntimeEnv,
    server: CouncilInstitutionalServerContextV2,
  ): CouncilInstitutionalWorkspaceV2 | null;
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
  if (value.operation === 'queue' || value.operation === 'student' || value.operation === 'decision') {
    return value.operation;
  }
  return (
    COUNCIL_INSTITUTIONAL_OPERATIONS_V2.find((operation) => operation === value.operation) ?? null
  );
}

function isInstitutionalOperation(
  operation: CouncilHttpOperationV1,
): operation is CouncilInstitutionalOperationV2 {
  return COUNCIL_INSTITUTIONAL_OPERATIONS_V2.some((candidate) => candidate === operation);
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

function invalidInstitutional(): Response {
  return noStoreJson(
    {
      contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
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
    } else if (operation === 'decision') {
      if (inspectCouncilDecisionRequestV1(payload) !== 'ready') return invalidDecision();
    } else if (inspectCouncilInstitutionalRequestV2(payload) !== 'ready') {
      return invalidInstitutional();
    }

    const now = dependencies.now ?? (() => new Date());
    const server: CouncilInstitutionalServerContextV2 = {
      isAuthorized: () => true,
      decisionIdentity: () => ({
        actorReference: session.oid as CouncilActorReferenceV1,
        decidedAt: now().toISOString(),
      }),
      institutionalIdentity: () => ({
        actorReference: session.oid as CouncilActorReferenceV1,
        occurredAt: now().toISOString(),
      }),
    };

    try {
      if (operation === 'queue' || operation === 'student') {
        const workspace = dependencies.createWorkspace(env, server);
        if (workspace === null) return unavailable();
        if (operation === 'queue') {
          return noStoreJson(await workspace.queue(payload as CouncilQueueRequestV1));
        }
        return noStoreJson(await workspace.student(payload as CouncilStudentRequestV1));
      }

      if (operation === 'decision') {
        if (dependencies.createInstitutionalWorkspace !== undefined) {
          const institutional = dependencies.createInstitutionalWorkspace(env, server);
          if (institutional === null) return unavailable();
          return noStoreJson(await institutional.decide(payload as CouncilDecisionRequestV1));
        }
        const workspace = dependencies.createWorkspace(env, server);
        if (workspace === null) return unavailable();
        return noStoreJson(await workspace.decide(payload as CouncilDecisionRequestV1));
      }

      if (!isInstitutionalOperation(operation) || dependencies.createInstitutionalWorkspace === undefined) {
        return unavailable();
      }
      const institutional = dependencies.createInstitutionalWorkspace(env, server);
      if (institutional === null) return unavailable();
      switch (operation) {
        case 'closure-review':
          return noStoreJson(
            await institutional.review(payload as CouncilClosureReviewRequestV2),
          );
        case 'vote':
          return noStoreJson(await institutional.vote(payload as CouncilVoteRequestV2));
        case 'tie-break':
          return noStoreJson(await institutional.resolveTie(payload as CouncilTieBreakRequestV2));
        case 'closure-close':
          return noStoreJson(await institutional.close(payload as CouncilClosureCloseRequestV2));
        case 'closure-history':
          return noStoreJson(
            await institutional.history(payload as CouncilClosureHistoryRequestV2),
          );
      }
    } catch {
      return unavailable();
    }
  };
}

/**
 * Safe default until central integration composes an academic source/runtime. Presence of this file
 * alone never activates Council data access or institutional closure.
 */
export const handleCouncilWorkspaceRequestV1 = createCouncilWorkspaceRequestHandlerV1({
  createWorkspace: () => null,
});
