import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { createLatestPortalRequestV1, type PortalLoadStateV1 } from '../shared/latest-request-v1';
import type { PortalSelfClientV1 } from '../shared/self-client-v1';
import { PortalClientErrorV1 } from '../shared/transport-v1';

export type LogoutStateV1 = 'idle' | 'pending' | 'failed' | 'done';
export function createStudentSessionV1(
  client: PortalSelfClientV1,
  publish: (load: PortalLoadStateV1<SelfResponseV1>) => void,
  logoutState: (state: LogoutStateV1) => void,
  now: () => number = Date.now,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expiresAt = 0,
    blocked = false,
    disposed = false;
  let logoutRequest: AbortController | undefined;
  const checkExpiry = () => {
    if (disposed) return;
    if (expiresAt > now()) {
      timer = setTimeout(checkExpiry, Math.min(2147483647, expiresAt - now()));
      return;
    }
    latest.clear();
    publish({ state: 'error', error: new PortalClientErrorV1('unauthenticated', 401) });
  };
  const latest = createLatestPortalRequestV1<SelfResponseV1>((load) => {
    if (disposed) return;
    publish(load);
    if (load.state === 'ready')
      timer = setTimeout(checkExpiry, Math.min(2147483647, Math.max(0, expiresAt - now())));
  });
  const clear = () => {
    clearTimeout(timer);
    latest.clear();
  };
  const refresh = async () => {
    if (blocked || disposed) return;
    clearTimeout(timer);
    await latest.run(async (signal) => {
      const session = await client.session(signal);
      signal.throwIfAborted();
      const data = await client.me(signal);
      signal.throwIfAborted();
      expiresAt = Date.parse(session.expiresAt);
      if (expiresAt <= now()) throw new PortalClientErrorV1('unauthenticated', 401);
      return data;
    });
  };
  return {
    clear,
    refresh,
    async authenticated() {
      blocked = false;
      logoutState('idle');
      await refresh();
    },
    async logout() {
      if (disposed || logoutRequest) return;
      blocked = true;
      clear();
      logoutState('pending');
      const controller = new AbortController();
      logoutRequest = controller;
      try {
        await client.logout(controller.signal);
        controller.signal.throwIfAborted();
        if (!disposed) {
          logoutState('done');
          publish({ state: 'error', error: new PortalClientErrorV1('unauthenticated', 401) });
        }
      } catch {
        if (!disposed && !controller.signal.aborted) {
          logoutState('failed');
          publish({ state: 'error', error: new PortalClientErrorV1('network-error') });
        }
      } finally {
        if (logoutRequest === controller) logoutRequest = undefined;
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      latest.clear();
      logoutRequest?.abort();
    },
  };
}

/** Revalidates the server session before revealing data after history/background restoration. */
export function useStudentSessionV1(client: PortalSelfClientV1) {
  const [load, setLoad] = useState<PortalLoadStateV1<SelfResponseV1>>({ state: 'idle' });
  const [logoutState, setLogoutState] = useState<LogoutStateV1>('idle');
  const session = useRef<ReturnType<typeof createStudentSessionV1> | null>(null);
  useEffect(() => {
    let currentLoad: PortalLoadStateV1<SelfResponseV1> = { state: 'idle' };
    const current = createStudentSessionV1(
      client,
      (next) => {
        currentLoad = next;
        setLoad(next);
      },
      setLogoutState,
    );
    session.current = current;
    const resume = () => {
      if (document.visibilityState !== 'hidden') void current.refresh();
    };
    const focus = () => {
      // A native file picker returns focus without restoring a protected page.
      // Keep its input/decoder mounted once the server has confirmed no session.
      if (currentLoad.state === 'error' && currentLoad.error.state === 'unauthenticated') return;
      resume();
    };
    // Clear synchronously before the browser can freeze a protected DOM in its history cache.
    const hide = () => flushSync(() => current.clear());
    const visibility = () => {
      if (document.visibilityState === 'hidden') hide();
      else resume();
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', resume);
    window.addEventListener('popstate', resume);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    resume();
    return () => {
      current.dispose();
      session.current = null;
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('popstate', resume);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [client]);
  return {
    load,
    logoutState,
    refresh: () => session.current?.refresh(),
    authenticated: () => session.current?.authenticated(),
    logout: () => session.current?.logout(),
  };
}
