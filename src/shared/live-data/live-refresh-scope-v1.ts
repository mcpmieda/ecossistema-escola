import { createContext, createElement, useContext, type ReactNode } from 'react';

const LiveRefreshActivityV1 = createContext(true);
const LiveRefreshIntervalV1 = createContext<number | undefined>(undefined);

/** Hidden workspaces remain mounted; only automatic reads are paused.
 * Nested scopes cannot reactivate a reader while an ancestor is inactive.
 * Cadence is a safety fallback, never a freshness or authorization guarantee.
 */
export function LiveRefreshScopeV1({ active, intervalMs, children }: {
  readonly active: boolean;
  readonly intervalMs?: number;
  readonly children: ReactNode;
}) {
  const parentActive = useContext(LiveRefreshActivityV1);
  const parentInterval = useContext(LiveRefreshIntervalV1);
  return createElement(LiveRefreshActivityV1.Provider, { value: parentActive && active },
    createElement(LiveRefreshIntervalV1.Provider, { value: intervalMs ?? parentInterval }, children));
}

export function useLiveRefreshScopeV1(): boolean {
  return useContext(LiveRefreshActivityV1);
}

export function useLiveRefreshIntervalV1(): number | undefined {
  return useContext(LiveRefreshIntervalV1);
}
