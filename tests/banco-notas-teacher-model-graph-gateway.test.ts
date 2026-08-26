import { describe, expect, it, vi } from 'vitest';
import {
  createTeacherModelGraphGateway,
  teacherModelGraphTargetFromEnv,
} from '../server/banco-notas/teacher-model-graph-gateway';
import { testEnv } from './fixtures';

describe('Banco de Notas TeacherModelGraphGateway adapter', () => {
  it('handles the secure model lifecycle', async () => {
    const content = new TextEncoder().encode('synthetic-xlsx-content');
    const recipientEntraObjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const tokenProvider = vi.fn(async () => 'graph-token');
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const uploadPath = '/items/parent-id:/Modelo%20Professor%202026.xlsx:/content';

      if (method === 'PUT' && url.endsWith(uploadPath)) {
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer graph-token');
        expect(headers.get('Content-Type')).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        const body = init?.body;
        expect(body).toBeDefined();
        expect(Array.from(new Uint8Array(body as ArrayBuffer))).toEqual(Array.from(content));
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
        const metadata = {
          id: 'item-1',
          eTag: '"etag-2"',
          size: content.byteLength,
        };
        return new Response(JSON.stringify(metadata), { status: 200 });
      }

      if (method === 'GET' && url.endsWith('/items/item-1/content')) {
        return new Response(new Uint8Array(content), { status: 200 });
      }

      const permissionPath = '/items/item-1/permissions/permission-1';
      if (method === 'DELETE' && url.endsWith(permissionPath)) {
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
    expect(metadata).toEqual({ etag: '"etag-2"', size: content.byteLength });

    const downloaded = await gateway.download({
      driveItemId: stored.driveItemId,
      correlationId: 'correlation-1',
    });
    expect(Array.from(downloaded)).toEqual(Array.from(content));

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

  it('rejects a different Entra recipient', async () => {
    const response = {
      value: [
        {
          id: 'permission-wrong',
          grantedToV2: { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
        },
      ],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
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

  it('rejects unsafe and non-XLSX filenames', async () => {
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

  it('requires both Graph target identifiers from configuration', () => {
    expect(() => teacherModelGraphTargetFromEnv(testEnv)).toThrow();
    expect(
      teacherModelGraphTargetFromEnv({
        ...testEnv,
        BANCO_NOTAS_GRAPH_DRIVE_ID: 'drive-id',
        BANCO_NOTAS_GRAPH_PARENT_ITEM_ID: 'parent-id',
      }),
    ).toEqual({ driveId: 'drive-id', parentItemId: 'parent-id' });
  });
});
