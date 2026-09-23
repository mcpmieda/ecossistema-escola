// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { readSharePointPhotoV1 } from '../../server/student-photos/sharepoint-download-v1';
import type { RuntimeEnv } from '../../server/env';
import { testEnv } from '../fixtures';
// Production Wrangler literals are replaced only in this isolated, fully mocked fixture.
const env = { ...testEnv, SHAREPOINT_SITE_ID: 'synthetic-school.sharepoint.com,synthetic-site,synthetic-web' } as unknown as RuntimeEnv;
const download = 'https://synthetic-school.sharepoint.com/_layouts/download.aspx?token=SYNTHETIC';
const metadata = { id: 'ITEM_A', eTag: '"synthetic-etag-1"', size: 24, file: { mimeType: 'image/webp' },
  parentReference: { driveId: 'DRIVE_A' }, '@microsoft.graph.downloadUrl': download };
const json = (value: unknown) => Response.json(value);
const payload = () => new Response(new Uint8Array(24), { headers: { 'content-type': 'application/octet-stream', 'content-length': '24' } });
const run = (fetch: typeof globalThis.fetch, extra = {}) => readSharePointPhotoV1({ env, driveId: 'DRIVE_A', itemId: 'ITEM_A',
  token: 'SYNTHETIC_GRAPH_TOKEN', dependencies: { fetch, sleep: async () => undefined }, ...extra });
it('uses Graph only for metadata and never sends its bearer, cookies or redirect follow to the download', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(metadata)).mockResolvedValueOnce(payload())
    .mockResolvedValueOnce(json(metadata));
  const result = await run(fetch);
  expect(result.bytes.length).toBe(24); expect(result.etag).toBe(metadata.eTag);
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer SYNTHETIC_GRAPH_TOKEN');
  const request = fetch.mock.calls[1]!; expect(request[0]).toBe(download);
  expect(request[1]?.redirect).toBe('manual'); expect(request[1]?.credentials).toBe('omit');
  const headers = new Headers(request[1]?.headers);
  for (const name of ['authorization', 'cookie', 'referer', 'client-request-id']) expect(headers.has(name)).toBe(false);
});
it.each(['https://other.sharepoint.com/file', 'https://synthetic-school.sharepoint.com.attacker.invalid/file',
  'http://synthetic-school.sharepoint.com/file', 'https://user:password@synthetic-school.sharepoint.com/file',
  'https://synthetic-school.sharepoint.com:444/file', 'https://127.0.0.1/file', 'file:///tmp/photo'])('refuses foreign or ambiguous destination %s before download', async destination => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ ...metadata, '@microsoft.graph.downloadUrl': destination }));
  await expect(run(fetch)).rejects.toMatchObject({ status: 502 }); expect(fetch).toHaveBeenCalledOnce();
});
it('validates every redirect, including a later one to another tenant', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(metadata))
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/allowed-relative' } }))
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://other.sharepoint.com/file' } }));
  await expect(run(fetch)).rejects.toMatchObject({ status: 502 }); expect(fetch).toHaveBeenCalledTimes(3);
  expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).has('authorization')).toBe(false);
});
it('caps redirect loops and never retries an unsigned redirect using Graph credentials', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(metadata))
    .mockImplementation(async () => new Response(null, { status: 302, headers: { location: download } }));
  await expect(run(fetch)).rejects.toMatchObject({ status: 502 }); expect(fetch).toHaveBeenCalledTimes(4);
});
it('rejects stale expected revisions before download and changes that happen during download', async () => {
  const first = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(metadata));
  await expect(run(first, { expectedETag: '"old"' })).rejects.toMatchObject({ status: 412 }); expect(first).toHaveBeenCalledOnce();
  const changed = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(metadata)).mockResolvedValueOnce(payload())
    .mockResolvedValueOnce(json({ ...metadata, eTag: '"changed"' }));
  await expect(run(changed)).rejects.toMatchObject({ status: 409 });
});
it('rejects another drive, bad media type and oversized metadata without touching the signed URL', async () => {
  for (const change of [{ parentReference: { driveId: 'OTHER' } }, { file: { mimeType: 'image/svg+xml' } }, { size: 2097153 }]) {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ ...metadata, ...change }));
    await expect(run(fetch)).rejects.toMatchObject({ status: 502 }); expect(fetch).toHaveBeenCalledOnce();
  }
});
it('caps actual streamed bytes even without Content-Length and rejects truncation or ranges', async () => {
  for (const response of [new Response(new Uint8Array(25)), new Response(new Uint8Array(23)), new Response(new Uint8Array(24), { status: 206 })]) {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(metadata)).mockResolvedValueOnce(response);
    await expect(run(fetch)).rejects.toMatchObject({ status: 502 }); expect(fetch).toHaveBeenCalledTimes(2);
  }
});
it('performs no request when already cancelled', async () => {
  const controller = new AbortController(); controller.abort(); const fetch = vi.fn<typeof globalThis.fetch>();
  await expect(run(fetch, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(fetch).not.toHaveBeenCalled();
});
