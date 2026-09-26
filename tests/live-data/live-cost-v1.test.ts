// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  notifyLiveChangeV1,
  registerLiveConnectionV1,
  subscribeLiveRefreshV1,
} from '../../src/shared/live-data/live-refresh-v1';
import { createLatestPortalRequestV1 } from '../../src/features/student-portal/shared/latest-request-v1';
import { mockSecureJitterV1 } from './secure-jitter-fixture';

const dispose: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  mockSecureJitterV1(0);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => {
  dispose
    .splice(0)
    .reverse()
    .forEach((close) => close());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('performs one recovery read in five quiet connected minutes and still responds immediately to a change', async () => {
  const connection = registerLiveConnectionV1(['portal']);
  dispose.push(connection.dispose);
  const refresh = vi.fn(async () => true);
  dispose.push(subscribeLiveRefreshV1({ domains: ['portal'], refresh }));
  connection.setConnected(true);
  await vi.advanceTimersByTimeAsync(299_999);
  expect(refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2_000);
  notifyLiveChangeV1('portal');
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledTimes(2);
  connection.setConnected(false);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(refresh).toHaveBeenCalledTimes(3);
});

it('does not postpone a pending invalidation when connected and preserves time-driven readers', async () => {
  const connection = registerLiveConnectionV1(['portal']);
  dispose.push(connection.dispose);
  const changed = vi.fn(),
    clock = vi.fn(),
    unrelated = vi.fn();
  dispose.push(subscribeLiveRefreshV1({ domains: ['portal'], refresh: changed }));
  dispose.push(subscribeLiveRefreshV1({ domains: ['portal'], refresh: clock, eventDriven: false }));
  dispose.push(subscribeLiveRefreshV1({ domains: ['gradebook'], refresh: unrelated }));
  notifyLiveChangeV1('portal');
  connection.setConnected(true);
  await vi.advanceTimersByTimeAsync(250);
  expect(changed).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(changed).toHaveBeenCalledOnce();
  expect(clock).toHaveBeenCalledTimes(2);
  expect(unrelated).toHaveBeenCalledOnce();
});

it('backs off displayed failures rather than retrying every thirty seconds, then recovers', async () => {
  const reader = createLatestPortalRequestV1(vi.fn());
  const load = vi.fn(async () => {
    throw new Error('offline');
  });
  dispose.push(subscribeLiveRefreshV1({ domains: ['portal'], refresh: () => reader.run(load) }));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(load).toHaveBeenCalledTimes(2);
  for (let n = 0; n < 10; n++) notifyLiveChangeV1('portal');
  await vi.advanceTimersByTimeAsync(59_999);
  expect(load).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(119_999);
  expect(load).toHaveBeenCalledTimes(3);
  load.mockImplementation(async () => undefined as never);
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(load).toHaveBeenCalledTimes(5);
});
