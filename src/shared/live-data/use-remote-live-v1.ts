import { createElement, useEffect, useRef, useState } from 'react';
import { liveServerMessageV1 } from '../../../shared/student-portal-contracts/live-v1';
import { notifyLiveChangeV1, registerLiveConnectionV1 } from './live-refresh-v1';
import { secureJitterV1 } from './secure-jitter-v1';

export type RemoteLiveStateV1 =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'unsupported';

/** Authenticated notices contain only domains/versions. Readers still authorize every value.
 * identityKey is memory-only and resets the cursor/connection when the authenticated scope changes.
 */
export function useRemoteLiveV1(options: {
  path: string;
  enabled: boolean;
  identityKey?: string;
  onAuthorizationLost?: () => void;
}) {
  const [state, setState] = useState<RemoteLiveStateV1>('idle');
  const authorizationLost = useRef(options.onAuthorizationLost);
  useEffect(() => {
    authorizationLost.current = options.onAuthorizationLost;
  });
  useEffect(() => {
    if (!options.enabled) {
      setState('idle');
      return;
    }
    if (typeof window.WebSocket !== 'function') {
      setState('unsupported');
      return;
    }
    const url = new URL(options.path, window.location.href);
    if (url.origin !== window.location.origin) {
      setState('unsupported');
      return;
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = registerLiveConnectionV1(['gradebook', 'portal']);
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let handshake: ReturnType<typeof setTimeout> | undefined;
    let disposed = false,
      denied = false,
      attempt = 0,
      retryAt = 0;
    let cursor: string | null = null;
    const seen = new Set<string>();
    const available = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const drop = (reason: string) => {
      connection.setConnected(false);
      clearTimeout(handshake);
      handshake = undefined;
      const current = socket;
      socket = null;
      try {
        current?.close(1000, reason);
      } catch {
        /* Already detached. */
      }
    };
    const schedule = () => {
      if (disposed || denied) return;
      clearTimeout(retry);
      setState('reconnecting');
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5)) + secureJitterV1(500);
      retryAt = Date.now() + delay;
      if (available()) retry = setTimeout(connect, delay);
    };
    const connect = () => {
      if (disposed || denied || socket || !available()) return;
      clearTimeout(retry);
      if (Date.now() < retryAt) {
        retry = setTimeout(connect, retryAt - Date.now());
        return;
      }
      setState(attempt ? 'reconnecting' : 'connecting');
      let current: WebSocket;
      try {
        current = new window.WebSocket(url);
      } catch {
        schedule();
        return;
      }
      socket = current;
      handshake = setTimeout(() => {
        if (disposed || socket !== current) return;
        drop('handshake-timeout');
        schedule();
      }, 10_000);
      current.addEventListener('open', () => {
        if (disposed || socket !== current) return;
        // A TCP upgrade alone is not proof of an authorized, working notification stream.
        try {
          current.send(JSON.stringify({ contractVersion: 1, type: 'resume', cursor }));
        } catch {
          drop('resume-failed');
          schedule();
        }
      });
      current.addEventListener('message', (event) => {
        if (
          disposed ||
          socket !== current ||
          typeof event.data !== 'string' ||
          event.data.length > 2048
        )
          return;
        let input: unknown;
        try {
          input = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = liveServerMessageV1.safeParse(input);
        if (!parsed.success) return;
        clearTimeout(handshake);
        handshake = undefined;
        attempt = 0;
        retryAt = 0;
        const message = parsed.data;
        connection.setConnected(true);
        setState('connected');
        if (message.type === 'resync') {
          cursor = message.cursor;
          seen.clear();
          for (const domain of message.domains) notifyLiveChangeV1(domain, { broadcast: false });
        } else if (message.type === 'change') {
          if (cursor === null || message.cursor > cursor) cursor = message.cursor;
          const key = `${message.domain}:${message.cursor}`;
          if (seen.has(key)) return;
          seen.add(key);
          if (seen.size > 128) seen.delete(seen.values().next().value!);
          notifyLiveChangeV1(message.domain, { broadcast: false });
        } else cursor = message.cursor;
      });
      current.addEventListener('close', (event) => {
        if (socket !== current) return;
        connection.setConnected(false);
        socket = null;
        clearTimeout(handshake);
        handshake = undefined;
        if (disposed) return;
        if (event.code === 4401 || event.code === 4403) {
          denied = true;
          clearTimeout(retry);
          setState('idle');
          authorizationLost.current?.();
          return;
        }
        schedule();
      });
      current.addEventListener('error', () => {
        if (disposed || socket !== current) return;
        drop('connection-error');
        schedule();
      });
    };
    const resume = () => {
      if (disposed || denied) return;
      if (available()) connect();
      else {
        clearTimeout(retry);
        retry = undefined;
        drop('page-inactive');
        setState('reconnecting');
      }
    };
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', resume);
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', resume);
      drop('page-disposed');
      connection.dispose();
      seen.clear();
    };
  }, [options.enabled, options.path, options.identityKey]);
  return state;
}

export function RemoteLiveNoticeV1({ state }: { state: RemoteLiveStateV1 }) {
  return state === 'reconnecting' || state === 'unsupported'
    ? createElement(
        'p',
        { role: 'status', className: 'text-xs text-muted' },
        'Avisos entre dispositivos indisponíveis; a recuperação periódica continua ativa.',
      )
    : null;
}
