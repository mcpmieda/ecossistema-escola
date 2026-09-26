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
    onAuthorized: (expiry, startedAt) =>
      session.acceptSecurityAuthorization(expiry, SYNTHETIC_SELF_V1.profile.accountId, startedAt),
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
  it('keeps eight healthy rotations free of duplicate HTTP and academic reads', async () => {
    const s = await setup();
    const confirm = () => {
      s.sockets.at(-1)!.open();
      s.sockets
        .at(-1)!
        .message({ contractVersion: 1, type: 'security-connected', expiresAt: SESSION.expiresAt });
    };
    confirm();
    for (let cycle = 0; cycle < 8; cycle++) {
      await vi.advanceTimersByTimeAsync(45_000);
      confirm();
    }
    expect(s.sockets).toHaveLength(9);
    expect(s.client.session).toHaveBeenCalledTimes(1);
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('supports old confirmations with one HTTP check and ignores duplicate confirmations', async () => {
    const s = await setup();
    s.sockets[0]!.open();
    s.sockets[0]!.message({ contractVersion: 1, type: 'security-connected' });
    await vi.advanceTimersByTimeAsync(0);
    s.sockets[0]!.message({ contractVersion: 1, type: 'security-connected' });
    expect(s.client.session).toHaveBeenCalledTimes(2);
    s.dispose();
  });
  it('uses handshake start for the deadline and ignores old socket callbacks', async () => {
    const s = await setup();
    s.sockets[0]!.open();
    const oldMessage = s.sockets[0]!.onmessage!;
    await vi.advanceTimersByTimeAsync(30_000);
    s.sockets[0]!.message({
      contractVersion: 1,
      type: 'security-connected',
      expiresAt: SESSION.expiresAt,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    oldMessage({
      data: JSON.stringify({
        contractVersion: 1,
        type: 'security-connected',
        expiresAt: SESSION.expiresAt,
      }),
    } as MessageEvent);
    oldMessage({
      data: JSON.stringify({ contractVersion: 1, type: 'reauthorize' }),
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(s.client.session).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.client.session).toHaveBeenCalledTimes(2);
    s.dispose();
  });
  it('aborts timed-out verification and never renews from its late response', async () => {
    const s = await setup();
    let resolve!: (value: typeof SESSION) => void;
    s.client.session.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    s.sockets[0]!.message({ contractVersion: 1, type: 'reauthorize' });
    const signal = s.client.session.mock.lastCall![0]!;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal.aborted).toBe(true);
    resolve(SESSION);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(s.client.session).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.client.session).toHaveBeenCalledTimes(3);
    s.dispose();
  });
  it('applies effective expiry from the handshake and rejects older authorization results', async () => {
    const s = await setup();
    await vi.advanceTimersByTimeAsync(1_000);
    const expiry = new Date(NOW + 3_000).toISOString();
    s.client.session.mockResolvedValueOnce({ ...SESSION, expiresAt: expiry });
    await s.session.authorizeSecurity(new AbortController().signal);
    expect(
      s.session.acceptSecurityAuthorization(
        SESSION.expiresAt,
        SYNTHETIC_SELF_V1.profile.accountId,
        NOW,
      ),
    ).toBe(false);
    expect(
      s.session.acceptSecurityAuthorization(SESSION.expiresAt, 'different-account', NOW + 1_000),
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.publish.mock.lastCall![0]).toMatchObject({
      state: 'error',
      error: { state: 'unauthenticated' },
    });
    s.dispose();
    const fresh = await setup();
    fresh.sockets[0]!.message({
      contractVersion: 1,
      type: 'security-connected',
      expiresAt: new Date(Date.now() + 2_000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fresh.publish.mock.lastCall![0]).toMatchObject({
      state: 'error',
      error: { state: 'unauthenticated' },
    });
    expect(fresh.client.session).toHaveBeenCalledTimes(1);
    fresh.dispose();
  });
  it('orders manual refresh and socket observations even while the academic read is pending', async () => {
    const s = await setup();
    await vi.advanceTimersByTimeAsync(1_000);
    s.client.session.mockResolvedValueOnce({
      ...SESSION,
      expiresAt: new Date(NOW + 3_000).toISOString(),
    });
    await s.session.refresh(true);
    expect(
      s.session.acceptSecurityAuthorization(
        SESSION.expiresAt,
        SYNTHETIC_SELF_V1.profile.accountId,
        NOW,
      ),
    ).toBe(false);
    let resolve!: (value: typeof SYNTHETIC_SELF_V1) => void;
    s.client.me.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const refresh = s.session.refresh(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(
      s.session.acceptSecurityAuthorization(
        new Date(NOW + 4_000).toISOString(),
        SYNTHETIC_SELF_V1.profile.accountId,
        Date.now(),
      ),
    ).toBe(true);
    resolve(SYNTHETIC_SELF_V1);
    await refresh;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.publish.mock.lastCall![0]).toMatchObject({
      state: 'error',
      error: { state: 'unauthenticated' },
    });
    s.dispose();
  });
  it('does not apply an old denial after a newer authorized handshake', async () => {
    const s = await setup();
    let reject!: (error: unknown) => void;
    s.client.session.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const pending = s.session.authorizeSecurity(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(
      s.session.acceptSecurityAuthorization(
        SESSION.expiresAt,
        SYNTHETIC_SELF_V1.profile.accountId,
        Date.now(),
      ),
    ).toBe(true);
    reject(new PortalClientErrorV1('access-closed', 403));
    await pending;
    expect(s.publish.mock.lastCall![0]).toEqual({ state: 'ready', data: SYNTHETIC_SELF_V1 });
    s.dispose();
  });
  it('uses confirmed handshakes without HTTP and revalidates only session on security notices', async () => {
    const s = await setup();
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.client.session).toHaveBeenCalledTimes(1);
    s.sockets[0]!.message({
      contractVersion: 1,
      type: 'security-connected',
      expiresAt: SESSION.expiresAt,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.client.session).toHaveBeenCalledTimes(1);
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
    s.sockets[0]!.message({ contractVersion: 1, type: 'reauthorize' });
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
  it('keeps content through network uncertainty and keeps re-checking only the session', async () => {
    const s = await setup();
    s.client.session.mockRejectedValue(new PortalClientErrorV1('network-error'));
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(0);
    const beforeExpiry = s.client.session.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.publish.mock.lastCall![0].state).toBe('ready');
    expect(s.client.session.mock.calls.length).toBeGreaterThan(beforeExpiry);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.publish.mock.lastCall![0].state).toBe('ready');
    // Stable login never re-reads grades on its own.
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('hides content when the session check at lease expiry confirms revocation', async () => {
    const s = await setup();
    s.sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(0);
    s.client.session.mockRejectedValue(new PortalClientErrorV1('unauthenticated', 401));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.publish.mock.lastCall![0]).toMatchObject({
      state: 'error',
      error: { state: 'unauthenticated' },
    });
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('a delayed check never outlives a disposed channel', async () => {
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
    s.dispose();
    resolve(SESSION);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.client.me).toHaveBeenCalledTimes(1);
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
    s.sockets[0]!.message({ contractVersion: 1, type: 'reauthorize' });
    s.client.session.mockRejectedValueOnce(new PortalClientErrorV1('unauthenticated', 401));
    resolve(SESSION);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.publish.mock.lastCall![0].state).toBe('error');
    expect(s.client.me).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('restricts the expected account query to the session endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(
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
  it('backs off failed connections and verifies over HTTP when the socket never connects', async () => {
    const connect = vi.fn(() => {
      throw new Error('offline');
    });
    const authorize = vi.fn(() => Promise.resolve());
    const security = createStudentSecurityV1({ connect, authorize });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(connect).toHaveBeenCalledTimes(7);
    expect(authorize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(authorize).toHaveBeenCalledOnce();
    // Reconnection keeps backing off (capped at 15 s) instead of giving up.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connect.mock.calls.length).toBeGreaterThan(7);
    expect(authorize).toHaveBeenCalledTimes(2);
    security.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('starts only for authenticated content and reloads after a history restore', async () => {
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
    // Content was never frozen in history; on return it is re-verified and reloaded.
    await act(async () => {
      window.dispatchEvent(new Event('pageshow'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.load).toMatchObject({ state: 'ready', data: SYNTHETIC_SELF_V1 });
    expect(client.me).toHaveBeenCalledTimes(2);
    expect(client.session).toHaveBeenCalledTimes(2);
  });
});
