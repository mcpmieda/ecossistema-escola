import {
  YEAR_RESET_BODY_BYTES_V1,
  YEAR_RESET_CONTRACT_VERSION_V1,
  type YearResetFailureV1,
  type YearResetResponseV1,
} from '../../../shared/gradebook-contracts/settings/year-reset-contract-v1';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { createYearResetServiceV1 } from '../application/settings/year-reset-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import type { D1WriteDatabaseV1 } from '../persistence/d1/write/d1-write-adapter-v1';

export const YEAR_RESET_ROUTE_V1 = '/api/gradebook/year-reset';

function response(value: YearResetResponseV1, status: number): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Expires: '0',
      Pragma: 'no-cache',
    },
  });
}

function failure(state: YearResetFailureV1, status: number): Response {
  return response({ contractVersion: YEAR_RESET_CONTRACT_VERSION_V1, state }, status);
}

function statusFor(value: YearResetResponseV1): number {
  if (value.state === 'ready') return 200;
  if (value.state === 'invalid-request') return 400;
  if (value.state === 'not-authorized') return 403;
  if (value.state === 'not-found') return 404;
  if (value.state === 'preview-changed') return 409;
  return 503;
}

export function createYearResetRequestHandlerV1() {
  return async (request: Request, env: RuntimeEnv): Promise<Response | null> => {
    if (new URL(request.url).pathname !== YEAR_RESET_ROUTE_V1) return null;
    enforceOfficialOrigin(request, env);
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    enforceWriteOrigin(request, env);

    try {
      authorizeGradebookD1RuntimeV1(await requireAuth(request, env));
    } catch (cause) {
      if (cause instanceof AuthenticationError) return failure('not-authorized', 401);
      if (cause instanceof AuthorizationError) return failure('not-authorized', 403);
      return failure('unavailable', 503);
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(request, YEAR_RESET_BODY_BYTES_V1);
    } catch (cause) {
      return failure('invalid-request', cause instanceof HttpError ? cause.status : 400);
    }

    const environment = env.RUNTIME_ENVIRONMENT ?? 'production';
    if (
      env.GRADEBOOK_STORAGE_PROVIDER !== 'postgres' ||
      !['production', 'local', 'preview'].includes(environment) ||
      (environment === 'production' && env.GRADEBOOK_PRODUCTION_ENABLED !== 'true') ||
      !env.GRADEBOOK_D1
    ) {
      return failure('unavailable', 503);
    }

    try {
      const value = await createYearResetServiceV1(env.GRADEBOOK_D1 as D1WriteDatabaseV1).execute(
        payload,
      );
      if (value.state === 'ready' && value.operation === 'execute') {
        console.info(
          JSON.stringify({
            message: 'gradebook_year_reset_completed',
            year: value.year,
            deletedRows: value.deletedRows,
          }),
        );
      }
      return response(value, statusFor(value));
    } catch {
      return failure('unavailable', 503);
    }
  };
}

export const handleYearResetRequestV1 = createYearResetRequestHandlerV1();
