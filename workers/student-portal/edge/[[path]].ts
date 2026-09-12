import {
  portalFailureV1,
  portalJsonV1,
  portalRequestOriginAllowedV1,
} from '../../../server/student-portal/runtime/http-v1';

interface PortalEdgeEnv {
  PORTAL_ENVIRONMENT: string;
  PORTAL_ORIGIN: string;
  PORTAL_SELF?: Fetcher;
}

export const onRequest: PagesFunction<PortalEdgeEnv> = async ({ request, env }) => {
  if (!portalRequestOriginAllowedV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN))
    return portalJsonV1(portalFailureV1('forbidden'), 403);
  if (!env.PORTAL_SELF) return portalJsonV1(portalFailureV1('unavailable'), 503);
  try {
    // Forward the original URL, headers, cookies and stream; never rewrite to the official host.
    return await env.PORTAL_SELF.fetch(request);
  } catch {
    return portalJsonV1(portalFailureV1('unavailable'), 503);
  }
};
