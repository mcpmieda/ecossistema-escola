import { useEffect, useRef } from 'react';
import { subscribeLiveRefreshV1, type LiveDomainV1 } from './live-refresh-v1';

/** Changing data does not restart the schedule. Readers retain responsibility for scope,
 * authorization, cancellation, retry deadlines and preserving dirty fields.
 */
export function useLiveRefreshV1(refresh: () => void | Promise<unknown>, options: {
  domains: readonly LiveDomainV1[];
  enabled?: boolean;
  canRefresh?: () => boolean;
  intervalMs?: number;
}) {
  const current = useRef({ refresh, canRefresh: options.canRefresh });
  useEffect(() => { current.current = { refresh, canRefresh: options.canRefresh }; });
  const domainsKey = options.domains.join(','), enabled = options.enabled !== false, interval = options.intervalMs;
  useEffect(() => {
    if (!enabled) return;
    return subscribeLiveRefreshV1({
      domains: domainsKey.split(',').filter((domain): domain is LiveDomainV1 => domain === 'gradebook' || domain === 'portal'),
      intervalMs: interval,
      refresh: () => current.current.refresh(),
      canRefresh: () => current.current.canRefresh?.() ?? true,
    });
  }, [domainsKey, enabled, interval]);
}
