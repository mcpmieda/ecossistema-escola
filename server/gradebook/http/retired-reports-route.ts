import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import { enforceOfficialOrigin, enforceWriteOrigin, HttpError } from '../../http/security';
import { authorizeGradebookRuntimeV1 } from '../authorization-v1';

/** Compatibility tombstone for saved clients; it never creates a database or report service. */
export async function handleRetiredGradebookReportsRequest(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/gradebook/reports') return null;
  enforceOfficialOrigin(request, env);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);

  const reply = (state: string, status: number) =>
    Response.json(
      { state },
      {
        status,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
      },
    );
  try {
    authorizeGradebookRuntimeV1(await requireAuth(request, env));
  } catch (cause) {
    if (cause instanceof AuthenticationError) return reply('not-authorized', 401);
    if (cause instanceof AuthorizationError) return reply('not-authorized', 403);
    return reply('unavailable', 503);
  }
  return reply('retired', 410);
}
