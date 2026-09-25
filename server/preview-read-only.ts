import type { RuntimeEnv } from './env';
import { readBoundedJson } from './http/security';

/** A separate preview may read production data, but it must never invoke a write route. */
export async function previewRequestAllowed(request: Request, env: RuntimeEnv): Promise<boolean> {
  if (env.RUNTIME_ENVIRONMENT !== 'preview') return true;
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/')) return true;
  if (request.method === 'GET') return true;
  if (request.method !== 'POST') return false;
  if (path === '/api/student-portal/admin/query' || path === '/api/student-photos/admin/state')
    return true;
  if (path !== '/api/gradebook/operational-workspace') return false;
  try {
    const body = await readBoundedJson(request.clone(), 16_384);
    return typeof body === 'object' && body !== null && 'operation' in body && body.operation === 'search';
  } catch {
    return false;
  }
}
