import { describe, expect, it, vi } from 'vitest';
import { createTeacherModelGraphGateway } from '../server/banco-notas/teacher-model-graph-gateway';
import { testEnv } from './fixtures';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

describe('Banco de Notas TeacherModelGraphGateway adapter', () => {
  it('uploads XLSX, grants the exact signed-in recipient, downloads for SHA-256 verification, and supports compensation', async () => {
    const content = new TextEncoder().encode('synthetic-xlsx-content');
    const recipientEntraObjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const tokenProvider = vi.fn(async () => 'graph-token');
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (
        method === 'PUT' &&
        url.endsWith('/items/parent-id:/Modelo%20Professor%202026.xlsx:/content')
      ) {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer graph-token');
        expect(new Headers(init?.headers).get('Content-Type')).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        expect(new Uint8Array(await (init?.body as Blob).arrayBuffer())).toEqual(content);
        return new Response(JSON.stringify({ id: 'item-1', eTag: '"etag-1"' }), {
          status: 201,
        });
      }

      if (method === 'POST' && url.endsWith('/items/item-1/invite')) {
        const body = JSON.parse(String(init?.body)) as {
          recipients: Array<{ email: string }>;
          requireSignIn: boolean;
          sendInvitation: boolean;
          roles: string[];
        };
        expect(body).toEqual({
          recipients: [{ email: 'professor@example.com' }],
          requireSignIn: true,
          sendInvitation: false,
          roles: ['write'],
        });
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 'permission-1',
                grantedToV2: { user: { id: recipientEntraObjectId } },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (method === 'GET' && url.endsWith('/items/item-1?$select=id,eTag,size')) {
        return new Response(
          JSON.stringify({ id: 'item-1', eTag: '"etag-2"', size: content.byteLength }),
          { status: 200 },
        );
      }

      if (method === 'GET' && url.endsWith('/items/item-1/content')) {
        return new Response(new Uint8Array(content), { status: 200 });
      }

      if (method === 'DELETE' && url.endsWith('/items/item-1/permissions/permission-1')) {
        return new Response(null, { status: 204 });
      }

      if (method === 'DELETE' && url.endsWith('/items/item-1')) {
        return new Response(null, { status: 204 });
      }

      throw new Error(`unexpected_graph_request:${method}:${url}`);
    });
    const gateway = createTeacherModelGraphGateway({
      env: testEnv,
      target: { driveId: 'drive-id', parentItemId: 'parent-id' },
      dependencies: {
        tokenProvider,
        graph: { fetch: fetchMock, sleep: async () => undefined },
      },
    });

    const stored = await gateway.store({
      fileName: 'Modelo Professor 2026.xlsx',
      content,
      correlationId: 'correlation-1',
    });
    expect(stored).toEqual({ driveItemId: 'item-1', etag: '"etag-1"' });

    const shared = await gateway.share({
      driveItemId: stored.driveItemId,
      recipientEntraObjectId,
      recipientUpn: 'professor@example.com',
      correlationId: 'correlation-1',
      requireSignIn: true,
    });
    expect(shared).toEqual({ permissionId: 'permission-1' });

    const metadata = await gateway.metadata({
      driveItemId: stored.driveItemId,
      correlationId: 'correlation-1',
    });
    expect(metadata).toEqual({
      etag: '"etag-2"',
      size: content.byteLength,
      sha256: await sha256Hex(content),
    });

    await gateway.revokeShare({
      driveItemId: stored.driveItemId,
      permissionId: shared.permissionId,
      correlationId: 'correlation-1',
    });
    await gateway.remove({
      driveItemId: stored.driveItemId,
      correlationId: 'correlation-1',
    });

    expect(tokenProvider).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('fails closed when Graph resolves the invitation to a different Entra identity', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              id: 'permission-wrong',
              grantedToV2: { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const gateway = createTeacherModelGraphGateway({
      env: testEnv,
      target: { driveId: 'drive-id', parentItemId: 'parent-id' },
      dependencies: {
        tokenProvider: async () => 'graph-token',
        graph: { fetch: fetchMock, sleep: async () => undefined },
      },
    });

    await expect(
      gateway.share({
        driveItemId: 'item-1',
        recipientEntraObjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recipientUpn: 'professor@example.com',
        correlationId: 'correlation-2',
        requireSignIn: true,
      }),
    ).rejects.toThrow('teacher_model_graph_recipient_identity_mismatch');
  });

  it('rejects unsafe or non-XLSX filenames before touching Graph', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const gateway = createTeacherModelGraphGateway({
      env: testEnv,
      target: { driveId: 'drive-id', parentItemId: 'parent-id' },
      dependencies: {
        tokenProvider: async () => 'graph-token',
        graph: { fetch: fetchMock, sleep: async () => undefined },
      },
    });

    await expect(
      gateway.store({
        fileName: '../modelo.xlsx',
        content: new Uint8Array([1]),
        correlationId: 'correlation-3',
      }),
    ).rejects.toThrow('teacher_model_graph_filename_unsafe');
    await expect(
      gateway.store({
        fileName: 'modelo.xlsb',
        content: new Uint8Array([1]),
        correlationId: 'correlation-4',
      }),
    ).rejects.toThrow('teacher_model_graph_filename_not_xlsx');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
