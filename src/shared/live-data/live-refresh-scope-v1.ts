import { createContext, createElement, useContext, type ReactNode } from 'react';

const LiveRefreshActivityV1 = createContext(true);

/** Hidden workspaces remain mounted; only automatic reads are paused.
 * Nested scopes cannot reactivate a reader while an ancestor is inactive.
 */
export function LiveRefreshScopeV1({ active, children }: {
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  const parentActive = useContext(LiveRefreshActivityV1);
  return createElement(LiveRefreshActivityV1.Provider, { value: parentActive && active }, children);
}

export function useLiveRefreshScopeV1(): boolean {
  return useContext(LiveRefreshActivityV1);
}
