import { activateRequestV1, challengeRequestV1, loginRequestV1 } from '../../../shared/student-portal-contracts/auth-v1';
import type { FailureV1 } from '../../../shared/student-portal-contracts/core-v1';
import { AuthServiceV1 } from '../auth/auth-service-v1';
import { SessionServiceV1 } from '../auth/session-service-v1';
import { TurnstileVerifierV1 } from '../auth/turnstile-v1';
import { servePortalAuthV1, sessionCookieTokenV1 } from '../http/auth/handler-v1';
import { portalServingGateV1 } from '../maintenance/serving-gate-v1';
import { cloudflareClientIpV1 } from '../observability/audit-context-v1';
import { portalAuthBurstV1 } from '../observability/auth-burst-v1';
import { SelfProjectionReaderV1 } from '../publication/self-projection-reader-v1';
import { scopedPublicationEnabledV2 } from '../publication/scoped-source-v2';
import { portalFailureV1, portalJsonV1, portalRequestOriginAllowedV1 } from '../runtime/http-v1';
import { portalKeysV1, type PortalCompositionEnvV1 } from './config-v1';
import { portalDatabaseV1 } from './database-v1';

const paths = new Set(['/api/student/auth/challenge', '/api/student/auth/activate', '/api/student/auth/login',
  '/api/student/auth/logout', '/api/student/session', '/api/student/me']);

export async function servePortalSelfV1(request: Request, env: PortalCompositionEnvV1): Promise<Response> {
  if (!portalRequestOriginAllowedV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN))
    return portalJsonV1(portalFailureV1('forbidden'), 403);
  const path = new URL(request.url).pathname;
  if (path === '/healthz' && request.method === 'GET') return portalJsonV1({ contractVersion: 1, state: 'ok' }, 200);
  if (!paths.has(path)) return portalJsonV1(portalFailureV1('unavailable'), 404);
  try {
    const clientIp = cloudflareClientIpV1(request);
    // Lazy adapters enforce method, bytes, JSON and schema BEFORE connection/KDF.
    const invoke = async <T>(subject: string, requestId: string, run: (auth: AuthServiceV1) => Promise<T>): Promise<T | FailureV1> => {
      if (portalServingGateV1(env.PORTAL_SERVING_ENABLED)) return { contractVersion: 1, requestId, state: 'unavailable' } satisfies FailureV1;
      if (!env.PORTAL_AUTH_GLOBAL || !env.PORTAL_AUTH_SUBJECT) throw new Error('student-portal-rate-limit-unavailable');
      if (!await portalAuthBurstV1(env.PORTAL_AUTH_GLOBAL, env.PORTAL_AUTH_SUBJECT)(subject))
        return { contractVersion: 1, requestId, state: 'rate-limited', retryAfterSeconds: 60 } satisfies FailureV1;
      const keys = portalKeysV1(env);
      if (!env.TURNSTILE_SECRET_KEY) throw new Error('student-portal-turnstile-unavailable');
      return portalDatabaseV1(env, 'auth', (sql) => run(new AuthServiceV1(sql, keys.cryptoPort, keys.pepperVersion,
        new TurnstileVerifierV1(env.TURNSTILE_SECRET_KEY!), clientIp)));
    };
    const read: SessionServiceV1['read'] = async (token, requestId) => {
      if (portalServingGateV1(env.PORTAL_SERVING_ENABLED)) throw new Error('student-portal-maintenance');
      const keys = portalKeysV1(env);
      return portalDatabaseV1(env, 'self', (sql) => new SessionServiceV1(sql, keys.cryptoPort, clientIp).read(token, requestId));
    };
    const logout: SessionServiceV1['logout'] = async (token, requestId) => {
      if (portalServingGateV1(env.PORTAL_SERVING_ENABLED)) throw new Error('student-portal-maintenance');
      const keys = portalKeysV1(env);
      return portalDatabaseV1(env, 'auth', (sql) => new SessionServiceV1(sql, keys.cryptoPort, clientIp).logout(token, requestId));
    };
    if (path === '/api/student/me') {
      if (request.method !== 'GET') return portalJsonV1(portalFailureV1('invalid-request'), 400);
      const closed = portalServingGateV1(env.PORTAL_SERVING_ENABLED);
      if (closed) return closed;
      const keys = portalKeysV1(env);
      const result = await portalDatabaseV1(env, 'self', (sql) => new SessionServiceV1(sql, keys.cryptoPort, clientIp)
        .withAuthorized(sessionCookieTokenV1(request), async (context, tx) => {
          const scoped = env.PORTAL_PUBLICATION_MODE === 'scoped-v2' && await scopedPublicationEnabledV2(tx);
          return new SelfProjectionReaderV1(sql, scoped).readInTransaction(tx, context.account.id, crypto.randomUUID());
        }));
      return result ? portalJsonV1(result, 200) : portalJsonV1(portalFailureV1('unauthenticated'), 401);
    }
    return servePortalAuthV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN,
      { challenge: async (input, id) => { const parsed = challengeRequestV1.parse(input); return invoke(parsed.qr, id, (auth) => auth.challenge(parsed, id)); },
        activate: async (input, id) => { const parsed = activateRequestV1.parse(input); return invoke(parsed.challenge, id, (auth) => auth.activate(parsed, id)); },
        login: async (input, id) => { const parsed = loginRequestV1.parse(input); return invoke(parsed.qr, id, (auth) => auth.login(parsed, id)); } }, { read, logout });
  } catch { return portalJsonV1(portalFailureV1('unavailable'), 503); }
}
