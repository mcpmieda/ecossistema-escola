import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStudentSessionV1 } from '../../../../src/features/student-portal/auth/student-session-v1';
import { PortalClientErrorV1 } from '../../../../src/features/student-portal/shared/transport-v1';
import { SYNTHETIC_SELF_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
import { clientFixtureV1, NOW, SESSION } from './fixtures-v1';

class SecuritySocket {
  static sockets: SecuritySocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    SecuritySocket.sockets.push(this);
  }
}

beforeEach(() => {
  setupOperationsDomV1();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  SecuritySocket.sockets = [];
  vi.stubGlobal('WebSocket', SecuritySocket);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });
const advance = (milliseconds: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
async function advanceWithSecurity(milliseconds: number) {
  await act(async () => {
    SecuritySocket.sockets.at(-1)!.onopen?.();
  });
  for (let remaining = milliseconds; remaining > 0; remaining -= 45_000) {
    await advance(Math.min(45_000, remaining));
    if (remaining >= 45_000)
      await act(async () => {
        SecuritySocket.sockets.at(-1)!.onopen?.();
      });
  }
}

it('keeps the initial projection while security checks only the bound session', async () => {
  const client = clientFixtureV1();
  client.me.mockResolvedValueOnce({ ...SYNTHETIC_SELF_V1, state: 'no-publication', subjects: [] });
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  await advanceWithSecurity(5 * 60_000);
  expect(result.current.load).toMatchObject({ state: 'ready', data: { state: 'no-publication' } });
  expect(client.session.mock.calls.length).toBeGreaterThan(1);
  expect(
    client.session.mock.calls
      .slice(1)
      .every(([, accountId]) => accountId === SYNTHETIC_SELF_V1.profile.accountId),
  ).toBe(true);
  expect(client.me).toHaveBeenCalledTimes(1);
  const sessionReads = client.session.mock.calls.length;
  await act(async () => {
    await result.current.refresh();
  });
  expect(client.session).toHaveBeenCalledTimes(sessionReads + 1);
  expect(result.current.load).toEqual({ state: 'ready', data: SYNTHETIC_SELF_V1 });
});

it('does not reread on focus, connectivity, tab visibility, fragments or initial pageshow', async () => {
  const client = clientFixtureV1();
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  const ready = result.current.load;
  await act(async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('offline'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    for (const event of ['focus', 'online', 'popstate', 'pageshow'])
      window.dispatchEvent(new Event(event));
  });
  expect(client.session).toHaveBeenCalledTimes(1);
  await advanceWithSecurity(2 * 60_000);
  expect(result.current.load).toBe(ready);
  expect(
    client.session.mock.calls
      .slice(1)
      .every(([, accountId]) => accountId === SYNTHETIC_SELF_V1.profile.accountId),
  ).toBe(true);
  expect(client.me).toHaveBeenCalledTimes(1);
});

it('reads the current projection when the application is mounted again after a reload', async () => {
  const client = clientFixtureV1();
  client.me.mockResolvedValueOnce({ ...SYNTHETIC_SELF_V1, state: 'no-publication', subjects: [] });
  const first = renderHook(() => useStudentSessionV1(client));
  await settle();
  expect(first.result.current.load).toMatchObject({
    state: 'ready',
    data: { state: 'no-publication' },
  });
  first.unmount();
  const second = renderHook(() => useStudentSessionV1(client));
  await settle();
  expect(second.result.current.load).toEqual({ state: 'ready', data: SYNTHETIC_SELF_V1 });
  expect(client.session).toHaveBeenCalledTimes(2);
  expect(client.me).toHaveBeenCalledTimes(2);
});

it.each([
  ['unauthenticated', 401],
  ['forbidden', 403],
  ['rate-limited', 429],
  ['unavailable', 503],
  ['network-error', 0],
] as const)('does not automatically retry %s', async (state, status) => {
  const client = clientFixtureV1();
  client.session.mockRejectedValueOnce(new PortalClientErrorV1(state, status));
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  await advance(3 * 60_000);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  expect(result.current.load).toMatchObject({ state: 'error', error: { state } });
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).not.toHaveBeenCalled();
});

it('preserves explicit recovery after a failed read', async () => {
  const client = clientFixtureV1();
  client.session.mockRejectedValueOnce(new PortalClientErrorV1('network-error'));
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.load).toEqual({ state: 'ready', data: SYNTHETIC_SELF_V1 });
  expect(client.session).toHaveBeenCalledTimes(2);
});

it('still removes protected data at the server expiry without a network request', async () => {
  const client = clientFixtureV1();
  client.session.mockResolvedValue({ ...SESSION, expiresAt: new Date(NOW + 2_000).toISOString() });
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  expect(result.current.load.state).toBe('ready');
  await advance(2_000);
  expect(result.current.load).toMatchObject({
    state: 'error',
    error: { state: 'unauthenticated' },
  });
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).toHaveBeenCalledTimes(1);
});

it('clears history and fetches grades again only after an explicit refresh', async () => {
  const client = clientFixtureV1();
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  expect(result.current.load.state).toBe('idle');
  await act(async () => {
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(result.current.load.state).toBe('error');
  await act(async () => {
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.load.state).toBe('ready');
  expect(client.session).toHaveBeenCalledTimes(2);
  expect(client.me).toHaveBeenCalledTimes(2);
});

it('discards a read that completes after the page has been hidden by navigation', async () => {
  const client = clientFixtureV1();
  let finish!: (value: typeof SYNTHETIC_SELF_V1) => void;
  client.me.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  await act(async () => {
    finish(SYNTHETIC_SELF_V1);
  });
  expect(result.current.load.state).toBe('idle');
  await act(async () => {
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(result.current.load.state).toBe('error');
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.load.state).toBe('ready');
  expect(client.session).toHaveBeenCalledTimes(2);
});

it('never brings protected data back after logout and still supports explicit authentication', async () => {
  const client = clientFixtureV1();
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  await act(async () => {
    await result.current.logout();
  });
  await advance(3 * 60_000);
  expect(result.current.load).toMatchObject({
    state: 'error',
    error: { state: 'unauthenticated' },
  });
  expect(client.session).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.authenticated();
  });
  expect(result.current.load.state).toBe('ready');
  expect(client.session).toHaveBeenCalledTimes(2);
});

it('releases all session work on unmount', async () => {
  const client = clientFixtureV1();
  const { unmount } = renderHook(() => useStudentSessionV1(client));
  await settle();
  unmount();
  await advance(3 * 60_000);
  await act(async () => {
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).toHaveBeenCalledTimes(1);
});
