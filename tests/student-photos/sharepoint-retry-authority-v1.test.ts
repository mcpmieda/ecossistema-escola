// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { SharePointPhotoTransportV1 } from '../../server/student-photos/sharepoint-write-v1';
import type { RuntimeEnv } from '../../server/env';
import { testEnv } from '../fixtures';

const library = { driveId: 'synthetic-drive', parentItemId: 'synthetic-folder' };
const parentPath = '/v1.0/drives/synthetic-drive/items/synthetic-folder';
const context = { studentUid: '10000000-0000-4000-8000-000000000001', actorId: '10000000-0000-4000-8000-000000000002' };

async function fixture(revoke: boolean) {
  // Transport-only header; successful pixel decoding is covered by the separate codec proof.
  const bytes = new Uint8Array(30), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF')); view.setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode('WEBPVP8 '), 8); view.setUint32(16, 10, true);
  bytes.set([0x9d, 1, 0x2a], 23); view.setUint16(26, 24, true); view.setUint16(28, 32, true);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const metadata = { width: 24, height: 32, byteSize: 30, sha256: hash };
  const asset = { ...metadata, driveId: library.driveId, itemId: 'synthetic-item', etag: '"synthetic-etag"' };
  let denied = false, attempts = 0;
  const seen: { method: string; etag: string | null }[] = [];
  const authorize = vi.fn(async () => { if (denied) throw new Error('synthetic-revoked'); });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    seen.push({ method, etag: new Headers(init?.headers).get('If-Match') });
    expect(url.origin).toBe('https://graph.microsoft.com');
    if (method === 'POST' || method === 'DELETE') {
      attempts++;
      if (attempts === 1) return new Response(null, { status: 429, headers: { 'Retry-After': '0' } });
      return new Response(null, { status: method === 'DELETE' ? 204 : 403 });
    }
    if (url.pathname === parentPath) return Response.json({ id: library.parentItemId, folder: {} });
    if (url.pathname.endsWith('/synthetic-item')) return Response.json({
      id: asset.itemId, name: 'synthetic.webp', size: 30, eTag: asset.etag,
      file: { mimeType: 'image/webp' }, parentReference: { driveId: library.driveId, id: library.parentItemId },
    });
    return new Response(null, { status: 404 });
  };
  const sleep = vi.fn(async () => { denied = revoke; });
  const transport = new SharePointPhotoTransportV1({
    env: { ...testEnv, SHAREPOINT_SITE_ID: 'synthetic.sharepoint.com,site,web' } as unknown as RuntimeEnv,
    library, authorize, token: 'synthetic-token', dependencies: { fetch: fetcher, sleep },
  });
  return { transport, authorize, sleep, seen, asset, bytes, metadata };
}

describe('authorization at each Graph write attempt', () => {
  it.each(['upload', 'remove'] as const)('stops a throttled %s before replay when permission changes during the wait', async kind => {
    const f = await fixture(true), signal = new AbortController().signal;
    const result = kind === 'remove' ? f.transport.remove(f.asset, signal) : f.transport.upload({
      context, requestId: '20000000-0000-4000-8000-000000000001', variant: 'portrait',
      bytes: f.bytes, metadata: f.metadata, signal,
    });
    await expect(result).rejects.toMatchObject({ status: 403, message: 'Graph request failed (403)' });
    expect(f.sleep).toHaveBeenCalledOnce();
    expect(f.seen.filter(c => c.method !== 'GET')).toHaveLength(1);
    expect(f.seen.some(c => c.method === 'PUT')).toBe(false);
    expect(f.authorize.mock.results.at(-1)?.type).toBe('return');
  });

  it('retains Retry-After behavior and the exact ETag when authority remains valid', async () => {
    const f = await fixture(false);
    await expect(f.transport.remove(f.asset, new AbortController().signal)).resolves.toBe('deleted');
    expect(f.sleep).toHaveBeenCalledOnce();
    expect(f.seen.filter(c => c.method === 'DELETE')).toEqual([
      { method: 'DELETE', etag: f.asset.etag }, { method: 'DELETE', etag: f.asset.etag },
    ]);
    expect(f.authorize).toHaveBeenCalledTimes(4);
  });
});
