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
import { rolesForGroups, requireRole, AuthorizationError } from '../server/auth/roles';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  withSecurityHeaders,
} from '../server/http/security';
import { sharePointHealth } from '../server/graph/sharepoint';
import { verifyGitHubMaintenanceToken } from '../server/auth/github-oidc';
import type { GraphCredentialSlot } from '../server/auth/technical-identity';

type Context = EventContext<RuntimeEnv, string, unknown>;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
function method(request: Request, allowed: string[]): void {
  if (!allowed.includes(request.method)) throw new HttpError(405, 'Method not allowed');
}

async function route(context: Context): Promise<Response> {
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
    if (requestedSlot !== 'LEGACY' && requestedSlot !== 'A' && requestedSlot !== 'B') {
      throw new HttpError(400, 'Invalid credential slot');
    }
    const result = await sharePointHealth(env, requestedSlot as GraphCredentialSlot);
    return json({ ...result, credentialSlot: requestedSlot });
  }
  if (url.pathname === '/auth/login') {
    method(request, ['GET']);
    const transaction = await newAuthTransaction();
    const cookie = await seal(
      {
        state: transaction.state,
        nonce: transaction.nonce,
        verifier: transaction.verifier,
        exp: transaction.exp,
      },
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
    const error = url.searchParams.get('error');
    if (error) throw new HttpError(401, 'Identity provider rejected authentication');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const authCookie = readCookie(request, AUTH_COOKIE);
    const transaction = authCookie
      ? await unseal<{ state: string; nonce: string; verifier: string; exp: number }>(
          authCookie,
          env.SESSION_SECRET,
        )
      : null;
    if (
      !code ||
      !state ||
      !transaction ||
      transaction.exp <= Math.floor(Date.now() / 1000) ||
      state !== transaction.state
    )
      throw new HttpError(401, 'Invalid authentication transaction');
    const tokens = await exchangeCode(env, code, transaction.verifier);
    const claims = await verifyIdToken(tokens.id_token, env, transaction.nonce);
    const mappedRoles = rolesForGroups(claims.groups, env);
    if (mappedRoles.length === 0) throw new HttpError(403, 'No recognized institutional role');
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
    headers.append('Set-Cookie', clearCookie(AUTH_COOKIE));
    return new Response(null, { status: 302, headers });
  }
  if (url.pathname === '/auth/logout') {
    method(request, ['POST']);
    enforceWriteOrigin(request, env);
    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': clearCookie(SESSION_COOKIE) },
    });
  }
  if (url.pathname === '/api/me') {
    method(request, ['GET']);
    const session = await requireAuth(request, env);
    return json({ authenticated: true, name: session.name, roles: session.roles });
  }
  if (url.pathname === '/api/sharepoint/health') {
    method(request, ['GET']);
    const session = await requireAuth(request, env);
    requireRole(session.roles, 'ADMINISTRADOR');
    return json(await sharePointHealth(env));
  }
  throw new HttpError(404, 'Not found');
}

export const onRequest: PagesFunction<RuntimeEnv> = async (context) => {
  const correlationId = crypto.randomUUID();
  try {
    const pathname = new URL(context.request.url).pathname;
    const noStore = pathname.startsWith('/api/') || pathname.startsWith('/auth/');
    return withSecurityHeaders(await route(context as Context), noStore);
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
