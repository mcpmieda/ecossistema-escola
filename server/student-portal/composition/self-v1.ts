import {
  activateRequestV1,
  challengeRequestV1,
  loginRequestV1,
} from '../../../shared/student-portal-contracts/auth-v1';
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
import { connectPortalLiveV1 } from '../live/live-connect-v1';
import { servePortalPhotoV1 } from '../photos/http-v1';
import { STUDENT_PHOTO_META_PATH_V1, STUDENT_PHOTO_CONTENT_PATH_V1 } from '../../../shared/student-photos/portrait-v1';

const paths = new Set([
  '/api/student/auth/challenge',
  '/api/student/auth/activate',
  '/api/student/auth/login',
  '/api/student/auth/logout',
  '/api/student/session',
  '/api/student/me',
  '/api/student/live',
]);

export async function servePortalSelfV1(
  request: Request,
  env: PortalCompositionEnvV1,
): Promise<Response> {
  if (!portalRequestOriginAllowedV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN))
    return portalJsonV1(portalFailureV1('forbidden'), 403);
  const path = new URL(request.url).pathname;
  if (path === STUDENT_PHOTO_META_PATH_V1 || path === STUDENT_PHOTO_CONTENT_PATH_V1)
    return servePortalPhotoV1(request, env);
  if (path === '/healthz' && request.method === 'GET')
    return portalJsonV1({ contractVersion: 1, state: 'ok' }, 200);
  if (!paths.has(path)) return portalJsonV1(portalFailureV1('unavailable'), 404);
  try {
    const clientIp = cloudflareClientIpV1(request);
    const snapshotReads = env.PORTAL_PUBLICATION_MODE === 'scoped-v2';
    // Lazy adapters enforce method, bytes, JSON and schema BEFORE connection/KDF.
    const invoke = async <T>(
      subject: string,
      requestId: string,
      run: (auth: AuthServiceV1) => Promise<T>,
    ): Promise<T | FailureV1> => {
      if (portalServingGateV1(env.PORTAL_SERVING_ENABLED))
        return { contractVersion: 1, requestId, state: 'unavailable' } satisfies FailureV1;
      if (!env.PORTAL_AUTH_GLOBAL || !env.PORTAL_AUTH_SUBJECT)
        throw new Error('student-portal-rate-limit-unavailable');
      if (!(await portalAuthBurstV1(env.PORTAL_AUTH_GLOBAL, env.PORTAL_AUTH_SUBJECT)(subject)))
        return {
          contractVersion: 1,
          requestId,
          state: 'rate-limited',
          retryAfterSeconds: 60,
        } satisfies FailureV1;
      const keys = portalKeysV1(env);
      if (!env.TURNSTILE_SECRET_KEY) throw new Error('student-portal-turnstile-unavailable');
      return portalDatabaseV1(env, 'auth', (sql) =>
        run(
          new AuthServiceV1(
            sql,
            keys.cryptoPort,
            keys.pepperVersion,
            new TurnstileVerifierV1(env.TURNSTILE_SECRET_KEY!),
            clientIp,
          ),
        ),
      );
    };
    const read: SessionServiceV1['read'] = async (token, requestId, expectedAccountId) => {
      if (portalServingGateV1(env.PORTAL_SERVING_ENABLED))
        throw new Error('student-portal-maintenance');
      const keys = portalKeysV1(env);
      return portalDatabaseV1(env, 'self', (sql) =>
        new SessionServiceV1(sql, keys.cryptoPort, clientIp, snapshotReads).read(
          token,
          requestId,
          expectedAccountId,
        ),
      );
    };
    if (path === '/api/student/live') {
      if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
        return portalJsonV1(portalFailureV1('invalid-request'), 400);
      if (portalServingGateV1(env.PORTAL_SERVING_ENABLED))
        return portalJsonV1(portalFailureV1('unavailable'), 503);
      const purpose = new URL(request.url).searchParams.get('purpose');
      const expectedAccount = new URL(request.url).searchParams.get('accountId');
      if (purpose !== null && purpose !== 'security')
        return portalJsonV1(portalFailureV1('invalid-request'), 400);
      const keys = portalKeysV1(env);
      const identity = await portalDatabaseV1(env, 'live', (sql) =>
        new SessionServiceV1(sql, keys.cryptoPort, undefined, true).withAuthorized(
          sessionCookieTokenV1(request),
          async (context, tx, session) => {
            if (
              !context.account.link ||
              (expectedAccount !== null && context.account.id !== expectedAccount.toLowerCase())
            )
              return null;
            const classes = await tx.unsafe(
              `SELECT class_id FROM student_portal.academic_binding_v1
              WHERE academic_year=2026 AND student_id=$1 AND status IS DISTINCT FROM 6
              ORDER BY class_id LIMIT 2`,
              [context.account.link.studentId],
            );
            if (classes.length > 1) throw new Error('student-portal-live-class-ambiguous');
            return {
              audience: 'student' as const,
              purpose: purpose === 'security' ? ('security' as const) : ('academic' as const),
              expiresAt:
                purpose === 'security'
                  ? new Date(
                      Math.min(Date.parse(session.expiresAt), Date.now() + 60_000),
                    ).toISOString()
                  : session.expiresAt,
              accountId: context.account.id,
              studentId: context.account.link.studentId,
              classId: classes[0]?.class_id === undefined ? null : Number(classes[0].class_id),
            };
          },
        ),
      );
      if (!identity) return portalJsonV1(portalFailureV1('unauthenticated'), 401);
      return connectPortalLiveV1(env, request, identity);
    }
    const logout: SessionServiceV1['logout'] = async (token, requestId) => {
      if (portalServingGateV1(env.PORTAL_SERVING_ENABLED))
        throw new Error('student-portal-maintenance');
      const keys = portalKeysV1(env);
      return portalDatabaseV1(env, 'auth', (sql) =>
        new SessionServiceV1(sql, keys.cryptoPort, clientIp).logout(token, requestId),
      );
    };
    if (path === '/api/student/me') {
      if (request.method !== 'GET') return portalJsonV1(portalFailureV1('invalid-request'), 400);
      const closed = portalServingGateV1(env.PORTAL_SERVING_ENABLED);
      if (closed) return closed;
      const keys = portalKeysV1(env);
      const result = await portalDatabaseV1(env, 'self', (sql) =>
        new SessionServiceV1(sql, keys.cryptoPort, clientIp, snapshotReads).withAuthorized(
          sessionCookieTokenV1(request),
          async (context, tx) => {
            // Scoped V2 editions are the only published source; without them Self fails closed.
            if (env.PORTAL_PUBLICATION_MODE !== 'scoped-v2' || !(await scopedPublicationEnabledV2(tx)))
              throw new Error('student-portal-scoped-publication-unavailable');
            return new SelfProjectionReaderV1(sql).readInTransaction(
              tx,
              context.account.id,
              crypto.randomUUID(),
              snapshotReads,
            );
          },
        ),
      );
      return result
        ? portalJsonV1(result, 200)
        : portalJsonV1(portalFailureV1('unauthenticated'), 401);
    }
    return servePortalAuthV1(
      request,
      env.PORTAL_ENVIRONMENT,
      env.PORTAL_ORIGIN,
      {
        challenge: async (input, id) => {
          const parsed = challengeRequestV1.parse(input);
          return invoke(parsed.qr, id, (auth) => auth.challenge(parsed, id));
        },
        activate: async (input, id) => {
          const parsed = activateRequestV1.parse(input);
          return invoke(parsed.challenge, id, (auth) => auth.activate(parsed, id));
        },
        login: async (input, id) => {
          const parsed = loginRequestV1.parse(input);
          return invoke(parsed.qr, id, (auth) => auth.login(parsed, id));
        },
      },
      { read, logout },
    );
  } catch {
    return portalJsonV1(portalFailureV1('unavailable'), 503);
  }
}
