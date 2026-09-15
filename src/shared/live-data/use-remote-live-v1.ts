import { createElement, useEffect, useRef, useState } from 'react';
import { liveServerMessageV1 } from '../../../shared/student-portal-contracts/live-v1';
import { notifyLiveChangeV1 } from './live-refresh-v1';

export type RemoteLiveStateV1 = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'unsupported';

/** Authenticated server notices contain only domains/versions. Authorized readers still fetch every value. */
export function useRemoteLiveV1(options: {
  path: string;
  enabled: boolean;
  onAuthorizationLost?: () => void;
}) {
  const [state, setState] = useState<RemoteLiveStateV1>('idle');
  const authorizationLost = useRef(options.onAuthorizationLost);
  useEffect(() => { authorizationLost.current = options.onAuthorizationLost; });
  useEffect(() => {
    if (!options.enabled) { setState('idle'); return; }
    if (typeof window.WebSocket !== 'function') { setState('unsupported'); return; }
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false, attempt = 0;
    let cursor: string | null = null;
    const schedule = () => {
      if (disposed) return;
      clearTimeout(retry);
      setState('reconnecting');
      if (document.visibilityState === 'hidden' || navigator.onLine === false) return;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5)) + Math.floor(Math.random() * 500);
      retry = setTimeout(connect, delay);
    };
    const connect = () => {
      if (disposed || socket || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      clearTimeout(retry);
      setState(attempt ? 'reconnecting' : 'connecting');
      const url = new URL(options.path, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const current = new window.WebSocket(url);
      socket = current;
      current.addEventListener('open', () => {
        if (disposed || socket !== current) return;
        attempt = 0;
        current.send(JSON.stringify({ contractVersion: 1, type: 'resume', cursor }));
      });
      current.addEventListener('message', (event) => {
        if (disposed || socket !== current || typeof event.data !== 'string' || event.data.length > 2048) return;
        let input: unknown;
        try { input = JSON.parse(event.data); } catch { return; }
        const parsed = liveServerMessageV1.safeParse(input);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.cursor && (cursor === null || message.cursor > cursor)) cursor = message.cursor;
        setState('connected');
        if (message.type === 'change') notifyLiveChangeV1(message.domain);
        else if (message.type === 'resync') for (const domain of message.domains) notifyLiveChangeV1(domain);
      });
      current.addEventListener('close', (event) => {
        if (socket !== current) return;
        socket = null;
        if (disposed) return;
        if (event.code === 4401 || event.code === 4403) {
          setState('idle');
          authorizationLost.current?.();
          return;
        }
        schedule();
      });
      current.addEventListener('error', () => {
        if (socket === current) current.close();
      });
    };
    const resume = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false && !socket) connect();
    };
    const pauseOffline = () => {
      clearTimeout(retry);
      const current = socket;
      socket = null;
      current?.close(1000, 'offline');
      if (!disposed) setState('reconnecting');
    };
    window.addEventListener('online', resume);
    window.addEventListener('offline', pauseOffline);
    document.addEventListener('visibilitychange', resume);
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', pauseOffline);
      document.removeEventListener('visibilitychange', resume);
      const current = socket; socket = null;
      current?.close(1000, 'page-disposed');
    };
  }, [options.enabled, options.path]);
  return state;
}

export function RemoteLiveNoticeV1({ state }: { state: RemoteLiveStateV1 }) {
  return state === 'reconnecting' || state === 'unsupported'
    ? createElement('p', { role: 'status', className: 'text-xs text-muted' },
        'Avisos entre dispositivos indisponíveis; a recuperação periódica continua ativa.')
    : null;
}
