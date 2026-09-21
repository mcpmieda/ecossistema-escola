import type { RuntimeEnv } from '../env';
import { requireAuth, AuthenticationError, SESSION_COOKIE } from '../auth/session';
import { AuthorizationError } from '../auth/roles';
import { capabilitiesForRoles, requireCapability } from '../auth/capabilities';
import { enforceOfficialOrigin, enforceWriteOrigin, HttpError, withSecurityHeaders } from '../http/security';
import type { TrustedAdminContextV1 } from '../../shared/student-portal-contracts/ports-v1';
import { healthDeadlineV1, readHealthJsonV1 } from '../../shared/health-io-v1';
import { collectSystemHealthV1, createSystemHealthCacheV1 } from './system-health-source-v1';

type MonitorBindingV1 = { monitoring(context: TrustedAdminContextV1): Promise<unknown> };
const caches = new WeakMap<object, Map<string, ReturnType<typeof createSystemHealthCacheV1>>>();
const absentBindingCacheKey = {};
const reply = (value: unknown, status = 200) => withSecurityHeaders(Response.json(value, { status }), true);

function guardedRequestV1(request: Request, env: RuntimeEnv): void {
  const url = new URL(request.url);
  enforceOfficialOrigin(request, env);
  enforceWriteOrigin(request, env);
  const mode = env.RUNTIME_ENVIRONMENT ?? 'production';
  if ((mode === 'production' && env.OFFICIAL_ORIGIN !== 'https://admin.escolaieda.com')
    || (mode !== 'production' && (mode !== 'local' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    || url.search || url.hash || url.username || url.password
    || request.headers.has('x-forwarded-host') || request.headers.has('x-original-url'))
    throw new HttpError(403, 'health-forbidden');
  const host = request.headers.get('host');
  const site = request.headers.get('sec-fetch-site');
  if ((host && host.toLowerCase() !== url.host.toLowerCase())
    || (site && site !== 'same-origin' && site !== 'none')) throw new HttpError(403, 'health-forbidden');
  if (request.method !== 'POST') throw new HttpError(405, 'health-method');
  const copies = (request.headers.get('cookie') ?? '').split(';')
    .filter((part) => part.trim().startsWith(`${SESSION_COOKIE}=`)).length;
  if (copies !== 1) throw new AuthenticationError();
}
function snapshotCacheV1(key: object, env: RuntimeEnv) {
  let group = caches.get(key);
  if (!group) { group = new Map(); caches.set(key, group); }
  const name = `${env.TENANT_ID}|${env.OFFICIAL_ORIGIN}|${env.RUNTIME_ENVIRONMENT ?? 'production'}`;
  let cache = group.get(name);
  if (!cache) {
    if (group.size >= 4) group.clear();
    cache = createSystemHealthCacheV1(); group.set(name, cache);
  }
  return cache;
}
export async function handleSystemHealthRequestV1(request: Request, env: RuntimeEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/platform/system-health') return null;
  try {
    guardedRequestV1(request, env);
    const session = await requireAuth(request, env);
    const capabilities = capabilitiesForRoles(session.roles);
    requireCapability(capabilities, 'platform.health.read');
    requireCapability(capabilities, 'platform.settings.read');
    if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
      throw new HttpError(415, 'health-content-type');
    let body: unknown;
    try {
      body = await healthDeadlineV1((signal) => readHealthJsonV1(
        new Response(request.body, { headers: request.headers }), signal, 64), 2_000);
    } catch { throw new HttpError(400, 'health-invalid-body'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0)
      throw new HttpError(400, 'health-invalid-body');
    if (session.exp <= Math.floor(Date.now() / 1000)) throw new AuthenticationError();
    const context: TrustedAdminContextV1 = { actorId: session.oid, tenantId: env.TENANT_ID,
      requestId: crypto.randomUUID(), authenticatedAt: new Date().toISOString(), capability: 'platform.settings.read' };
    const binding = env.PORTAL_SERVICE as unknown as MonitorBindingV1 | undefined;
    // Auth is checked on EVERY call, including cache hits. Only anonymous aggregates are cached.
    const cache = snapshotCacheV1(binding ?? absentBindingCacheKey, env);
    const snapshot = await cache(() => collectSystemHealthV1({
      production: (env.RUNTIME_ENVIRONMENT ?? 'production') === 'production',
      readPortal: binding && typeof binding.monitoring === 'function' ? () => binding.monitoring(context) : undefined,
    }));
    return reply(snapshot);
  } catch (error) {
    if (error instanceof AuthenticationError) return reply({ state: 'unauthenticated' }, 401);
    if (error instanceof AuthorizationError) return reply({ state: 'forbidden' }, 403);
    if (error instanceof HttpError) return reply({ state: 'invalid-request' }, error.status);
    return reply({ state: 'unavailable' }, 503);
  }
}
