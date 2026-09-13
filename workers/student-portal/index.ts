import { WorkerEntrypoint } from 'cloudflare:workers';
import { portalJsonV1 } from '../../server/student-portal/runtime/http-v1';
import { servePortalSelfV1 } from '../../server/student-portal/composition/self-v1';
import { portalAdminRpcV1 } from '../../server/student-portal/composition/admin-v1';
import { portalScheduledV1 } from '../../server/student-portal/composition/scheduled-v1';
import type { PortalCompositionEnvV1 } from '../../server/student-portal/composition/config-v1';

export class PortalSelfEntrypoint extends WorkerEntrypoint<PortalWorkerEnv & PortalCompositionEnvV1> {
  override async fetch(request: Request): Promise<Response> {
    return servePortalSelfV1(request, this.env);
  }
}
export class PortalAdminEntrypoint extends WorkerEntrypoint<PortalWorkerEnv & PortalCompositionEnvV1> {
  override async fetch(): Promise<Response> {
    return portalJsonV1({ contractVersion: 1, state: 'unavailable' }, 404);
  }
  async query(context: unknown, request: unknown) {
    return portalAdminRpcV1(this.env, 'query', context, request);
  }
  async command(context: unknown, request: unknown) {
    return portalAdminRpcV1(this.env, 'command', context, request);
  }
}
// No admin RPC on the default/self capability. Population remains an explicit, separate operation.
export default {
  async fetch(request, env) {
    return servePortalSelfV1(request, env);
  },
  async scheduled(_controller, env) {
    await portalScheduledV1(env);
  },
} satisfies ExportedHandler<PortalWorkerEnv & PortalCompositionEnvV1>;
