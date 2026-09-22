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
  authorize: (signal: AbortSignal) => Promise<void>;
  unavailable: () => void;
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
  const controller = new AbortController();
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
    controller.abort();
    clearTimeout(reconnect);
    clearTimeout(lease);
    disconnect();
  };
  const renew = (verifiedAt = Date.now()) => {
    clearTimeout(lease);
    lease = setTimeout(
      () => {
        dispose();
        options.unavailable();
      },
      Math.max(0, 60_000 - (Date.now() - verifiedAt)),
    );
  };
  const authorize = async (repeat = false) => {
    if (disposed) return;
    if (checking) {
      again ||= repeat;
      return;
    }
    checking = true;
    const startedAt = Date.now();
    try {
      await options.authorize(controller.signal);
      if (!disposed) renew(startedAt);
    } catch {
      // Network uncertainty does not revoke an account or extend its authorization lease.
    } finally {
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
      retry = 1000;
      void authorize();
      heartbeat = setInterval(() => {
        try {
          current.send('security-ping');
        } catch {
          schedule();
        }
      }, 20_000);
    };
    current.onmessage = ({ data }) => {
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
      if (Object.keys(value).length !== 2 || value.contractVersion !== 1) return;
      if (value.type === 'reauthorize') void authorize(true);
      if (value.type === 'security-connected') void authorize();
    };
    current.onclose = current.onerror = schedule;
  };
  renew();
  connect();
  return { dispose };
}
