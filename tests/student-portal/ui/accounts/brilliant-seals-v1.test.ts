import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useSealCountsV1,
  type SealReadStateV1,
} from '../../../../src/features/student-portal-admin/accounts/brilliant-seals-v1';
import type { PortalAdminReadClientV2 } from '../../../../src/features/student-portal-admin/accounts/accounts-client-v2';
import { PortalClientErrorV1 } from '../../../../src/features/student-portal/shared/transport-v1';
import { notifyLiveChangeV1 } from '../../../../src/shared/live-data/live-refresh-v1';
import { accountIdV1, ACCOUNT_META_V1 } from './fixtures-v1';

const response = (classId: number) => ({
  contractVersion: 2 as const,
  requestId: ACCOUNT_META_V1.requestId,
  observedAt: '2026-10-01T15:00:00Z',
  state: 'seals-read' as const,
  items: [{ accountId: accountIdV1(classId), seals: classId }],
});
function readerFixture() {
  const query = vi
    .fn<PortalAdminReadClientV2['query']>()
    .mockImplementation(async (input) =>
      response(input.scope.kind === 'class' ? input.scope.classId : 1),
    );
  return { query };
}
function counts(state: SealReadStateV1) {
  if (state.state !== 'ready') throw new Error('Synthetic counts not ready');
  return state.counts;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('list seal preparation and scoped memory', () => {
  it('reuses prepared counts across class discovery, order and target changes', async () => {
    const reader = readerFixture();
    const view = renderHook(({ ids }) => useSealCountsV1(reader, { classIds: ids }), {
      initialProps: { ids: [1] },
    });
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    view.rerender({ ids: [2, 1, 1] });
    await waitFor(() => expect(counts(view.result.current).size).toBe(2));
    expect(reader.query).toHaveBeenCalledTimes(2);
    view.rerender({ ids: [1, 2] });
    expect(counts(view.result.current).get(accountIdV1(2))).toBe(2);
    expect(reader.query).toHaveBeenCalledTimes(2);
    view.rerender({ ids: [1] });
    await waitFor(() => expect(counts(view.result.current).size).toBe(1));
    expect(reader.query).toHaveBeenCalledTimes(2);
  });

  it('refreshes expired counts when another class is discovered', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const reader = readerFixture();
    const view = renderHook(({ ids }) => useSealCountsV1(reader, { classIds: ids }), {
      initialProps: { ids: [1] },
    });
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    now = 60_001;
    view.rerender({ ids: [1, 2] });
    await waitFor(() => expect(counts(view.result.current).size).toBe(2));
    expect(reader.query).toHaveBeenCalledTimes(3);
  });

  it('joins a pending class read when the next account page discovers another class', async () => {
    const reader = readerFixture();
    const pending = new Map<number, (value: ReturnType<typeof response>) => void>();
    reader.query.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          if (input.scope.kind !== 'class') throw new Error('Unexpected synthetic scope');
          pending.set(input.scope.classId, resolve);
        }),
    );
    const view = renderHook(({ ids }) => useSealCountsV1(reader, { classIds: ids }), {
      initialProps: { ids: [1] },
    });
    await waitFor(() => expect(pending.has(1)).toBe(true));
    view.rerender({ ids: [1, 2] });
    await waitFor(() => expect(pending.has(2)).toBe(true));
    expect(reader.query).toHaveBeenCalledTimes(2);
    expect(reader.query.mock.calls[0]?.[1]?.aborted).toBe(false);
    await act(async () => {
      pending.get(1)!(response(1));
      pending.get(2)!(response(2));
    });
    expect(counts(view.result.current).size).toBe(2);
    expect(reader.query).toHaveBeenCalledTimes(2);
  });

  it('invalidates memory on academic changes even while automatic reads are paused', async () => {
    const reader = readerFixture();
    const view = renderHook(
      ({ ids, active }) => useSealCountsV1(reader, { classIds: ids }, { active }),
      {
        initialProps: { ids: [1], active: true },
      },
    );
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    view.rerender({ ids: [1], active: false });
    act(() => notifyLiveChangeV1('gradebook', { broadcast: false }));
    view.rerender({ ids: [1, 2], active: false });
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    expect(reader.query).toHaveBeenCalledTimes(1);
    view.rerender({ ids: [1, 2], active: true });
    await waitFor(() => expect(counts(view.result.current).size).toBe(2));
    expect(reader.query).toHaveBeenCalledTimes(3);
  });

  it('revalidates counts when the authoritative list revision changes', async () => {
    const reader = readerFixture();
    const view = renderHook(
      ({ revision }) => useSealCountsV1(reader, { classIds: [1] }, { revision }),
      {
        initialProps: { revision: 1 },
      },
    );
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    view.rerender({ revision: 2 });
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    expect(reader.query).toHaveBeenCalledTimes(2);
  });

  it('limits requests to two classes in flight', async () => {
    const reader = readerFixture();
    const pending = new Map<number, (value: ReturnType<typeof response>) => void>();
    reader.query.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          if (input.scope.kind !== 'class') throw new Error('Unexpected synthetic scope');
          pending.set(input.scope.classId, resolve);
        }),
    );
    const view = renderHook(() => useSealCountsV1(reader, { classIds: [1, 2, 3] }));
    await waitFor(() => expect(pending.size).toBe(2));
    expect(pending.has(3)).toBe(false);
    await act(async () => pending.get(1)!(response(1)));
    await waitFor(() => expect(pending.has(3)).toBe(true));
    await act(async () => {
      pending.get(2)!(response(2));
      pending.get(3)!(response(3));
    });
    expect(counts(view.result.current).size).toBe(3);
  });

  it('clears denied counts and does not reuse them after a new target', async () => {
    const reader = readerFixture();
    const view = renderHook(({ ids }) => useSealCountsV1(reader, { classIds: ids }), {
      initialProps: { ids: [1] },
    });
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    reader.query.mockRejectedValueOnce(new PortalClientErrorV1('forbidden'));
    view.rerender({ ids: [1, 2] });
    await waitFor(() => expect(view.result.current.state).toBe('error'));
    view.rerender({ ids: [1] });
    await waitFor(() => expect(view.result.current.state).toBe('ready'));
    expect(reader.query).toHaveBeenCalledTimes(3);
  });
});
