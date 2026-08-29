import { ZodError } from 'zod';
import {
  addinContextQuerySchema,
  addinContextResponseSchema,
  type BancoNotasAddinContextRepository,
} from '../../shared/banco-notas-addin-context';
import { gradeEventInputSchema, type GradeEventStore } from '../../shared/banco-notas-grade-events';
import type { RuntimeEnv } from '../env';
import {
  BearerAuthenticationError,
  BearerAuthorizationError,
  BearerConfigurationError,
  BearerVerificationUnavailableError,
  verifyBancoNotasAddinToken,
} from '../auth/entra-access-token';
import { HttpError, readBoundedJson } from '../http/security';
import { BancoNotasAddinForbiddenError } from './d1-addin-authorizer';
import { routeGradeEventsApi } from './grade-events-api';

const gradeEventsPath = '/api/banco-notas/v1/grade-events';
const contextPath = '/api/banco-notas/v1/addin/context';

export type BancoNotasAddinModelAuthorizer = {
  assertTeacherModelOwner(input: { teacherModelId: string; entraObjectId: string }): Promise<void>;
};

function identityHttpError(error: unknown): HttpError | null {
  if (
    error instanceof BearerAuthenticationError ||
    error instanceof BearerAuthorizationError ||
    error instanceof BearerConfigurationError ||
    error instanceof BearerVerificationUnavailableError ||
    error instanceof BancoNotasAddinForbiddenError
  ) {
    return new HttpError(error.status, error.message);
  }
  return null;
}

export async function routeBancoNotasAddinApi(args: {
  request: Request;
  env: RuntimeEnv;
  store: GradeEventStore;
  authorizer: BancoNotasAddinModelAuthorizer;
  contextRepository?: BancoNotasAddinContextRepository;
  now?: number;
  fetcher?: typeof fetch;
  verifyToken?: typeof verifyBancoNotasAddinToken;
}): Promise<Response> {
  const { request } = args;
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== gradeEventsPath && path !== contextPath) throw new HttpError(404, 'Not found');
  if (path === gradeEventsPath && request.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed');
  }
  if (path === contextPath && request.method !== 'GET') {
    throw new HttpError(405, 'Method not allowed');
  }

  let claims: Awaited<ReturnType<typeof verifyBancoNotasAddinToken>>;
  try {
    claims = await (args.verifyToken ?? verifyBancoNotasAddinToken)({
      authorization: request.headers.get('Authorization'),
      env: args.env,
      now: args.now,
      fetcher: args.fetcher,
    });
  } catch (error) {
    throw identityHttpError(error) ?? error;
  }

  if (path === contextPath) {
    if (!args.contextRepository) throw new HttpError(503, 'Add-in context storage unavailable');
    let query: ReturnType<typeof addinContextQuerySchema.parse>;
    try {
      query = addinContextQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpError(400, error.issues[0]?.message ?? 'Invalid workbook context');
      }
      throw error;
    }
    try {
      const result = await args.contextRepository.context(query, claims.oid);
      if (!result) throw new HttpError(404, 'addin_workbook_not_recognized');
      return Response.json(addinContextResponseSchema.parse(result));
    } catch (error) {
      throw identityHttpError(error) ?? error;
    }
  }

  let input: ReturnType<typeof gradeEventInputSchema.parse>;
  try {
    input = gradeEventInputSchema.parse(await readBoundedJson(request.clone()));
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message ?? 'Invalid grade event');
    }
    throw error;
  }

  if (input.source.kind !== 'excel-addin') {
    throw new HttpError(403, 'grade_event_source_not_excel_addin');
  }

  try {
    await args.authorizer.assertTeacherModelOwner({
      teacherModelId: input.teacherModelId,
      entraObjectId: claims.oid,
    });
  } catch (error) {
    throw identityHttpError(error) ?? error;
  }

  return routeGradeEventsApi({ request, store: args.store });
}
