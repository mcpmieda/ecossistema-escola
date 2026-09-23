import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { getGraphToken, graphRequest } from '../graph/client';
import { GraphError, graphDefaultsV1, type GraphDependencies } from '../graph/request-policy-v1';

export const SHAREPOINT_PHOTO_MAX_BYTES_V1 = 2 * 1024 * 1024;
const locatorPart = z.string().min(1).max(256).regex(/^[A-Za-z0-9!_-]+$/u);
const descriptor = z.object({
  id: locatorPart, eTag: z.string().min(1).max(256), size: z.number().int().min(20).max(SHAREPOINT_PHOTO_MAX_BYTES_V1),
  file: z.object({ mimeType: z.literal('image/webp') }),
  parentReference: z.object({ driveId: locatorPart }),
  '@microsoft.graph.downloadUrl': z.string().min(1).max(8192),
});
function tenantHost(env: RuntimeEnv): string {
  const host = env.SHAREPOINT_SITE_ID.split(',')[0]!.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.sharepoint\.com$/u.test(host)) throw new Error('student-photo-site-unavailable');
  return host;
}
function downloadUrl(value: string, host: string, correlationId: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new GraphError(502, correlationId); }
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || url.hash
    || value.length > 8192 || /[\r\n\t\\]/u.test(value)) throw new GraphError(502, correlationId);
  return url.href;
}
async function boundedBytes(response: Response, expected: number, signal: AbortSignal, correlationId: string): Promise<Uint8Array> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) !== expected)) {
    await response.body?.cancel().catch(() => undefined); throw new GraphError(502, correlationId);
  }
  if (!response.body) throw new GraphError(502, correlationId);
  const reader = response.body.getReader(), bytes = new Uint8Array(expected);
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  let offset = 0;
  try {
    while (true) {
      signal.throwIfAborted(); const chunk = await reader.read(); signal.throwIfAborted();
      if (chunk.done) break;
      if (offset + chunk.value.byteLength > expected) throw new GraphError(502, correlationId);
      bytes.set(chunk.value, offset); offset += chunk.value.byteLength;
    }
    if (offset !== expected) throw new GraphError(502, correlationId);
    return bytes;
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
async function unsignedDownload(url: string, host: string, expected: number, dependencies: GraphDependencies,
  signal: AbortSignal, correlationId: string): Promise<Uint8Array> {
  let next = url;
  for (let hop = 0; hop <= 2; hop++) {
    const allowed = downloadUrl(next, host, correlationId);
    // Deliberately new headers: no Graph bearer, cookies, client-supplied header or referrer.
    const response = await dependencies.fetch(allowed, { method: 'GET', redirect: 'manual', credentials: 'omit',
      headers: { Accept: 'image/webp, application/octet-stream' }, signal });
    if (response.status === 200 && !response.redirected) return boundedBytes(response, expected, signal, correlationId);
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    if (response.redirected || ![301, 302, 303, 307, 308].includes(response.status) || !location || hop === 2)
      throw new GraphError(response.status >= 400 ? response.status : 502, correlationId);
    next = new URL(location, allowed).href;
  }
  throw new GraphError(502, correlationId);
}
/** Backend-admin only, using a server-resolved authorized library locator, NEVER a browser URL.
 * This read does not confer app permissions or validate/re-encode an untrusted upload.
 * Other Graph consumers retain their behavior; photos must not call graphContentRequest(GET).
 */
export async function readSharePointPhotoV1(input: {
  env: RuntimeEnv; driveId: string; itemId: string; expectedETag?: string; signal?: AbortSignal;
  dependencies?: GraphDependencies; token?: string;
}): Promise<{ bytes: Uint8Array; etag: string }> {
  const host = tenantHost(input.env), drive = locatorPart.parse(input.driveId), item = locatorPart.parse(input.itemId);
  const dependencies = input.dependencies ?? graphDefaultsV1, correlationId = crypto.randomUUID();
  const timeout = AbortSignal.timeout(20_000), signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  signal.throwIfAborted();
  try {
    const token = input.token ?? await getGraphToken(input.env, dependencies);
    signal.throwIfAborted();
    const path = `/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}`;
    const result = await graphRequest<unknown>({ env: input.env, token, dependencies, correlationId, signal, path:
      path + '?$select=id,eTag,size,file,parentReference,@microsoft.graph.downloadUrl' });
    const meta = descriptor.safeParse(result.data);
    if (!meta.success || meta.data.id !== item || meta.data.parentReference.driveId !== drive) throw new GraphError(502, correlationId);
    if (input.expectedETag !== undefined && input.expectedETag !== meta.data.eTag) throw new GraphError(412, correlationId);
    const bytes = await unsignedDownload(meta.data['@microsoft.graph.downloadUrl'], host, meta.data.size, dependencies, signal, correlationId);
    // A remote edit between discovery and download is a conflict, not a publishable new revision.
    const after = await graphRequest<{ id: string; eTag: string; size: number }>({ env: input.env, token, dependencies,
      correlationId, signal, path: path + '?$select=id,eTag,size' });
    if (after.data.id !== item || after.data.eTag !== meta.data.eTag || after.data.size !== bytes.length) throw new GraphError(409, correlationId);
    return { bytes, etag: meta.data.eTag };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof GraphError) throw error;
    throw new GraphError(503, correlationId);
  }
}
