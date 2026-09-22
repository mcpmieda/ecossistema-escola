import { WorkerEntrypoint } from 'cloudflare:workers';
import { portalFailureV1, portalJsonV1 } from '../../server/student-portal/runtime/http-v1';
import { servePortalSelfV1 } from '../../server/student-portal/composition/self-v1';
import { portalAdminRpcV1 } from '../../server/student-portal/composition/admin-v1';
import { portalMonitoringRpcV1 } from '../../server/student-portal/composition/monitoring-v1';
import { portalHistoryRpcV1, portalHistoryScheduledV1 } from '../../server/student-portal/composition/health-history-v1';
import { portalScheduledV1 } from '../../server/student-portal/composition/scheduled-v1';
import type { PortalCompositionEnvV1 } from '../../server/student-portal/composition/config-v1';
import { liveAdminContextV1 } from '../../shared/student-portal-contracts/live-v1';
import { PortalLiveUpdatesV1 } from '../../server/student-portal/live/live-updates-v1';
import { connectPortalLiveV1 } from '../../server/student-portal/live/live-connect-v1';
import { dispatchPortalLiveEventsV1 } from '../../server/student-portal/live/live-outbox-v1';

export { PortalLiveUpdatesV1 };
const selfMayEnqueueLiveV1 = (request: Request) => request.method !== 'GET'
  && ['/api/student/auth/activate', '/api/student/auth/logout'].includes(new URL(request.url).pathname);

export class PortalSelfEntrypoint extends WorkerEntrypoint<PortalWorkerEnv & PortalCompositionEnvV1> {
  override async fetch(request: Request): Promise<Response> {
    const response = await servePortalSelfV1(request, this.env);
    if (selfMayEnqueueLiveV1(request)) this.ctx.waitUntil(dispatchPortalLiveEventsV1(this.env).catch(() => undefined));
    return response;
  }
}
export class PortalAdminEntrypoint extends WorkerEntrypoint<PortalWorkerEnv & PortalCompositionEnvV1> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parsed = liveAdminContextV1.safeParse({
      actorId: request.headers.get('x-admin-actor-id'),
      tenantId: request.headers.get('x-admin-tenant-id'),
      capability: request.headers.get('x-admin-capability'),
      expiresAt: request.headers.get('x-admin-expires-at'),
    });
    if (url.origin !== 'https://portal-admin.internal' || url.pathname !== '/live'
      || request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
      || !parsed.success || parsed.data.tenantId !== this.env.PORTAL_ADMIN_TENANT_ID
      || Date.parse(parsed.data.expiresAt) <= Date.now())
      return portalJsonV1(portalFailureV1('forbidden'), 403);
    this.ctx.waitUntil(dispatchPortalLiveEventsV1(this.env).catch(() => undefined));
    return connectPortalLiveV1(this.env, request, { audience: 'admin', expiresAt: parsed.data.expiresAt,
      accountId: null, studentId: null, classId: null });
  }
  async monitoring(context: unknown) {
    return portalMonitoringRpcV1(this.env, context);
  }
  async monitoringHistory(context: unknown, before: unknown) {
    return portalHistoryRpcV1(this.env, context, before);
  }
  async query(context: unknown, request: unknown) {
    return portalAdminRpcV1(this.env, 'query', context, request);
  }
  async command(context: unknown, request: unknown) {
    const result = await portalAdminRpcV1(this.env, 'command', context, request);
    this.ctx.waitUntil(dispatchPortalLiveEventsV1(this.env).catch(() => undefined));
    return result;
  }
}
// No admin RPC on the default/self capability. Population remains an explicit, separate operation.
export default {
  async fetch(request, env, ctx) {
    const response = await servePortalSelfV1(request, env);
    if (selfMayEnqueueLiveV1(request)) ctx.waitUntil(dispatchPortalLiveEventsV1(env).catch(() => undefined));
    return response;
  },
  async scheduled(controller, env) {
    await Promise.all([portalScheduledV1(env), dispatchPortalLiveEventsV1(env).catch(() => 0),
      portalHistoryScheduledV1(env, controller.scheduledTime)]);
  },
} satisfies ExportedHandler<PortalWorkerEnv & PortalCompositionEnvV1>;
