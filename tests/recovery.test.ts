import { describe, expect, it } from 'vitest';
import {
  RECOVERY_SNAPSHOT_LIBRARY,
  RECOVERY_TEST_PREFIX,
  RECOVERY_TEST_SCOPE,
  type GraphCall,
  type RecoveryGraphInput,
  verifyRecoveryRoundTrip,
} from '../server/platform/recovery';
import { testEnv } from './fixtures';

type Call = {
  path: string;
  method: string;
  body: unknown;
};

function successfulGraph(options: { corruptRestore?: boolean; failCleanup?: boolean } = {}) {
  const calls: Call[] = [];
  let modulo = '';
  let patchCount = 0;

  const graph: GraphCall = async <T>(input: RecoveryGraphInput) => {
    const method = input.method ?? 'GET';
    calls.push({ path: input.path, method, body: input.body });

    if (method === 'GET' && input.path.includes('/lists?$filter=')) {
      return {
        data: {
          value: [{ id: 'snapshots-list', displayName: RECOVERY_SNAPSHOT_LIBRARY }],
        } as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'GET' && input.path.includes('/lists/snapshots-list/drive?')) {
      return {
        data: { id: 'snapshots-drive' } as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'POST' && input.path.endsWith('/drives/snapshots-drive/root/children')) {
      const body = input.body as { name: string };
      return {
        data: { id: 'folder-1', name: body.name } as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'PATCH' && input.path.endsWith('/listItem/fields')) {
      patchCount += 1;
      const body = input.body as { Modulo?: string };
      if (body.Modulo !== undefined) {
        modulo = options.corruptRestore && patchCount === 3 ? 'unexpected-restored-value' : body.Modulo;
      }
      return {
        data: null as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'GET' && input.path.includes('/items/folder-1/listItem?')) {
      return {
        data: { id: 'item-1', fields: { Modulo: modulo } } as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'DELETE' && input.path.endsWith('/drives/snapshots-drive/items/folder-1')) {
      if (options.failCleanup) throw new Error('cleanup failed');
      return {
        data: null as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    throw new Error(`Unexpected Graph call: ${method} ${input.path}`);
  };

  return { graph, calls };
}

describe('recovery verification', () => {
  it('backs up, corrupts, restores and deletes only the disposable snapshot folder', async () => {
    const { graph, calls } = successfulGraph();
    const verifiedAt = new Date('2026-08-24T23:00:00.000Z');

    const result = await verifyRecoveryRoundTrip(
      testEnv,
      graph,
      () => verifiedAt,
      () => 'abc-123',
    );

    expect(result).toMatchObject({
      status: 'verified',
      scope: RECOVERY_TEST_SCOPE,
      verifiedAt: verifiedAt.toISOString(),
      restoreMatched: true,
      cleanup: 'deleted',
    });
    expect(result.backupChecksum).toBe(result.restoredChecksum);
    expect(result.backupChecksum).toMatch(/^[a-f0-9]{64}$/u);

    const createFolder = calls.find((call) => call.method === 'POST')!;
    expect(createFolder.path).toBe('/drives/snapshots-drive/root/children');
    expect(createFolder.body).toMatchObject({
      name: `${RECOVERY_TEST_PREFIX}abc123`,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    });

    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(3);
    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/drives/snapshots-drive/items/folder-1',
    });
    expect(
      calls.some(
        (call) =>
          call.method === 'POST' &&
          call.path === `/sites/${testEnv.SHAREPOINT_SITE_ID}/lists`,
      ),
    ).toBe(false);
  });

  it('fails closed when the restored value does not match the backup checksum and still cleans up', async () => {
    const { graph, calls } = successfulGraph({ corruptRestore: true });

    await expect(
      verifyRecoveryRoundTrip(
        testEnv,
        graph,
        () => new Date(),
        () => 'mismatch',
      ),
    ).rejects.toThrow('Recovery restore checksum mismatch');

    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/drives/snapshots-drive/items/folder-1',
    });
  });

  it('does not report verification when cleanup of the disposable folder fails', async () => {
    const { graph } = successfulGraph({ failCleanup: true });

    await expect(
      verifyRecoveryRoundTrip(
        testEnv,
        graph,
        () => new Date(),
        () => 'cleanup',
      ),
    ).rejects.toThrow('cleanup failed');
  });

  it('rejects a resource suffix that becomes empty before any Graph mutation', async () => {
    const { graph, calls } = successfulGraph();

    await expect(
      verifyRecoveryRoundTrip(
        testEnv,
        graph,
        () => new Date(),
        () => '---',
      ),
    ).rejects.toThrow('safe resource suffix');

    expect(calls).toHaveLength(0);
  });
});
