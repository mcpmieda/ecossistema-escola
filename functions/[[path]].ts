import type { RuntimeEnv } from '../server/env';
import { validateEnv } from '../server/env';
import {
  AUTH_COOKIE,
  SESSION_COOKIE,
  requireAuth,
  AuthenticationError,
} from '../server/auth/session';
import {
  authorizationUrl,
  exchangeCode,
  newAuthTransaction,
  verifyIdToken,
} from '../server/auth/oidc';
import { clearCookie, readCookie, secureCookie } from '../server/auth/cookies';
import { seal, unseal } from '../server/auth/sealed';
import { rolesForGroups, AuthorizationError } from '../server/auth/roles';
import { capabilitiesForRoles, requireCapability } from '../server/auth/capabilities';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  withSecurityHeaders,
} from '../server/http/security';
import { sharePointHealth } from '../server/graph/sharepoint';
import { handleAuditWorkspaceRequestV1 } from '../server/gradebook/http/audit-workspace-routes-v1';
import { handleBulletinRequestV1 } from '../server/gradebook/http/bulletin-routes-v1';
import {
  createCouncilWorkspaceRequestHandlerV1,
  GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1,
} from '../server/gradebook/http/council-routes-v1';
import { handleGradebookD1AdminRequestV1 } from '../server/gradebook/http/d1-admin-routes-v1';
import { handleInstitutionalReportsRequestV1 } from '../server/gradebook/http/institutional-reports-routes-v1';
import { handleGradebookImportPersistenceRequestV2 } from '../server/gradebook/http/import-persistence-routes-v2';
import { handleOperationalWorkspaceRequestV1 } from '../server/gradebook/http/operational-workspace-routes-v1';
import { handlePerformanceRequestV1 } from '../server/gradebook/http/performance-routes-v1';
import { authorizeGradebookD1RuntimeV1 } from '../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import { getPlatformSnapshot } from '../server/platform/snapshot';

type Context = EventContext<RuntimeEnv, string, unknown>;

type StoredAuthTransaction = {
  state: string;
  nonce: string;
  verifier: string;
  exp: number;
};

type AuthTransactionEnvelope = {
  transactions: StoredAuthTransaction[];
};

type AuthFailureCategory =
  | 'provider_rejected'
  | 'invalid_transaction'
  | 'token_exchange_failed'
  | 'token_validation_failed'
  | 'institutional_role_missing';

const MAX_AUTH_TRANSACTIONS = 4;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function method(request: Request, allowed: string[]): void {
  if (!allowed.includes(request.method)) throw new HttpError(405, 'Method not allowed');
}

function isStoredAuthTransaction(value: unknown): value is StoredAuthTransaction {
  if (!value || typeof value !== 'object') return false;
  const transaction = value as Record<string, unknown>;
  return (
    typeof transaction.state === 'string' &&
    typeof transaction.nonce === 'string' &&
    typeof transaction.verifier === 'string' &&
    typeof transaction.exp === 'number'
  );
}

async function readAuthTransactions(
  request: Request,
  secret: string,
): Promise<StoredAuthTransaction[]> {
  const authCookie = readCookie(request, AUTH_COOKIE);
  if (!authCookie) return [];
  const value = await unseal<unknown>(authCookie, secret);
  if (!value || typeof value !== 'object') return [];
  const candidate = value as { transactions?: unknown };
  if (Array.isArray(candidate.transactions)) {
    return candidate.transactions.filter(isStoredAuthTransaction);
  }
  return isStoredAuthTransaction(value) ? [value] : [];
}

async function temporaryAuthCookie(
  transactions: StoredAuthTransaction[],
  secret: string,
): Promise<string> {
  const live = transactions
    .filter((transaction) => transaction.exp > Math.floor(Date.now() / 1000))
    .slice(-MAX_AUTH_TRANSACTIONS);
  if (live.length === 0) return clearCookie(AUTH_COOKIE);
  const value = await seal({ transactions: live } satisfies AuthTransactionEnvelope, secret);
  return secureCookie(AUTH_COOKIE, value, { maxAge: 600 });
}

