import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6,
  isGradebookImportPersistenceRequestV6,
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
import { GradebookImportStagingServiceV1 } from '../application/import/import-staging-service-v1';
import { inspectGradebookImportStagingBaselineV1 } from '../persistence/d1/imports/d1-import-staging-baseline-v1';
import { GradebookD1ImportStagingRepositoryV1 } from '../persistence/d1/imports/d1-import-staging-repository-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../persistence/d1/imports/d1-import-annual-state-source-v1';
import type { D1WriteDatabaseV1 } from '../persistence/d1/write/d1-write-adapter-v1';
import type { D1ReadDatabaseV1 } from '../persistence/d1/read/d1-read-adapter-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  createGradebookD1RuntimeV1,
  type GradebookD1RuntimeOptionsV1,
} from '../persistence/d1/runtime/d1-runtime-v1';
import { GradebookD1ImportStagingPromotionV1 } from '../persistence/d1/transaction/d1-import-staging-promotion-v1';

export const GRADEBOOK_IMPORT_STAGING_ROUTE_V1 = '/api/gradebook/import-staging';

export interface GradebookImportStagingRouteOptionsV1 {
  readonly runtime?: GradebookD1RuntimeOptionsV1;
}

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

function action(url: URL): 'initialize' | 'begin' | 'prepare' | 'finalize' | null {
  const value = url.searchParams.get('action');
  return value === 'initialize' || value === 'begin' || value === 'prepare' || value === 'finalize'
    ? value
    : null;
}

function nonNegativeInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function initializeStaging(
  runtime: ReturnType<typeof createGradebookD1RuntimeV1>,
  database: D1WriteDatabaseV1,
): Promise<Response> {
  const initial = await runtime.inspectSchema();
  if (initial.status === 'pending') {
    // This operational fix is authorized only for the known 5 -> 6 staging migration. Any other
    // schema gap remains a hard stop instead of silently applying a wider migration set.
    if (
      initial.currentVersion !== 5 ||
      initial.latestVersion !== 6 ||
      initial.appliedCount !== 5 ||
      initial.pendingCount !== 1
    ) {
      return noStore(
        {
          state: 'schema-review-required',
          schema: {
            currentVersion: initial.currentVersion,
            latestVersion: initial.latestVersion,
            pendingCount: initial.pendingCount,
          },
        },
        409,
      );
    }
    const migrated = await runtime.runMigrations();
    if (
      migrated.result !== 'applied' ||
      migrated.migrationsApplied !== 1 ||
      migrated.status !== 'ready' ||
      migrated.currentVersion !== 6 ||
      migrated.latestVersion !== 6 ||
      migrated.pendingCount !== 0
    ) {
      return noStore({ state: 'unavailable' }, 503);
    }
  } else if (
    initial.currentVersion !== 6 ||
    initial.latestVersion !== 6 ||
    initial.pendingCount !== 0
  ) {
    return noStore(
      {
        state: 'schema-review-required',
        schema: {
          currentVersion: initial.currentVersion,
          latestVersion: initial.latestVersion,
          pendingCount: initial.pendingCount,
        },
      },
      409,
    );
  }

  const baseline = await inspectGradebookImportStagingBaselineV1(database);
  if (baseline.requiresReview) {
    return noStore(
      {
        state: 'baseline-review-required',
        schemaVersion: 6,
        counts: baseline.counts,
      },
      409,
    );
  }
  return noStore({ state: 'ready', schemaVersion: 6 });
}

export async function handleGradebookImportStagingRequestV1(
  request: Request,
  env: RuntimeEnv,
  options: GradebookImportStagingRouteOptionsV1 = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== GRADEBOOK_IMPORT_STAGING_ROUTE_V1) return null;
  enforceOfficialOrigin(request, env);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);

  let authorization: ReturnType<typeof authorizeGradebookD1RuntimeV1>;
  try {
    authorization = authorizeGradebookD1RuntimeV1(await requireAuth(request, env));
  } catch (cause) {
    if (cause instanceof AuthenticationError) return noStore({ state: 'not-authorized' }, 401);
    if (cause instanceof AuthorizationError) return noStore({ state: 'not-authorized' }, 403);
    return noStore({ state: 'unavailable' }, 500);
  }

  const selectedAction = action(url);
  if (!selectedAction) return noStore({ state: 'invalid-request' }, 400);

  try {
    const runtime = createGradebookD1RuntimeV1(env, authorization, options.runtime);
    const database = env.GRADEBOOK_D1 as D1WriteDatabaseV1;

    if (selectedAction === 'initialize') {
      if (request.body !== null) return noStore({ state: 'invalid-request' }, 400);
      return initializeStaging(runtime, database);
    }

    const repository = new GradebookD1ImportStagingRepositoryV1(database);
    if (selectedAction === 'finalize') {
      const sessionId = url.searchParams.get('session');
      if (!sessionId) return noStore({ state: 'invalid-request' }, 400);
      const session = await repository.getSession(sessionId);
      if (!session) return noStore({ state: 'invalid-session' }, 404);
      if (session.state === 'preparing' && Date.parse(session.expiresAt) <= Date.now()) {
        return noStore({ state: 'expired' }, 409);
      }
      const response = await new GradebookD1ImportStagingPromotionV1(database).finalize(session);
      return noStore(response, response.state === 'unavailable' ? 503 : 200);
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(request, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxBodyBytes);
    } catch (cause) {
      return noStore(
        { state: 'invalid-request' },
        cause instanceof HttpError ? cause.status : 400,
      );
    }
    if (!isGradebookImportPersistenceRequestV6(payload)) {
      return noStore({ state: 'invalid-request' }, 400);
    }

    const annualStateSource = createGradebookD1ImportAnnualStateSourceV1(
      env.GRADEBOOK_D1 as D1ReadDatabaseV1,
    );
    const service = new GradebookImportStagingServiceV1(
      repository,
      runtime.persistenceUnitOfWorkV2(),
      annualStateSource,
    );
    if (selectedAction === 'begin') {
      return noStore(await service.begin(payload));
    }

    const sessionId = url.searchParams.get('session');
    const chunkIndex = nonNegativeInteger(url.searchParams.get('chunk'));
    if (!sessionId || chunkIndex === null) return noStore({ state: 'invalid-request' }, 400);
    const response = await service.prepare(sessionId, chunkIndex, payload);
    const status =
      response.state === 'conflict' || response.state === 'expired'
        ? 409
        : response.state === 'invalid-session'
          ? 404
          : response.state === 'rejected'
            ? 422
            : 200;
    return noStore(response, status);
  } catch {
    return noStore({ state: 'unavailable' }, 503);
  }
}
