import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PerformanceAnalyticsV6,
  PerformanceAnalyticsRequestV6,
} from '../../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import type {
  PerformanceFailureV2,
  PerformancePeriodV2,
} from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { useGradebookYear } from '../../../platform/gradebook-year-context';
import { useLiveRefreshV1 } from '../../../shared/live-data/use-live-refresh-v1';
import { createOperationalWorkspaceRequestGate } from '../operational-workspace/operational-workspace-request-gate';
import { requestPerformanceAnalyticsV6 } from './performance-analytics-client-v6';

export function usePerformanceAnalyticsV6(
  classId: number | null,
  period: PerformancePeriodV2,
  enabled: boolean,
) {
  const shared = useGradebookYear(),
    year = shared?.year ?? null,
    epoch = shared?.epoch ?? 0;
  const clearAuthorization = shared?.clearAuthorization;
  const [gate] = useState(createOperationalWorkspaceRequestGate);
  const request = useMemo<PerformanceAnalyticsRequestV6 | null>(
    () =>
      year === null || classId === null
        ? null
        : { transportVersion: 6, operation: 'analytics', year, classId, period },
    [year, classId, period],
  );
  const key = JSON.stringify([epoch, request]);
  const [snapshot, setSnapshot] = useState<{ key: string; data: PerformanceAnalyticsV6 } | null>(
    null,
  );
  const [status, setStatus] = useState<{
    key: string;
    busy: boolean;
    failure: PerformanceFailureV2 | null;
  }>({ key: '', busy: false, failure: null });
  const refresh = useCallback(async () => {
    if (!request || !enabled) return;
    const ticket = gate.begin(key);
    if (!ticket) return;
    setStatus({ key, busy: true, failure: null });
    try {
      const result = await requestPerformanceAnalyticsV6(request, ticket.signal);
      if (!ticket.isCurrent()) return;
      if (result.state === 'ready') setSnapshot({ key, data: result });
      else {
        if (result.state === 'not-authorized') {
          setSnapshot(null);
          clearAuthorization?.();
        }
        setStatus({ key, busy: false, failure: result.state });
      }
    } catch {
      if (ticket.isCurrent()) setStatus({ key, busy: false, failure: 'unavailable' });
    } finally {
      if (ticket.isCurrent()) setStatus((previous) => ({ ...previous, busy: false }));
      ticket.complete();
    }
  }, [request, enabled, gate, key, clearAuthorization]);
  useEffect(() => {
    void refresh();
    return () => gate.invalidate();
  }, [refresh, gate]);
  useLiveRefreshV1(refresh, {
    domains: ['gradebook'],
    enabled: enabled && request !== null,
    canRefresh: () => !status.busy && status.failure !== 'not-authorized',
  });
  // Never display a response from another year, authorization, class or period.
  const data = request && snapshot?.key === key ? snapshot.data : null;
  return {
    data,
    busy: enabled && request !== null && (status.key !== key || status.busy),
    failure: status.key === key ? status.failure : null,
  };
}
