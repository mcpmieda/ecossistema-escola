import { describe, expect, it } from 'vitest';
import {
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
  let title = '';
  let patchCount = 0;

  const graph: GraphCall = async <T>(input: RecoveryGraphInput) => {
    const method = input.method ?? 'GET';
    calls.push({ path: input.path, method, body: input.body });

    if (method === 'POST' && input.path.endsWith('/lists')) {
      const body = input.body as { displayName: string };
      return {
        data: { id: 'list-1', displayName: body.displayName } as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'POST' && input.path.endsWith('/items')) {
      const body = input.body as { fields: { Title: string } };
      title = body.fields.Title;
      return {
        data: { id: 'item-1' } as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'PATCH' && input.path.endsWith('/fields')) {
      patchCount += 1;
      const body = input.body as { Title: string };
      title = options.corruptRestore && patchCount === 2 ? 'unexpected-restored-value' : body.Title;
      return {
        data: null as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'GET' && input.path.includes('/items/item-1?')) {
      return {
        data: { id: 'item-1', fields: { Title: title } } as T,
        etag: null,
        correlationId: input.correlationId ?? 'test-correlation',
      };
    }

    if (method === 'DELETE' && input.path.endsWith('/lists/list-1')) {
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
  it('backs up, corrupts, restores and deletes only the disposable resource', async () => {
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

    const createList = calls[0]!;
    expect(createList.method).toBe('POST');
    expect(createList.path).toBe(`/sites/${testEnv.SHAREPOINT_SITE_ID}/lists`);
    expect(createList.body).toMatchObject({
      displayName: `${RECOVERY_TEST_PREFIX}abc123`,
      list: { template: 'genericList' },
    });

    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2);
    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `/sites/${testEnv.SHAREPOINT_SITE_ID}/lists/list-1`,
    });
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
      path: `/sites/${testEnv.SHAREPOINT_SITE_ID}/lists/list-1`,
    });
  });

  it('does not report verification when cleanup of the disposable list fails', async () => {
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
