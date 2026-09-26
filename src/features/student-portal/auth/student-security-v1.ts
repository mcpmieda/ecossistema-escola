import { instantV1 } from '../../../../shared/student-portal-contracts/core-v1';

export interface StudentSecuritySocketV1 {
  onopen: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent) => unknown) | null;
  onclose: ((event: CloseEvent) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  send(message: string): void;
  close(): void;
}

/** Security leases never request or invalidate the academic snapshot. */
export function createStudentSecurityV1(options: {
  connect: () => StudentSecuritySocketV1;
  /** Session-only check. Must publish and throw on revocation; throws on network uncertainty. */
  authorize: (signal: AbortSignal) => Promise<void>;
  /** Receives only the effective expiry confirmed by the authorized handshake. */
  onAuthorized?: (expiresAt: string, startedAt: number) => boolean;
}) {
  let disposed = false;
  let socket: StudentSecuritySocketV1 | undefined;
  let retry = 1000;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let rotation: ReturnType<typeof setTimeout> | undefined;
  let lease: ReturnType<typeof setTimeout> | undefined;
  let checking = false,
    again = false;
  let request: AbortController | undefined;
  let requestTimeout: ReturnType<typeof setTimeout> | undefined;
  let noticeVersion = 0,
    lastHttpStartedAt = 0;
  const disconnect = () => {
    clearInterval(heartbeat);
    clearTimeout(rotation);
    if (!socket) return;
    const previous = socket;
    socket = undefined;
    previous.onopen = null;
    previous.onmessage = null;
    previous.onclose = null;
    previous.onerror = null;
    previous.close();
  };
  const dispose = () => {
    disposed = true;
    request?.abort();
    clearTimeout(requestTimeout);
    clearTimeout(reconnect);
    clearTimeout(lease);
    disconnect();
  };
  const renew = (verifiedAt = Date.now()) => {
    clearTimeout(lease);
    lease = setTimeout(() => void authorize(), Math.max(0, 60_000 - (Date.now() - verifiedAt)));
  };
  // Stable login (owner decision, 22/09/2026): when the lease is due, re-check the session over
  // HTTP (never /me). Only a confirmed revocation hides content — `authorize` publishes it and
  // the session hook disposes this channel. Network uncertainty (socket blocked, tab resumed
  // after the OS suspended it, flaky mobile data) keeps the content and retries shortly.
  const authorize = async (repeat = false) => {
    if (disposed) return;
    if (checking) {
      again ||= repeat;
      return;
    }
    checking = true;
    const startedAt = Date.now();
    lastHttpStartedAt = startedAt;
    const controller = new AbortController();
    request = controller;
    try {
      await Promise.race([
        options.authorize(controller.signal),
        new Promise((_, reject) => {
          requestTimeout = setTimeout(() => {
            controller.abort();
            reject(new Error('security-verification-timeout'));
          }, 10_000);
        }),
      ]);
      controller.signal.throwIfAborted();
      if (!disposed && !again) renew(startedAt);
    } catch {
      // Network uncertainty does not revoke an account or extend its authorization lease.
      if (!disposed) {
        clearTimeout(lease);
        lease = setTimeout(() => void authorize(), 15_000);
        if (!socket) schedule();
      }
    } finally {
      clearTimeout(requestTimeout);
      request = undefined;
      checking = false;
      if (again && !disposed) {
        again = false;
        void authorize();
      }
    }
  };
  const schedule = () => {
    if (disposed || reconnect) return;
    disconnect();
    reconnect = setTimeout(() => {
      reconnect = undefined;
      connect();
    }, retry);
    retry = Math.min(15_000, retry * 2);
  };
  const connect = () => {
    if (disposed) return;
    let current: StudentSecuritySocketV1;
    const startedAt = Date.now(),
      version = noticeVersion;
    let acknowledged = false;
    try {
      current = options.connect();
    } catch {
      schedule();
      return;
    }
    socket = current;
    // Rotate even a stalled handshake; authorization never depends on receiving onclose.
    rotation = setTimeout(() => {
      disconnect();
      connect();
    }, 45_000);
    current.onopen = () => {
      if (disposed || socket !== current) return;
      retry = 1000;
      clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        try {
          current.send('security-ping');
        } catch {
          schedule();
        }
      }, 20_000);
    };
    current.onmessage = ({ data }) => {
      if (disposed || socket !== current) return;
      if (data === 'security-pong') return;
      if (typeof data !== 'string' || data.length > 128) return;
      let message: unknown;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (!message || typeof message !== 'object') return;
      const value = message as Record<string, unknown>;
      if (value.contractVersion !== 1) return;
      if (value.type === 'reauthorize' && Object.keys(value).length === 2) {
        noticeVersion++;
        void authorize(true);
      }
      if (value.type === 'security-connected' && !acknowledged) {
        const keys = Object.keys(value).length;
        const expiry = instantV1.safeParse(value.expiresAt);
        if (keys !== 2 && (keys !== 3 || !expiry.success)) return;
        acknowledged = true;
        // An older handshake cannot override a security event or a newer HTTP observation.
        if (version !== noticeVersion || startedAt < lastHttpStartedAt) return;
        if (
          keys === 3 &&
          expiry.success &&
          options.onAuthorized &&
          Date.now() < startedAt + 60_000 &&
          Date.parse(expiry.data) > Date.now()
        ) {
          if (options.onAuthorized(expiry.data, startedAt)) renew(startedAt);
        } else void authorize(); // Older servers retain the session-only compatibility path.
      }
    };
    current.onclose = current.onerror = () => {
      if (!disposed && socket === current) schedule();
    };
  };
  renew();
  connect();
  return { dispose };
}
