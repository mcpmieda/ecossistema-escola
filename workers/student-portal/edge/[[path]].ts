import {
  portalFailureV1,
  portalJsonV1,
  portalDocumentNavigationAllowedV1,
  portalRequestOriginAllowedV1,
} from '../../../server/student-portal/runtime/http-v1';
import { FRONTEND_DIAGNOSTIC_ROUTE_V1 } from '../../../shared/frontend-diagnostic-v1';

interface PortalEdgeEnv {
  PORTAL_ENVIRONMENT: string;
  PORTAL_ORIGIN: string;
  PORTAL_SELF?: Fetcher;
  ASSETS?: Fetcher;
}

export const onRequest: PagesFunction<PortalEdgeEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const document = url.pathname === '/' || url.pathname === '/access';
  // The page itself opens from links in other sites/apps; everything else keeps the strict check.
  const allowed = document
    ? portalDocumentNavigationAllowedV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN)
    : portalRequestOriginAllowedV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN);
  if (!allowed) return portalJsonV1(portalFailureV1('forbidden'), 403);
  // Every extension Vite emits for the Portal must be listed here (cover art and logo are WebP).
  const asset = /^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|png|svg|webp)$/u.test(url.pathname);
  if (document || asset) {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return portalJsonV1(portalFailureV1('invalid-request'), 400);
    if (!env.ASSETS) return portalJsonV1(portalFailureV1('unavailable'), 503);
    try {
      if (document) {
        url.pathname = '/';
        url.search = ''; // tracking parameters never reach the static asset lookup
      }
      const upstream = await env.ASSETS.fetch(new Request(url, { method: request.method }));
      if (upstream.status !== 200 || (asset && upstream.headers.get('Content-Type')?.includes('text/html')))
        return portalJsonV1(portalFailureV1('unavailable'), 404);
      const response = new Response(upstream.body, upstream);
      // style-src allows only React Aria's pressable rule by hash (see react-aria-style-csp test).
      response.headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; style-src 'self' 'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; font-src 'self'; worker-src 'self' blob:");
      response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
      response.headers.set('Referrer-Policy', 'no-referrer');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      response.headers.set('Cache-Control', document ? 'no-store' : 'public, max-age=31536000, immutable');
      return response;
    } catch { return portalJsonV1(portalFailureV1('unavailable'), 503); }
  }
  if (url.pathname !== '/healthz' && url.pathname !== FRONTEND_DIAGNOSTIC_ROUTE_V1 && !url.pathname.startsWith('/api/student/'))
    return portalJsonV1(portalFailureV1('unavailable'), 404);
  if (!env.PORTAL_SELF) return portalJsonV1(portalFailureV1('unavailable'), 503);
  try {
    // Forward the original URL, headers, cookies and stream; never rewrite to the official host.
    return await env.PORTAL_SELF.fetch(request);
  } catch { return portalJsonV1(portalFailureV1('unavailable'), 503); }
};