function authFailureResponse({
  env,
  correlationId,
  category,
  stage,
  status,
  cause,
  authCookie,
}: {
  env: RuntimeEnv;
  correlationId: string;
  category: AuthFailureCategory;
  stage: string;
  status: number;
  cause: string;
  authCookie: string;
}): Response {
  const log = JSON.stringify({
    message: 'authentication_failed',
    category,
    stage,
    cause,
    status,
    correlationId,
  });
  if (status >= 500) console.error(log);
  else console.warn(log);

  const location = new URL(env.OFFICIAL_ORIGIN);
  location.searchParams.set('authError', '1');
  location.searchParams.set('correlationId', correlationId);
  const headers = new Headers({ Location: location.toString() });
  headers.append('Set-Cookie', authCookie);
  return new Response(null, { status: 303, headers });
}

async function handleComposedCouncilWorkspaceRequestV1(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1) return null;

  let authorization: ReturnType<typeof authorizeGradebookD1RuntimeV1> | null = null;
  try {
    const session = await requireAuth(request, env);
    authorization = authorizeGradebookD1RuntimeV1(session);
  } catch {
    // The dedicated Council handler below owns the opaque 401/403 response.
    authorization = null;
  }

  const handler = createCouncilWorkspaceRequestHandlerV1({
    createWorkspace(runtimeEnv, server) {
      if (authorization === null) return null;
      return createGradebookD1RuntimeV1(runtimeEnv, authorization).councilWorkspace(server);
    },
    createInstitutionalWorkspace(runtimeEnv, server) {
      if (authorization === null) return null;
      return createGradebookD1RuntimeV1(runtimeEnv, authorization).councilInstitutionalWorkspace(
        server,
      );
    },
  });
  return handler(request, env);
}

