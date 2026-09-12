import { WorkerEntrypoint } from 'cloudflare:workers';
import { portalJsonV1, servePortalFoundationV1 } from '../../server/student-portal/runtime/http-v1';
import { refuseUncomposedAdminV1 } from '../../server/student-portal/runtime/admin-v1';

export class PortalSelfEntrypoint extends WorkerEntrypoint<PortalWorkerEnv> {
  override async fetch(request: Request): Promise<Response> {
    return servePortalFoundationV1(request, this.env.PORTAL_ENVIRONMENT, this.env.PORTAL_ORIGIN);
  }
}
export class PortalAdminEntrypoint extends WorkerEntrypoint<PortalWorkerEnv> {
  override async fetch(): Promise<Response> {
    return portalJsonV1({ contractVersion: 1, state: 'unavailable' }, 404);
  }
  async query(context: unknown, request: unknown) {
    return refuseUncomposedAdminV1('query', context, request, this.env.PORTAL_ADMIN_TENANT_ID);
  }
  async command(context: unknown, request: unknown) {
    return refuseUncomposedAdminV1('command', context, request, this.env.PORTAL_ADMIN_TENANT_ID);
  }
}
// No admin RPC on the default/self capability. No database or account population.
export default {
  async fetch(request, env) {
    return servePortalFoundationV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN);
  },
  async scheduled() {
    // No cron configured yet. I composes bounded, durable handlers after H.
  },
} satisfies ExportedHandler<PortalWorkerEnv>;
