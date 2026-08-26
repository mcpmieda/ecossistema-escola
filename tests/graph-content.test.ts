import { describe, expect, it, vi } from 'vitest';
import { GraphError, graphContentRequest } from '../server/graph/client';
import { testEnv } from './fixtures';

describe('Graph binary content transport', () => {
  it('uploads the exact binary body with the declared content type', async () => {
    const payload = new Uint8Array([0, 1, 2, 127, 128, 255]);
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = init?.body;
      expect(body).toBeInstanceOf(Blob);
      expect(new Uint8Array(await (body as Blob).arrayBuffer())).toEqual(payload);
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/x-test');
      return new Response(JSON.stringify({ id: 'item-1' }), { status: 201 });
    });

    const result = await graphContentRequest({
      env: testEnv,
      path: '/drives/drive/items/parent:/model.xlsx:/content',
      method: 'PUT',
      body: payload,
      contentType: 'application/x-test',
      token: 'token',
      dependencies: { fetch: fetchMock, sleep: async () => undefined },
    });

    expect(result.response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requires an explicit content type for binary PUT', async () => {
    await expect(
      graphContentRequest({
        env: testEnv,
        path: '/x',
        method: 'PUT',
        body: new Uint8Array([1]),
        token: 'token',
        dependencies: { fetch: vi.fn<typeof fetch>(), sleep: async () => undefined },
      }),
    ).rejects.toThrow('requires contentType');
  });

  it('retries transient Graph content failures and preserves the correlation id', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const result = await graphContentRequest({
      env: testEnv,
      path: '/drives/drive/items/item/content',
      method: 'GET',
      correlationId: 'correlation-1',
      token: 'token',
      dependencies: { fetch: fetchMock, sleep },
    });

    expect(result.correlationId).toBe('correlation-1');
    expect(new Uint8Array(await result.response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('fails without retry on non-transient authorization errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 403 }));

    await expect(
      graphContentRequest({
        env: testEnv,
        path: '/x',
        method: 'GET',
        token: 'token',
        dependencies: { fetch: fetchMock, sleep: async () => undefined },
      }),
    ).rejects.toBeInstanceOf(GraphError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
