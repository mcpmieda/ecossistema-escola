import { createContext, useContext } from 'react';

/** Presentation preferences only. The public demo has its own origin and key prefix. */
export const PortalPreferenceScopeV1 = createContext('');
export function usePortalPreferenceKeyV1(key: string): string {
  return useContext(PortalPreferenceScopeV1) + key;
}
