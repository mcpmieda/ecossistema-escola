import { useEffect, useState } from 'react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import type { PortalAdminReadClientV2 } from './accounts-client-v2';

/** Seals each student sees on the Portal; null when no marks are shown to that student. */
export type SealCountsV1 = ReadonlyMap<string, number | null>;
export type SealReadStateV1 =
  | { state: 'idle' | 'loading' }
  | { state: 'ready'; counts: SealCountsV1 }
  | { state: 'error'; error: PortalClientErrorV1 };

async function readSealsV1(
  reader: PortalAdminReadClientV2,
  scope: Extract<ScopeV1, { kind: 'class' | 'account' }>,
  signal: AbortSignal,
) {
  const result = await reader.query(
    { contractVersion: 2, operation: 'seals-read', scope, page: { limit: 100 } },
    signal,
  );
  if (result.state !== 'seals-read') throw new PortalClientErrorV1('invalid-response');
  return result.items;
}

/**
 * Selos brilhantes for a record or a list (owner request 29/09/2026). The server counts one
 * record or one class per read; a school-wide list reads its classes two at a time.
 */
export function useSealCountsV1(
  reader: PortalAdminReadClientV2,
  target: { accountId: string } | { classIds: readonly number[] } | null,
): SealReadStateV1 {
  const [state, setState] = useState<SealReadStateV1>({ state: 'idle' });
  const key =
    target === null
      ? null
      : 'accountId' in target
        ? 'account:' + target.accountId
        : 'classes:' + [...target.classIds].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (target === null || key === null) {
      setState({ state: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ state: 'loading' });
    const scopes: Extract<ScopeV1, { kind: 'class' | 'account' }>[] =
      'accountId' in target
        ? [{ kind: 'account', academicYear: 2026, accountId: target.accountId }]
        : target.classIds.map((classId) => ({ kind: 'class', academicYear: 2026, classId }));
    void (async () => {
      const counts = new Map<string, number | null>();
      const queue = [...scopes];
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift())
          for (const item of await readSealsV1(reader, next, controller.signal))
            counts.set(item.accountId, item.seals);
      };
      await Promise.all([worker(), worker()]);
      return counts;
    })().then(
      (counts) => {
        if (!controller.signal.aborted) setState({ state: 'ready', counts });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          state: 'error',
          error: error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('network-error'),
        });
      },
    );
    return () => controller.abort();
    // `key` stands for the target's identity; the object itself changes on every render.
  }, [reader, key]);
  return state;
}

export function sealLabelV1(count: number) {
  return `${count} ${count === 1 ? 'selo brilhante' : 'selos brilhantes'}`;
}
