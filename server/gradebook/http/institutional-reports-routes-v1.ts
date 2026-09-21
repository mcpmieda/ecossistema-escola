import {
  INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
  inspectInstitutionalReportRequestV1,
  type InstitutionalReportResponseV1,
} from '../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';
import {
  RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
  relationalInstitutionalReportRequestSchemaV2,
  type RelationalInstitutionalReportResponseV2,
} from '../../../shared/gradebook-contracts/reports/relational-institutional-reports-v2';
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
  createRelationalInstitutionalReportsServiceV2,
  type RelationalInstitutionalReportsServiceV2,
} from '../application/reports/relational-institutional-reports-v2';
import { createPerformanceAnalysisV3 } from '../application/read-models/performance/performance-analysis-v3';
import { createPerformanceTermComparisonV4 } from '../application/read-models/performance/performance-term-comparison-v4';
import { createRelationalCouncilV3 } from '../application/council/relational-council-v3';
import { createRelationalBulletinServiceV2 } from '../application/bulletins/relational-bulletin-v2';
import {
  authorizeGradebookRuntimeV1,
  type GradebookRuntimeAuthorizationV1,
} from '../authorization-v1';
import type { GradebookPostgresDatabaseV1 } from '../persistence/postgres/postgres-database-v1';
import { createRelationalBulletinSnapshotRepositoryV2 } from '../persistence/postgres/relational-bulletin-snapshot-v2';
import { createRelationalImportDiagnosticsReadV2 } from '../persistence/postgres/relational-import-diagnostics-read-v2';

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
      report: null,
      hardStop: null,
    } satisfies InstitutionalReportResponseV1,
    status,
  );
}

function unavailable(status = 503): Response {
  return noStoreJson(
    {
      contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
      state: 'unavailable',
      report: null,
      hardStop: null,
    } satisfies InstitutionalReportResponseV1,
    status,
  );
}

export interface InstitutionalReportsRequestHandlerDependenciesV1 {
  authorizeRequest(
    request: Request,
    env: RuntimeEnv,
  ): Promise<GradebookRuntimeAuthorizationV1 | {
    readonly runtimeAuthorization: GradebookRuntimeAuthorizationV1;
    readonly actorOid: string;
  }>;
  createRelationalService?(
    env: RuntimeEnv,
    actorOid: string,
  ): RelationalInstitutionalReportsServiceV2;
}

const defaultDependencies: InstitutionalReportsRequestHandlerDependenciesV1 = {
  async authorizeRequest(request, env) {
    const session = await requireAuth(request, env);
    return {
      runtimeAuthorization: authorizeGradebookRuntimeV1(session),
      actorOid: session.oid,
    };
  },
  createRelationalService(env, actorOid) {
    // Reached only with the PostgreSQL provider: under D1 the handler fails closed before
    // building this service, so the binding is always the official PostgreSQL database.
    const database = env.GRADEBOOK_DATABASE as GradebookPostgresDatabaseV1;
    const bulletins = createRelationalBulletinServiceV2({
      database,
      snapshots: createRelationalBulletinSnapshotRepositoryV2(database),
    });
    return createRelationalInstitutionalReportsServiceV2({
      performanceAnalysis: createPerformanceAnalysisV3(database),
      performanceComparison: createPerformanceTermComparisonV4(database),
      council: createRelationalCouncilV3(database, actorOid),
      bulletins,
      diagnostics: createRelationalImportDiagnosticsReadV2(database),
    });
  },
};

function relationalResponseStatus(response: RelationalInstitutionalReportResponseV2): number {
  if (response.state === 'invalid-request') return 400;
  if (response.state === 'not-authorized') return 403;
  if (response.state === 'not-found') return 404;
  if (response.state === 'scope-too-large') return 422;
  if (response.state === 'unavailable') return 503;
  return 200;
}

function relationalUnavailable(
  operation: RelationalInstitutionalReportResponseV2['operation'],
): Response {
  return noStoreJson({
    contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
    operation,
    state: 'unavailable',
  } satisfies RelationalInstitutionalReportResponseV2, 503);
}

export function createInstitutionalReportsRequestHandlerV1(
  dependencies: InstitutionalReportsRequestHandlerDependenciesV1 = defaultDependencies,
): (request: Request, env: RuntimeEnv) => Promise<Response | null> {
  return async (request, env) => {
    if (new URL(request.url).pathname !== GRADEBOOK_INSTITUTIONAL_REPORTS_ROUTE_V1) return null;

    enforceOfficialOrigin(request, env);
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    enforceWriteOrigin(request, env);

    let actorOid = 'institutional-reports-read-only';
    try {
      const authorized = await dependencies.authorizeRequest(request, env);
      if ('runtimeAuthorization' in authorized) {
        actorOid = authorized.actorOid;
      }
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

    if (
      payload !== null && typeof payload === 'object' &&
      'contractVersion' in payload &&
      payload.contractVersion === RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2
    ) {
      const parsed = relationalInstitutionalReportRequestSchemaV2.safeParse(payload);
      const operation = 'operation' in payload &&
        ['catalog', 'performance', 'council', 'audit', 'bulletin-history', 'bulletin-reprint']
          .includes(String(payload.operation))
        ? payload.operation as RelationalInstitutionalReportResponseV2['operation']
        : 'catalog';
      if (!parsed.success) {
        return noStoreJson({
          contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
          operation,
          state: 'invalid-request',
        } satisfies RelationalInstitutionalReportResponseV2, 400);
      }
      const environment = env.RUNTIME_ENVIRONMENT ?? 'production';
      if (
        env.GRADEBOOK_STORAGE_PROVIDER !== 'postgres' ||
        !['production', 'local', 'preview'].includes(environment) ||
        (environment === 'production' && env.GRADEBOOK_PRODUCTION_ENABLED !== 'true') ||
        !env.GRADEBOOK_DATABASE ||
        dependencies.createRelationalService === undefined
      ) {
        return relationalUnavailable(parsed.data.operation);
      }
      try {
        const service = dependencies.createRelationalService(env, actorOid);
        const response = await service.execute(parsed.data, { oid: actorOid });
        return noStoreJson(response, relationalResponseStatus(response));
      } catch {
        return relationalUnavailable(parsed.data.operation);
      }
    }
    if (inspectInstitutionalReportRequestV1(payload) !== 'ready') return invalidRequest();

    return unavailable(410);
  };
}

export const handleInstitutionalReportsRequestV1 = createInstitutionalReportsRequestHandlerV1();
