import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveRefreshV1 } from '../../../shared/live-data/use-live-refresh-v1';
import {
  createLatestPortalRequestV1,
  type PortalLoadStateV1,
} from '../../student-portal/shared/latest-request-v1';

/** Owning views remain keyed by filters/scope/identity. Background reads never reuse another
 * context's data. Pure reads only; previews and writes must not use this hook.
 */
export function useAccountsReadV1<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ load: typeof load; state: PortalLoadStateV1<T> }>({
    load, state: { state: 'idle' },
  });
  const deadline = useRef(0);
  const state: PortalLoadStateV1<T> = result.load === load ? result.state : { state: 'loading' };
  const [clock, setClock] = useState(0);
  const reader = useMemo(() => createLatestPortalRequestV1<T>((next) => {
    const error = next.state === 'error' ? next.error : next.state === 'ready' ? next.refreshError : undefined;
    deadline.current = error ? Date.now() + Math.max(5, error.retryAfterSeconds ?? 0) * 1000 : 0;
    setResult({ load, state: next });
  }), [load]);
  useEffect(() => {
    deadline.current = 0;
    void reader.run(load);
    return () => reader.clear();
  }, [reader, load]);
  const error = state.state === 'error' ? state.error : state.state === 'ready' ? state.refreshError : undefined;
  useEffect(() => {
    if (!error) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [error]);
  useLiveRefreshV1(() => reader.run(load, { background: true }), {
    domains: ['portal', 'gradebook'],
    canRefresh: () => Date.now() >= deadline.current && (state.state === 'ready'
      || (state.state === 'error' && ['network-error', 'unavailable', 'rate-limited'].includes(state.error.state))),
  });
  return {
    state,
    refreshing: state.state === 'ready' && Boolean(state.refreshing),
    refreshError: state.state === 'ready' ? state.refreshError : undefined,
    canReload: state.state !== 'loading' && (!error || clock >= deadline.current),
    reload: () => {
      if (Date.now() >= deadline.current) return reader.run(load, { background: state.state === 'ready' });
    },
    clear: reader.clear,
  };
}
