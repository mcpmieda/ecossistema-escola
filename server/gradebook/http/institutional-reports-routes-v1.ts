import {
  INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
  inspectInstitutionalReportRequestV1,
  type InstitutionalReportRequestV1,
  type InstitutionalReportResponseV1,
} from '../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import {
  createInstitutionalReportsServiceV1,
  type InstitutionalReportsServiceV1,
} from '../application/reports/institutional-reports-service-v1';
import {
  authorizeGradebookD1RuntimeV1,
  type GradebookD1RuntimeAuthorizationV1,
} from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_INSTITUTIONAL_REPORTS_ROUTE_V1 = '/api/gradebook/reports';

function noStoreJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Expires: '0',
      Pragma: 'no-cache',
    },
  });
}

function invalidRequest(): Response {
  return noStoreJson(
    {
      contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
      state: 'invalid-request',
      report: null,
      hardStop: null,
    } satisfies InstitutionalReportResponseV1,
    400,
  );
}

function notAuthorized(status: 401 | 403): Response {
  return noStoreJson(
    {
      contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
      state: 'not-authorized',
      family: 'audit',
      report: null,
      hardStop: null,
    } satisfies InstitutionalReportResponseV1,
    status,
  );
}

function unavailable(): Response {
  return noStoreJson(
    {
      contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
      state: 'unavailable',
      family: 'audit',
      report: null,
      hardStop: null,
    } satisfies InstitutionalReportResponseV1,
    503,
  );
}

export interface InstitutionalReportsRequestHandlerDependenciesV1 {
  authorizeRequest(
    request: Request,
    env: RuntimeEnv,
  ): Promise<GradebookD1RuntimeAuthorizationV1>;
  createService(
    env: RuntimeEnv,
    authorization: GradebookD1RuntimeAuthorizationV1,
  ): InstitutionalReportsServiceV1;
}

const defaultDependencies: InstitutionalReportsRequestHandlerDependenciesV1 = {
  async authorizeRequest(request, env) {
    const session = await requireAuth(request, env);
    return authorizeGradebookD1RuntimeV1(session);
  },
  createService(env, authorization) {
    const runtime = createGradebookD1RuntimeV1(env, authorization);
    return createInstitutionalReportsServiceV1({
      performance: runtime.classPerformanceReadModel(),
      council: runtime.councilWorkspace({
        decisionIdentity() {
          throw new Error('institutional-reports-read-only');
        },
      }),
      audit: runtime.auditWorkspace({
        resolutionIdentity() {
          throw new Error('institutional-reports-read-only');
        },
      }),
    });
  },
};

function responseStatus(response: InstitutionalReportResponseV1): number {
  if (response.state === 'invalid-request') return 400;
  if (response.state === 'not-authorized') return 403;
  if (response.state === 'unavailable') return 503;
  return 200;
}

export function createInstitutionalReportsRequestHandlerV1(
  dependencies: InstitutionalReportsRequestHandlerDependenciesV1 = defaultDependencies,
): (request: Request, env: RuntimeEnv) => Promise<Response | null> {
  return async (request, env) => {
    if (new URL(request.url).pathname !== GRADEBOOK_INSTITUTIONAL_REPORTS_ROUTE_V1) return null;

    enforceOfficialOrigin(request, env);
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    enforceWriteOrigin(request, env);

    let authorization: GradebookD1RuntimeAuthorizationV1;
    try {
      authorization = await dependencies.authorizeRequest(request, env);
    } catch (cause) {
      if (cause instanceof AuthenticationError) return notAuthorized(401);
      if (cause instanceof AuthorizationError) return notAuthorized(403);
      return unavailable();
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(request, 65_536);
    } catch {
      return invalidRequest();
    }
    if (inspectInstitutionalReportRequestV1(payload) !== 'ready') return invalidRequest();

    let service: InstitutionalReportsServiceV1;
    try {
      service = dependencies.createService(env, authorization);
    } catch {
      return unavailable();
    }

    const response = await service.execute(payload as InstitutionalReportRequestV1);
    return noStoreJson(response, responseStatus(response));
  };
}

export const handleInstitutionalReportsRequestV1 = createInstitutionalReportsRequestHandlerV1();