async function route(context: Context, correlationId: string): Promise<Response> {
  const env = validateEnv(context.env);
  const request = context.request;
  const url = new URL(request.url);
  enforceOfficialOrigin(request, env);

  if (url.pathname === '/api/health') {
    method(request, ['GET']);
    return json({ status: 'ok', service: 'ecossistema-escola', version: '1.0.0' });
  }

  if (url.pathname === '/auth/login') {
    method(request, ['GET']);
    const transaction = await newAuthTransaction();
    const existing = await readAuthTransactions(request, env.SESSION_SECRET);
    const cookie = await seal(
      {
        transactions: [
          ...existing.filter((item) => item.exp > Math.floor(Date.now() / 1000)),
          {
            state: transaction.state,
            nonce: transaction.nonce,
            verifier: transaction.verifier,
            exp: transaction.exp,
          },
        ].slice(-MAX_AUTH_TRANSACTIONS),
      } satisfies AuthTransactionEnvelope,
      env.SESSION_SECRET,
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizationUrl(env, transaction),
        'Set-Cookie': secureCookie(AUTH_COOKIE, cookie, { maxAge: 600 }),
      },
    });
  }

  if (url.pathname === '/auth/callback') {
    method(request, ['GET']);
    const transactions = await readAuthTransactions(request, env.SESSION_SECRET);
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const now = Math.floor(Date.now() / 1000);
    const transaction = state ? transactions.find((item) => item.state === state) : undefined;
    const remainingTransactions = transactions.filter(
      (item) => item.state !== state && item.exp > now,
    );
    const remainingAuthCookie = await temporaryAuthCookie(
      remainingTransactions,
      env.SESSION_SECRET,
    );

    if (error) {
      return authFailureResponse({
        env,
        correlationId,
        category: 'provider_rejected',
        stage: 'authorization_callback',
        status: 401,
        cause: 'identity_provider_returned_error',
        authCookie: remainingAuthCookie,
      });
    }
    if (!code || !state || !transaction || transaction.exp <= now || state !== transaction.state) {
      return authFailureResponse({
        env,
        correlationId,
        category: 'invalid_transaction',
        stage: 'transaction_validation',
        status: 401,
        cause: 'missing_expired_or_mismatched_transaction',
        authCookie: remainingAuthCookie,
      });
    }

    let tokens: Awaited<ReturnType<typeof exchangeCode>>;
    try {
      tokens = await exchangeCode(env, code, transaction.verifier);
    } catch {
      return authFailureResponse({
        env,
        correlationId,
        category: 'token_exchange_failed',
        stage: 'token_exchange',
        status: 502,
        cause: 'identity_provider_exchange_rejected',
        authCookie: remainingAuthCookie,
      });
    }

    let claims: Awaited<ReturnType<typeof verifyIdToken>>;
    try {
      claims = await verifyIdToken(tokens.id_token, env, transaction.nonce);
    } catch {
      return authFailureResponse({
        env,
        correlationId,
        category: 'token_validation_failed',
        stage: 'id_token_validation',
        status: 401,
        cause: 'id_token_failed_validation',
        authCookie: remainingAuthCookie,
      });
    }

    const mappedRoles = rolesForGroups(claims.groups, env);
    if (mappedRoles.length === 0) {
      return authFailureResponse({
        env,
        correlationId,
        category: 'institutional_role_missing',
        stage: 'role_resolution',
        status: 403,
        cause: 'no_recognized_institutional_role',
        authCookie: remainingAuthCookie,
      });
    }

    const session = await seal(
      {
        oid: claims.oid,
        name: claims.name,
        username: claims.preferred_username,
        roles: mappedRoles,
        exp: Math.min(claims.exp, Math.floor(Date.now() / 1000) + 28_800),
      },
      env.SESSION_SECRET,
    );
    const headers = new Headers({ Location: env.OFFICIAL_ORIGIN });
    headers.append('Set-Cookie', secureCookie(SESSION_COOKIE, session, { maxAge: 28_800 }));
    headers.append('Set-Cookie', remainingAuthCookie);
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === '/auth/logout') {
    method(request, ['POST']);
    enforceWriteOrigin(request, env);
    const headers = new Headers({ Location: env.OFFICIAL_ORIGIN });
    headers.append('Set-Cookie', clearCookie(SESSION_COOKIE));
    headers.append('Set-Cookie', clearCookie(AUTH_COOKIE));
    return new Response(null, { status: 303, headers });
  }

  if (url.pathname === '/api/me') {
    method(request, ['GET']);
    const session = await requireAuth(request, env);
    return json({
      authenticated: true,
      name: session.name,
      roles: session.roles,
      capabilities: capabilitiesForRoles(session.roles),
    });
  }

  const importPersistenceResponse = await handleGradebookImportPersistenceRequestV2(request, env);
  if (importPersistenceResponse) return importPersistenceResponse;

  const operationalWorkspaceResponse = await handleOperationalWorkspaceRequestV1(request, env);
  if (operationalWorkspaceResponse) return operationalWorkspaceResponse;

  const auditWorkspaceResponse = await handleAuditWorkspaceRequestV1(request, env);
  if (auditWorkspaceResponse) return auditWorkspaceResponse;

  const performanceResponse = await handlePerformanceRequestV1(request, env);
  if (performanceResponse) return performanceResponse;

  const bulletinResponse = await handleBulletinRequestV1(request, env);
  if (bulletinResponse) return bulletinResponse;

  const councilResponse = await handleComposedCouncilWorkspaceRequestV1(request, env);
  if (councilResponse) return councilResponse;

  const reportsResponse = await handleInstitutionalReportsRequestV1(request, env);
  if (reportsResponse) return reportsResponse;

  const gradebookD1AdminResponse = await handleGradebookD1AdminRequestV1(request, env);
  if (gradebookD1AdminResponse) return gradebookD1AdminResponse;

  if (url.pathname === '/api/sharepoint/health') {
    method(request, ['GET']);
    const session = await requireAuth(request, env);
    const capabilities = capabilitiesForRoles(session.roles);
    requireCapability(capabilities, 'platform.health.read');
    return json(await sharePointHealth(env));
  }

  if (url.pathname === '/api/platform/snapshot') {
    method(request, ['GET']);
    const session = await requireAuth(request, env);
    const capabilities = capabilitiesForRoles(session.roles);
    requireCapability(capabilities, 'platform.snapshot.read');
    return json(await getPlatformSnapshot(env, capabilities));
  }

  throw new HttpError(404, 'Not found');
}

export const onRequest: PagesFunction<RuntimeEnv> = async (context) => {
  const correlationId = crypto.randomUUID();
  try {
    const pathname = new URL(context.request.url).pathname;
    const noStore = pathname.startsWith('/api/') || pathname.startsWith('/auth/');
    return withSecurityHeaders(await route(context as Context, correlationId), noStore);
  } catch (error) {
    const status =
      error instanceof HttpError ||
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
        ? error.status
        : 500;
    if (status >= 500) {
      console.error(
        JSON.stringify({
          message: 'request_failed',
          correlationId,
          path: new URL(context.request.url).pathname,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
    return withSecurityHeaders(
      json(
        {
          error:
            status === 500
              ? 'Internal server error'
              : error instanceof Error
                ? error.message
                : 'Request failed',
          correlationId,
        },
        status,
      ),
      true,
    );
  }
};
