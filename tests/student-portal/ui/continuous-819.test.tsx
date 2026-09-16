// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  collectCursorPagesV1,
  useContinuousReadV1,
  ContinuousEndV1,
} from '../../../src/features/student-portal-admin/shared/continuous-read-v1';
import { PortalClientErrorV1 } from '../../../src/features/student-portal/shared/transport-v1';
import { setupOperationsDomV1 } from './overview/dom-v1';
const signal = () => new AbortController().signal;
const row = (id: number) => ({ id, name: `SYNTHETIC ${id}` });
beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('returns the first100 rows after one bounded request and keeps the continuation', async () => {
  const page = vi.fn(async (cursor?: string) =>
    cursor
      ? { items: Array.from({ length: 5 }, (_, i) => row(101 + i)), nextCursor: null }
      : { items: Array.from({ length: 100 }, (_, i) => row(1 + i)), nextCursor: 'page2' },
  );
  const result = await collectCursorPagesV1(page, signal(), 'id');
  expect(result.items).toHaveLength(100);
  expect(result.items[99]).toEqual(row(100));
  expect(result.nextCursor).toBe('page2');
  expect(page).toHaveBeenCalledTimes(1);
});
it('appends one100-row chunk on demand without dropping rows already rendered', async () => {
  const page = vi.fn(async (cursor?: string) => {
    const offset = Number(cursor ?? 0);
    return {
      items: Array.from({ length: Math.min(100, 1005 - offset) }, (_, i) => row(offset + i + 1)),
      nextCursor: offset + 100 >= 1005 ? null : String(offset + 100),
    };
  });
  const first = await collectCursorPagesV1(page, signal(), 'id');
  expect(first.items).toHaveLength(100);
  expect(page).toHaveBeenCalledTimes(1);
  const next = await collectCursorPagesV1(page, signal(), 'id', first);
  expect(next.items).toHaveLength(200);
  expect(next.items[0]).toEqual(row(1));
  expect(next.items[199]).toEqual(row(200));
  expect(next.nextCursor).toBe('200');
  expect(page).toHaveBeenCalledTimes(2);
});
it('deduplicates overlapping rows by ID while rejecting repeated cursor loops and invalid records', async () => {
  const overlap = await collectCursorPagesV1(
    async (c) =>
      c
        ? { items: [{ ...row(1), name: 'CHANGED' }, row(2)], nextCursor: null }
        : { items: [row(1)], nextCursor: 'p2' },
    signal(),
    'id',
  );
  expect(overlap.items).toEqual([{ ...row(1), name: 'CHANGED' }, row(2)]);
  await expect(
    collectCursorPagesV1(async () => ({ items: [], nextCursor: 'loop' }), signal(), 'id'),
  ).rejects.toMatchObject({ state: 'invalid-response' });
  await expect(
    collectCursorPagesV1(
      async () => ({ items: [{ missing: 1 }], nextCursor: null }),
      signal(),
      'id',
    ),
  ).rejects.toMatchObject({ state: 'invalid-response' });
});
it('keeps a continuation on many empty filtered pages instead of reporting an empty complete list', async () => {
  let count = 0;
  const page = vi.fn(async () => ({ items: [], nextCursor: String(++count) }));
  const result = await collectCursorPagesV1(page, signal(), 'id');
  expect(result.items).toEqual([]);
  expect(result.nextCursor).toBe('20');
  expect(page).toHaveBeenCalledTimes(20);
});
it('does not accept a late page after cancellation', async () => {
  let finish!: (p: { items: ReturnType<typeof row>[]; nextCursor: null }) => void;
  const controller = new AbortController();
  const result = collectCursorPagesV1(
    () =>
      new Promise<{ items: ReturnType<typeof row>[]; nextCursor: null }>((r) => {
        finish = r;
      }),
    controller.signal,
    'id',
  );
  const check = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  finish({ items: [row(1)], nextCursor: null });
  await check;
});
it('retains the last result during refresh but clears it on authorization loss and context changes', async () => {
  const first = { items: [row(1)], nextCursor: null };
  const lost = vi.fn();
  const page = vi.fn().mockResolvedValue(first);
  const view = renderHook(({ load }) => useContinuousReadV1(load, 'id', lost), {
    initialProps: { load: page },
  });
  await waitFor(() => expect(view.result.current.state.state).toBe('ready'));
  let finish!: (p: typeof first) => void;
  page.mockImplementationOnce(
    () =>
      new Promise<{ items: ReturnType<typeof row>[]; nextCursor: null }>((r) => {
        finish = r;
      }),
  );
  act(() => view.result.current.reload());
  expect(view.result.current.state).toMatchObject({ state: 'ready', data: first });
  await act(async () => finish({ items: [row(2)], nextCursor: null }));
  await waitFor(() =>
    expect(view.result.current.state).toMatchObject({ state: 'ready', data: { items: [row(2)] } }),
  );
  page.mockRejectedValueOnce(new PortalClientErrorV1('forbidden', 403));
  act(() => view.result.current.reload());
  await waitFor(() => expect(view.result.current.state.state).toBe('error'));
  expect(lost).toHaveBeenCalledOnce();
  const next = vi.fn().mockResolvedValue({ items: [row(3)], nextCursor: null });
  view.rerender({ load: next });
  await waitFor(() =>
    expect(view.result.current.state).toMatchObject({ state: 'ready', data: { items: [row(3)] } }),
  );
});
it('loads the next chunk only when the sentinel approaches the viewport, without pagination buttons', async () => {
  let notify!: (entries: { isIntersecting: boolean }[]) => void;
  const disconnect = vi.fn();
  const load = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: typeof notify) {
        notify = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const view = render(<ContinuousEndV1 more busy={false} loadMore={load} />);
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByRole('button')).toBeNull();
  act(() => notify([{ isIntersecting: false }]));
  expect(load).not.toHaveBeenCalled();
  act(() => notify([{ isIntersecting: true }]));
  expect(load).toHaveBeenCalledOnce();
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
