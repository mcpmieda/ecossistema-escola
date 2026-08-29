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
import {
  syncCommitRequestSchema,
  syncOutcomeRequestSchema,
  syncPreflightRequestSchema,
} from '../../shared/banco-notas-sync';
import type { D1BancoNotasSyncService } from './d1-sync-service';

const gradeEventsPath = '/api/banco-notas/v1/grade-events';
const contextPath = '/api/banco-notas/v1/addin/context';
const preflightPath = '/api/banco-notas/v1/addin/sync/preflight';
const commitPath = '/api/banco-notas/v1/addin/sync/commit';
const outcomePath = '/api/banco-notas/v1/addin/sync/outcome';

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
  syncService?: D1BancoNotasSyncService;
  now?: number;
  fetcher?: typeof fetch;
  verifyToken?: typeof verifyBancoNotasAddinToken;
}): Promise<Response> {
  const { request } = args;
  const url = new URL(request.url);
  const path = url.pathname;
  if (![gradeEventsPath, contextPath, preflightPath, commitPath, outcomePath].includes(path))
    throw new HttpError(404, 'Not found');
  if (path === gradeEventsPath && request.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed');
  }
  if (path === contextPath && request.method !== 'GET') {
    throw new HttpError(405, 'Method not allowed');
  }
  if (
    (path === preflightPath || path === commitPath || path === outcomePath) &&
    request.method !== 'POST'
  )
    throw new HttpError(405, 'Method not allowed');

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

  if (path === preflightPath || path === commitPath || path === outcomePath) {
    if (!args.syncService) throw new HttpError(503, 'Sync storage unavailable');
    try {
      const raw = await readBoundedJson(request);
      if (path === outcomePath) {
        const result = await args.syncService.outcome(
          syncOutcomeRequestSchema.parse(raw).requestId,
          claims.oid,
        );
        if (!result) throw new HttpError(404, 'sync_attempt_not_found');
        return Response.json(result);
      }
      return Response.json(
        path === preflightPath
          ? await args.syncService.preflight(syncPreflightRequestSchema.parse(raw), claims.oid)
          : await args.syncService.commit(syncCommitRequestSchema.parse(raw), claims.oid),
      );
    } catch (error) {
      if (error instanceof ZodError)
        throw new HttpError(400, error.issues[0]?.message ?? 'Invalid sync request');
      throw error;
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
