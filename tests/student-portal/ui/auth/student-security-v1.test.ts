import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  createStudentSecurityV1,
  type StudentSecuritySocketV1,
} from '../../../../src/features/student-portal/auth/student-security-v1';
import {
  createStudentSessionV1,
  useStudentSessionV1,
} from '../../../../src/features/student-portal/auth/student-session-v1';
import { PortalClientErrorV1 } from '../../../../src/features/student-portal/shared/transport-v1';
import { createPortalSelfClientV1 } from '../../../../src/features/student-portal/shared/self-client-v1';
import { SYNTHETIC_SELF_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { clientFixtureV1, NOW, SESSION } from './fixtures-v1';

class Socket implements StudentSecuritySocketV1 {
  onopen: StudentSecuritySocketV1['onopen'] = null;
  onmessage: StudentSecuritySocketV1['onmessage'] = null;
  onclose: StudentSecuritySocketV1['onclose'] = null;
  onerror: StudentSecuritySocketV1['onerror'] = null;
  send = vi.fn();
  close = vi.fn();
  open() {
    this.onopen?.(new Event('open'));
  }
  message(value: unknown) {
    this.onmessage?.({
      data: typeof value === 'string' ? value : JSON.stringify(value),
    } as MessageEvent);
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function setup() {
  const client = clientFixtureV1(),
    publish = vi.fn();
  const session = createStudentSessionV1(client, publish, vi.fn());
  await session.refresh();
  const sockets: Socket[] = [];
  const security = createStudentSecurityV1({
    connect: () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket;
    },
    authorize: session.authorizeSecurity,
    unavailable: session.securityUnavailable,
  });
  return {
    client,
    publish,
    session,
    sockets,
    security,
    dispose() {
      security.dispose();
      session.dispose();
    },
  };
}
describe('student security channel', () => {
  it('revalidates only session on open/security notices and ignores academic or extra payload fields', async () => {
    const s = await setup();
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.client.session).toHaveBeenLastCalledWith(
      expect.any(AbortSignal),
      SYNTHETIC_SELF_V1.profile.accountId,
    );
    s.sockets[0]!.message({ contractVersion: 1, type: 'security-connected' });
    await vi.advanceTimersByTimeAsync(0);
    s.sockets[0]!.message({ contractVersion: 1, type: 'reauthorize' });
    await vi.advanceTimersByTimeAsync(0);
    const count = s.client.session.mock.calls.length;
    s.sockets[0]!.message({ contractVersion: 1, type: 'change', domain: 'gradebook' });
    s.sockets[0]!.message({ contractVersion: 1, type: 'reauthorize', accountId: 'spoofed' });
    s.sockets[0]!.message('security-pong');
    expect(s.client.session).toHaveBeenCalledTimes(count);
    expect(s.client.me).toHaveBeenCalledTimes(1);
    expect(s.publish.mock.lastCall![0]).toEqual({ state: 'ready', data: SYNTHETIC_SELF_V1 });
    s.dispose();
  });
  it.each([401, 403])('clears protected state on %i without fetching grades', async (status) => {
    const s = await setup();
    s.client.session.mockRejectedValueOnce(
      new PortalClientErrorV1(status === 401 ? 'unauthenticated' : 'forbidden', status),
    );
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.publish.mock.lastCall![0]).toMatchObject({
      state: 'error',
      error: { state: 'unauthenticated' },
    });
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('pings every 20 seconds and rotates after 45 seconds without academic requests', async () => {
    const s = await setup();
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(s.sockets[0]!.send.mock.calls).toEqual([['security-ping'], ['security-ping']]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.sockets[0]!.close).toHaveBeenCalledOnce();
    expect(s.sockets).toHaveLength(2);
    s.sockets[1]!.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('expires the authorization lease on network failure without claiming revocation', async () => {
    const s = await setup();
    s.client.session.mockRejectedValue(new PortalClientErrorV1('network-error'));
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(s.publish.mock.lastCall![0].state).toBe('ready');
    await vi.advanceTimersByTimeAsync(1);
    expect(s.publish.mock.lastCall![0]).toMatchObject({
      state: 'error',
      error: { state: 'network-error' },
    });
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('never restores payload after a delayed check or disposed channel', async () => {
    const s = await setup();
    let resolve!: (value: typeof SESSION) => void;
    s.client.session.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(60_000);
    resolve(SESSION);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.publish.mock.lastCall![0].state).toBe('error');
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rechecks an event arriving during an outstanding session check', async () => {
    const s = await setup();
    let resolve!: (value: typeof SESSION) => void;
    s.client.session.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    s.sockets[0]!.open();
    s.sockets[0]!.message({ contractVersion: 1, type: 'reauthorize' });
    s.client.session.mockRejectedValueOnce(new PortalClientErrorV1('unauthenticated', 401));
    resolve(SESSION);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.publish.mock.lastCall![0].state).toBe('error');
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('restricts the expected account query to the session endpoint', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(SESSION), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }),
      );
    const client = createPortalSelfClientV1({ fetch });
    await client.session(undefined, SYNTHETIC_SELF_V1.profile.accountId);
    expect(fetch.mock.calls[0]![0]).toBe(
      '/api/student/session?accountId=' + SYNTHETIC_SELF_V1.profile.accountId,
    );
    await expect(client.session(undefined, 'bad&other=1')).rejects.toMatchObject({
      state: 'invalid-request',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('backs off failed connections and stops all attempts at lease expiration', async () => {
    const connect = vi.fn(() => {
      throw new Error('offline');
    });
    const unavailable = vi.fn(),
      authorize = vi.fn();
    createStudentSecurityV1({ connect, unavailable, authorize });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connect).toHaveBeenCalledTimes(7);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(authorize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connect).toHaveBeenCalledTimes(7);
  });
  it('starts only for authenticated content and clears restored history without fetching grades', async () => {
    const urls: string[] = [];
    class BrowserSocket extends Socket {
      constructor(url: string) {
        super();
        urls.push(String(url));
      }
    }
    vi.stubGlobal('WebSocket', BrowserSocket);
    const client = clientFixtureV1();
    const hook = renderHook(() => useStudentSessionV1(client));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(urls).toHaveLength(1);
    const url = new URL(urls[0]!);
    expect(url.searchParams.get('purpose')).toBe('security');
    expect(url.searchParams.get('accountId')).toBe(SYNTHETIC_SELF_V1.profile.accountId);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(hook.result.current.load.state).toBe('idle');
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(hook.result.current.load).toMatchObject({
      state: 'error',
      error: { state: 'network-error' },
    });
    expect(client.me).toHaveBeenCalledTimes(1);
    expect(client.session).toHaveBeenCalledTimes(1);
  });
});
