import { requireAuth } from '../../auth/session';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
} from '../../http/security';
import { inspectGradebookImportStagingBaselineV1 } from '../persistence/d1/imports/d1-import-staging-baseline-v1';
import type { D1ReadDatabaseV1 } from '../persistence/d1/read/d1-read-adapter-v1';
import {
  authorizeGradebookD1RuntimeV1,
  GRADEBOOK_D1_ADMIN_CAPABILITY,
} from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { GradebookD1MigrationErrorV1 } from '../persistence/d1/runtime/d1-migration-runner-v1';
import {
  createGradebookD1RuntimeV1,
  GradebookD1RuntimeErrorV1,
  type GradebookD1RuntimeOptionsV1,
} from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_D1_STATUS_ROUTE = '/api/gradebook/admin/persistence/status';
export const GRADEBOOK_D1_MIGRATIONS_ROUTE = '/api/gradebook/admin/persistence/migrations';

export interface GradebookD1AdminRouteOptionsV1 {
  readonly runtime?: GradebookD1RuntimeOptionsV1;
}

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

function requireMethod(request: Request, expected: 'GET' | 'POST'): void {
  if (request.method !== expected) throw new HttpError(405, 'Method not allowed');
}

function runtimeFailure(cause: unknown): never {
  if (
    cause instanceof GradebookD1MigrationErrorV1 &&
    cause.code === 'migration-catalog-incompatible'
  ) {
    throw new HttpError(409, 'Academic schema incompatible');
  }
  if (
    cause instanceof GradebookD1MigrationErrorV1 ||
    cause instanceof GradebookD1RuntimeErrorV1
  ) {
    throw new HttpError(503, 'Academic persistence unavailable');
  }
  throw new HttpError(500, 'Academic administration failed');
}

export async function handleGradebookD1AdminRequestV1(
  request: Request,
  env: RuntimeEnv,
  options: GradebookD1AdminRouteOptionsV1 = {},
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== GRADEBOOK_D1_STATUS_ROUTE && pathname !== GRADEBOOK_D1_MIGRATIONS_ROUTE) {
    return null;
  }

  enforceOfficialOrigin(request, env);
  if (pathname === GRADEBOOK_D1_STATUS_ROUTE) {
    requireMethod(request, 'GET');
  } else {
    requireMethod(request, 'POST');
    enforceWriteOrigin(request, env);
    if (request.body !== null) throw new HttpError(400, 'Request body not allowed');
  }

  const session = await requireAuth(request, env);
  const authorization = authorizeGradebookD1RuntimeV1(session);

  try {
    const runtime = createGradebookD1RuntimeV1(env, authorization, options.runtime);
    if (pathname === GRADEBOOK_D1_STATUS_ROUTE) {
      const schema = await runtime.inspectSchema();
      const pilotAudit =
        schema.status === 'ready' &&
        schema.currentVersion === 6 &&
        schema.latestVersion === 6 &&
        schema.pendingCount === 0
          ? await inspectGradebookImportStagingBaselineV1(env.GRADEBOOK_D1 as D1ReadDatabaseV1)
          : null;
      return noStoreJson({
        version: '1.0',
        capability: GRADEBOOK_D1_ADMIN_CAPABILITY,
        environment: runtime.environment,
        schema,
        ...(pilotAudit ? { pilotAudit } : {}),
      });
    }

    const migration = await runtime.runMigrations();
    return noStoreJson({
      version: '1.0',
      capability: GRADEBOOK_D1_ADMIN_CAPABILITY,
      environment: runtime.environment,
      migration,
    });
  } catch (cause) {
    return runtimeFailure(cause);
  }
}
