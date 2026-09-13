import { useEffect, useMemo, useState } from 'react';
import {
  createLatestPortalRequestV1,
  type PortalLoadStateV1,
} from '../../student-portal/shared/latest-request-v1';

/** Callers key the owning view by filters/scope/identity before paint. No cached private data. */
export function useAccountsReadV1<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ load: typeof load; state: PortalLoadStateV1<T> }>({
    load,
    state: { state: 'idle' },
  });
  const state: PortalLoadStateV1<T> = result.load === load ? result.state : { state: 'loading' };
  const [clock, setClock] = useState(0);
  const reader = useMemo(
    () => createLatestPortalRequestV1<T>((state) => setResult({ load, state })),
    [load],
  );
  const [retryAt, setRetryAt] = useState(0);
  useEffect(() => {
    void reader.run(load);
    return () => reader.clear();
  }, [reader, load]);
  useEffect(() => {
    if (state.state !== 'error') return;
    const now = Date.now();
    setClock(now);
    setRetryAt(now + (state.error.retryAfterSeconds ?? 0) * 1000);
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state]);
  return {
    state,
    canReload: state.state !== 'loading' && (state.state !== 'error' || clock >= retryAt),
    reload: () => {
      if (state.state !== 'error' || Date.now() >= retryAt) void reader.run(load);
    },
    clear: reader.clear,
  };
}
