import { afterEach, expect, it, vi } from 'vitest';
import { createPortraitClientV1 } from '../../../src/features/student-portal/photos/portrait-client-v1';
import { photoAccountV1, otherPhotoAccountV1, photoMetadataFixtureV1 as metadata,
  syntheticWebpV1 } from './fixture-v1';

const json = (value: unknown = metadata) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const image = () => new Response(new Uint8Array(syntheticWebpV1()).buffer, { headers: { 'Content-Type': 'image/webp' } });
const signal = () => new AbortController().signal;
const src = 'blob:https://aluno.escolaieda.com/synthetic-photo';
afterEach(() => vi.useRealTimers());

it('uses only two own-origin bounded reads and one disposable object, never source URLs or credentials', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValueOnce(json()).mockResolvedValueOnce(image());
  const create = vi.fn<(blob: Blob) => string>().mockReturnValue(src), revoke = vi.fn(), decode = vi.fn(async () => true);
  const load = createPortraitClientV1({ fetch: send, createObjectURL: create, revokeObjectURL: revoke, decode });
  const result = await load(photoAccountV1, signal());
  expect(result?.src).toBe(src);
  expect(send.mock.calls.map(call => call[0])).toEqual(['/api/student/photo', '/api/student/photo/content?v=' + metadata.revision]);
  for (const [, init] of send.mock.calls) expect(init).toMatchObject({ credentials: 'same-origin', redirect: 'error', cache: 'no-store', method: 'GET' });
  expect(create).toHaveBeenCalledTimes(1); expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  expect(decode).toHaveBeenCalledTimes(1); expect(revoke).not.toHaveBeenCalled();
  result?.dispose(); result?.dispose(); expect(revoke).toHaveBeenCalledTimes(1);
});

it.each([204, 401, 403, 404, 429, 503])('treats metadata status %i as no portrait without requesting bytes', async status => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
  const create = vi.fn(() => src);
  expect(await createPortraitClientV1({ fetch: send, createObjectURL: create })(photoAccountV1, signal())).toBeUndefined();
  expect(send).toHaveBeenCalledTimes(1); expect(create).not.toHaveBeenCalled();
});

it('refuses a different session account and an injected storage locator before fetching content', async () => {
  for (const value of [{ ...metadata, accountId: otherPhotoAccountV1 }, { ...metadata, url: 'https://storage.invalid/private' }, { ...metadata, width: 901 }]) {
    const send = vi.fn<typeof fetch>().mockResolvedValue(json(value));
    expect(await createPortraitClientV1({ fetch: send })(photoAccountV1, signal())).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  }
});

it('rejects an oversized stream even without Content-Length and rejects an unexpected content type', async () => {
  for (const response of [new Response(new Uint8Array(131073), { headers: { 'Content-Type': 'image/webp' } }),
    new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    new Response(null, { status: 404 })]) {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(json()).mockResolvedValueOnce(response);
    const create = vi.fn(() => src);
    expect(await createPortraitClientV1({ fetch: send, createObjectURL: create })(photoAccountV1, signal())).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  }
});

it('removes a corrupt or dimension-mismatched image before returning portraitSrc', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValueOnce(json()).mockResolvedValueOnce(image());
  const revoke = vi.fn();
  const client = createPortraitClientV1({ fetch: send, createObjectURL: () => src, revokeObjectURL: revoke, decode: async () => false });
  expect(await client(photoAccountV1, signal())).toBeUndefined(); expect(revoke).toHaveBeenCalledWith(src);
});

it('aborts a pending request at the deadline instead of retrying or holding the notes screen', async () => {
  vi.useFakeTimers();
  const send = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('synthetic-abort')), { once: true });
  }));
  const pending = createPortraitClientV1({ fetch: send, timeoutMs: 100 })(photoAccountV1, signal());
  await vi.advanceTimersByTimeAsync(101);
  expect(await pending).toBeUndefined(); expect(send).toHaveBeenCalledTimes(1);
});

it('does not begin a request for an already-cancelled scope', async () => {
  const controller = new AbortController(); controller.abort();
  const send = vi.fn<typeof fetch>();
  expect(await createPortraitClientV1({ fetch: send })(photoAccountV1, controller.signal)).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});
