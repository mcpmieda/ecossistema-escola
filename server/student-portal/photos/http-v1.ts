import { STUDENT_PHOTO_META_PATH_V1, STUDENT_PHOTO_CONTENT_PATH_V1,
  photoRevisionV1 } from '../../../shared/student-photos/portrait-v1';
import { sessionCookieTokenV1 } from '../http/auth/handler-v1';
import { portalRequestOriginAllowedV1 } from '../runtime/http-v1';
import { portalKeysV1, type PortalCompositionEnvV1 } from '../composition/config-v1';
import { portalDatabaseV1 } from '../composition/database-v1';
import { readOwnPortraitV1, type PortraitReadV1 } from './read-v1';

type PhotoEnvV1 = PortalCompositionEnvV1 & { PORTAL_PHOTOS_ENABLED?: string };
export type OwnPortraitReaderV1 = (token: string, revision: string | null) => Promise<PortraitReadV1 | null>;

function reply(status: number, body: BodyInit | null = null, type?: string): Response {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer' });
  if (type) headers.set('Content-Type', type);
  return new Response(body, { status, headers });
}

/** No redirect, conditional 304, range request or caller-selected student. Every success is authorized. */
export async function servePortalPhotoV1(request: Request, env: PhotoEnvV1,
  read: OwnPortraitReaderV1 = (token, revision) => portalDatabaseV1(env, 'self', sql =>
    readOwnPortraitV1(sql, portalKeysV1(env).cryptoPort, token, revision))): Promise<Response> {
  if (!portalRequestOriginAllowedV1(request, env.PORTAL_ENVIRONMENT, env.PORTAL_ORIGIN)) return reply(403);
  const url = new URL(request.url);
  const content = url.pathname === STUDENT_PHOTO_CONTENT_PATH_V1;
  if (!content && url.pathname !== STUDENT_PHOTO_META_PATH_V1) return reply(404);
  if (request.method !== 'GET') return reply(405);
  if (request.headers.has('range')) return reply(400);
  const entries = [...url.searchParams];
  const revision = content ? photoRevisionV1.safeParse(url.searchParams.get('v')) : null;
  if (content ? entries.length !== 1 || entries[0]?.[0] !== 'v' || !revision?.success : entries.length !== 0)
    return reply(400);
  if (env.PORTAL_SERVING_ENABLED !== 'true') return reply(503);
  // Explicitly disabled until the reviewed migration, publisher and image-use authorization exist.
  if (env.PORTAL_PHOTOS_ENABLED !== 'true') return reply(content ? 404 : 204);
  try {
    const result = await read(sessionCookieTokenV1(request), revision?.success ? revision.data : null);
    if (result === null) return reply(401);
    if (result.state === 'absent') return reply(content ? 404 : 204);
    if (!content && result.state === 'metadata')
      return reply(200, JSON.stringify(result.metadata), 'application/json; charset=utf-8');
    if (content && result.state === 'content') {
      const bytes = new Uint8Array(result.bytes.byteLength); bytes.set(result.bytes);
      return reply(200, bytes.buffer, 'image/webp');
    }
    return reply(503);
  } catch {
    // No driver details, request cookies, student identity, source locators or image data in logs.
    return reply(503);
  }
}
