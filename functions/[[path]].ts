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
  validateWebCredential,
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
import {
  MAINTENANCE_RECOVERY_AUDIENCE,
  verifyGitHubMaintenanceToken,
} from '../server/auth/github-oidc';
import { graphCredentials, type GraphCredentialSlot } from '../server/auth/technical-identity';
import { getPlatformSnapshot } from '../server/platform/snapshot';
import { verifyRecoveryRoundTrip } from '../server/platform/recovery';

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

async function route(context: Context, correlationId: string): Promise<Response> {
  const env = validateEnv(context.env);
  const request = context.request;
  const url = new URL(request.url);
  enforceOfficialOrigin(request, env);

  if (url.pathname === '/api/health') {
    method(request, ['GET']);
    return json({ status: 'ok', service: 'ecossistema-escola', version: '1.0.0' });
  }
  if (url.pathname === '/api/maintenance/rotation/validate') {
    method(request, ['POST']);
    try {
      await verifyGitHubMaintenanceToken(request.headers.get('Authorization'));
    } catch {
      throw new HttpError(401, 'Invalid maintenance identity');
    }
    const requestedSlot = url.searchParams.get('slot');
    const target = url.searchParams.get('target') ?? 'graph';
    if (requestedSlot !== 'LEGACY' && requestedSlot !== 'A' && requestedSlot !== 'B') {
      throw new HttpError(400, 'Invalid credential slot');
    }
    if (target !== 'graph' && target !== 'web') throw new HttpError(400, 'Invalid target');
    try {
      if (target === 'web') {
        return json(await validateWebCredential(env, requestedSlot as GraphCredentialSlot));
      }
      const result = await sharePointHealth(env, requestedSlot as GraphCredentialSlot);
      const credentialKeyId = graphCredentials(env, requestedSlot as GraphCredentialSlot)[0]?.keyId;
      return json({ ...result, credentialSlot: requestedSlot, credentialKeyId });
    } catch (error) {
      throw new HttpError(
        502,
        error instanceof Error ? error.message : 'Technical identity validation failed',
      );
    }
  }
  if (url.pathname === '/api/maintenance/recovery/verify') {
    method(request, ['POST']);
    try {
      await verifyGitHubMaintenanceToken(
        request.headers.get('Authorization'),
        MAINTENANCE_RECOVERY_AUDIENCE,
      );
    } catch {
      throw new HttpError(401, 'Invalid maintenance identity');
    }
    try {
      return json(await verifyRecoveryRoundTrip(env));
    } catch (error) {
      throw new HttpError(
        502,
        error instanceof Error ? error.message : 'Recovery verification failed',
      );
    }
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
    if (status >= 500)
      console.error(
        JSON.stringify({
          message: 'request_failed',
          correlationId,
          path: new URL(context.request.url).pathname,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
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
