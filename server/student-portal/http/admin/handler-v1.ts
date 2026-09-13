import { ADMIN_BODY_BYTES_V1, adminCommandV1, adminResponseV1, type AdminCommandV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import { adminQueryRequestV2, adminReadResponseV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import { ERROR_HTTP_V1, failureV1, type FailureV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminEntrypointV1 } from '../../../../shared/student-portal-contracts/ports-v1';
import type { RuntimeEnv } from '../../../env';
import { HttpError, readBoundedJson } from '../../../http/security';
import { portalJsonV1 } from '../../runtime/http-v1';
import { verifiedPagesContextV1 } from '../../admin-client/pages-context-v1';

function allowed(request: Request, env: RuntimeEnv): boolean {
  const url = new URL(request.url);
  const environment = env.RUNTIME_ENVIRONMENT ?? 'production';
  if (environment === 'production' && env.OFFICIAL_ORIGIN !== 'https://admin.escolaieda.com') return false;
  if (environment !== 'production' && (environment !== 'local' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return false;
  if (url.origin !== env.OFFICIAL_ORIGIN || url.search || url.hash || url.username || url.password) return false;
  const host = request.headers.get('host');
  if (host && host.toLowerCase() !== url.host.toLowerCase()) return false;
  if (request.headers.has('x-forwarded-host') || request.headers.has('x-original-url')) return false;
  if (request.headers.get('origin') !== env.OFFICIAL_ORIGIN) return false;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}
function commandState(command: AdminCommandV1): 'qr' | 'batch' | 'committed' {
  return command.operation.startsWith('qr-') ? 'qr' : command.operation === 'birth-batch' ? 'batch' : 'committed';
}

/** Standalone ADM Pages adapter; #715 owns routing and the dedicated service binding. */
export async function servePortalAdminV1(request: Request, env: RuntimeEnv, binding: PortalAdminEntrypointV1): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (state: FailureV1['state']) => portalJsonV1({ contractVersion: 1, requestId, state }, ERROR_HTTP_V1[state]);
  if (!allowed(request, env)) return fail('forbidden');
  const path = new URL(request.url).pathname;
  const kind = path === '/api/student-portal/admin/query' ? 'query' : path === '/api/student-portal/admin/command' ? 'command' : null;
  if (!kind) return portalJsonV1({ contractVersion: 1, requestId, state: 'unavailable' }, 404);
  if (request.method !== 'POST') return fail('invalid-request');
  try {
    // Check identity before consuming an untrusted stream or invoking the binding.
    const first = await verifiedPagesContextV1(request, env, kind === 'command', requestId);
    if (typeof first === 'string') return fail(first);
    const body = await readBoundedJson(request, ADMIN_BODY_BYTES_V1);
    let result: unknown;
    let expected: string;
    let expectedVersion = 1;
    if (kind === 'query') {
      const parsed = adminQueryRequestV2.safeParse(body);
      if (!parsed.success) return fail('invalid-request');
      const query = parsed.data;
      expectedVersion = query.contractVersion;
      const context = await verifiedPagesContextV1(request, env, ['audit-detail', 'links-preview'].includes(query.operation), requestId);
      if (typeof context === 'string') return fail(context);
      result = await binding.query(context, query);
      expected = query.operation;
    } else {
      const parsed = adminCommandV1.safeParse(body);
      if (!parsed.success) return fail('invalid-request');
      const context = await verifiedPagesContextV1(request, env, true, requestId);
      if (typeof context === 'string') return fail(context);
      result = await binding.command(context, parsed.data);
      expected = commandState(parsed.data);
    }
    const failure = failureV1.safeParse(result);
    if (failure.success) {
      // Invalid RPC context may intentionally have a new correlation id; no sensitive fields survive this schema.
      const response = portalJsonV1({ ...failure.data, requestId }, ERROR_HTTP_V1[failure.data.state]);
      if (failure.data.retryAfterSeconds) response.headers.set('Retry-After', String(failure.data.retryAfterSeconds));
      return response;
    }
    const response = expectedVersion === 2 ? adminReadResponseV2.safeParse(result) : adminResponseV1.safeParse(result);
    if (!response.success || response.data.state !== expected || response.data.requestId !== requestId) return fail('unavailable');
    return portalJsonV1(response.data, 200);
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status === 413 ? 'body-too-large' : 'invalid-request');
    return fail('unavailable');
  }
}
