import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useRemoteLiveV1, type RemoteLiveStateV1 } from './use-remote-live-v1';

const AdministrativeLiveContextV1 = createContext<RemoteLiveStateV1 | null>(null);

/** The authenticated Admin shell owns one connection for Bank and Portal consumers.
 * An optional live channel never creates privileges or replaces the authorized read response.
 */
export function AdministrativeLiveProviderV1({ identityKey, enabled, onAuthorizationLost, children }: {
  readonly identityKey?: string;
  readonly enabled: boolean;
  readonly onAuthorizationLost?: () => void;
  readonly children: ReactNode;
}) {
  const state = useRemoteLiveV1({
    path: '/api/student-portal/admin/live',
    enabled: enabled && Boolean(identityKey),
    identityKey,
    onAuthorizationLost,
  });
  return createElement(AdministrativeLiveContextV1.Provider, { value: state }, children);
}

/** Standalone consumers keep a bounded connection, but cannot create a second one under the shell. */
export function useAdministrativeLiveV1(options: {
  identityKey?: string;
  onAuthorizationLost?: () => void;
} = {}): RemoteLiveStateV1 {
  const owner = useContext(AdministrativeLiveContextV1);
  const standalone = useRemoteLiveV1({
    path: '/api/student-portal/admin/live',
    enabled: owner === null,
    identityKey: options.identityKey,
    onAuthorizationLost: options.onAuthorizationLost,
  });
  return owner ?? standalone;
}
