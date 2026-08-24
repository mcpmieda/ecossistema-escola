import { describe, expect, it, vi } from 'vitest';
import { GraphError, graphBatch, graphRequest } from '../server/graph/client';
import { testEnv } from './fixtures';

describe('Graph client resilience', () => {
  it('returns JSON and ETag on success', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ETag: '"1"' } }),
      );
    const result = await graphRequest<{ ok: boolean }>({
      env: testEnv,
      path: '/x',
      token: 'token',
      dependencies: { fetch: fetchMock, sleep: async () => undefined },
    });
    expect(result.data.ok).toBe(true);
    expect(result.etag).toBe('"1"');
  });
  it('sends If-Match for controlled updates', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await graphRequest({
      env: testEnv,
      path: '/x',
      method: 'PATCH',
      body: { x: 1 },
      etag: '"4"',
      token: 'token',
      dependencies: { fetch: fetchMock, sleep: async () => undefined },
    });
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('If-Match')).toBe('"4"');
  });
  it('surfaces 412 conflicts without retry', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 412 }));
    await expect(
      graphRequest({
        env: testEnv,
        path: '/x',
        token: 'token',
        dependencies: { fetch: fetchMock, sleep: async () => undefined },
      }),
    ).rejects.toBeInstanceOf(GraphError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('retries 429 without an infinite loop', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    await graphRequest({
      env: testEnv,
      path: '/x',
      token: 'token',
      dependencies: { fetch: fetchMock, sleep },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it('respects Retry-After', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    await graphRequest({
      env: testEnv,
      path: '/x',
      token: 'token',
      dependencies: { fetch: fetchMock, sleep },
    });
    expect(sleep.mock.calls[0]![0]).toBeGreaterThanOrEqual(2000);
  });
  it('stops after five transient failures', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(
      graphRequest({
        env: testEnv,
        path: '/x',
        token: 'token',
        dependencies: { fetch: fetchMock, sleep: async () => undefined },
      }),
    ).rejects.toBeInstanceOf(GraphError);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
  it('rejects batches larger than the current limit', async () => {
    const requests = Array.from({ length: 21 }, (_, i) => ({
      id: String(i),
      method: 'GET',
      url: '/me',
    }));
    await expect(graphBatch(testEnv, requests)).rejects.toThrow('1 to 20');
  });
  it('rejects empty batches', async () =>
    await expect(graphBatch(testEnv, [])).rejects.toThrow('1 to 20'));
});
