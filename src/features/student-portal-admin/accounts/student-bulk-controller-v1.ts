import type { z } from 'zod';
import {
  bulkPreviewResponseV1,
  type BulkPreviewQueryV1,
} from '../../../../shared/student-portal-contracts/bulk-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import {
  isAmbiguousPortalResponseV1,
  PortalClientErrorV1,
} from '../../student-portal/shared/transport-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';

type Preview = z.infer<typeof bulkPreviewResponseV1>;
export type BulkItemV1 = Preview['items'][number] & {
  result: 'pending' | 'committed' | 'failed' | 'unknown' | 'skipped';
  error?: string;
};
export type BulkStateV1 = {
  phase: 'idle' | 'loading' | 'review' | 'running' | 'paused' | 'unknown' | 'done' | 'error';
  items: BulkItemV1[];
  total: number;
  error?: string;
  retryAt?: number;
};
export function createStudentBulkControllerV1(
  client: PortalAdminClientV1,
  publish: (state: BulkStateV1) => void,
  onAuthorizationLost: (error: PortalClientErrorV1) => void,
) {
  let state: BulkStateV1 = { phase: 'idle', items: [], total: 0 };
  let disposed = false,
    stop = false;
  let active: AbortController | undefined;
  let prepared: { index: number; command: ReturnType<PortalAdminClientV1['prepareCommand']> }[] = [];
  let position = 0;
  const emit = (next: BulkStateV1) => {
    state = next;
    if (!disposed) publish(next);
  };
  const denied = (error: PortalClientErrorV1) =>
    error.state === 'unauthenticated' || error.state === 'forbidden';
  const failure = (error: unknown) =>
    error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('network-error');
  const preview = async (query: Omit<BulkPreviewQueryV1, 'page'>) => {
    if (disposed || state.phase === 'running' || state.phase === 'unknown') return;
    active?.abort();
    const controller = new AbortController();
    active = controller;
    prepared = [];
    position = 0;
    stop = false;
    emit({ phase: 'loading', items: [], total: 0 });
    try {
      let first: Preview | undefined;
      let cursor: string | undefined;
      const ids = new Set<string>(),
        cursors = new Set<string>();
      const all: { item: BulkItemV1; proof: string }[] = [];
      do {
        const response = bulkPreviewResponseV1.parse(
          await client.query(
            { ...query, page: { limit: 100, ...(cursor ? { cursor } : {}) } },
            controller.signal,
          ),
        );
        controller.signal.throwIfAborted();
        if (
          response.action !== query.action ||
          settingsScopeKeyV1(response.scope) !== settingsScopeKeyV1(query.scope)
        )
          throw new PortalClientErrorV1('invalid-response');
        first ??= response;
        if (
          response.scopeVersion !== first.scopeVersion ||
          response.totalCount !== first.totalCount ||
          response.createdAt !== first.createdAt ||
          response.expiresAt !== first.expiresAt ||
          Date.parse(response.expiresAt) <= Date.now()
        )
          throw new PortalClientErrorV1('conflict');
        for (const item of response.items) {
          if (
            ids.has(item.accountId) ||
            (query.scope.kind === 'class' && item.classId !== query.scope.classId)
          )
            throw new PortalClientErrorV1('invalid-response');
          ids.add(item.accountId);
          all.push({ item: { ...item, result: item.ineligibility ? 'skipped' : 'pending' }, proof: response.proof });
        }
        if (
          all.length > first.totalCount ||
          (response.nextCursor && (!response.items.length || cursors.has(response.nextCursor)))
        )
          throw new PortalClientErrorV1('invalid-response');
        emit({ phase: 'loading', items: [], total: first.totalCount });
        cursor = response.nextCursor ?? undefined;
        if (cursor) cursors.add(cursor);
      } while (cursor);
      if (!first || all.length !== first.totalCount)
        throw new PortalClientErrorV1('invalid-response');
      prepared = all.flatMap(({ item, proof }, index) => item.ineligibility ? [] : [{
        index,
        command: client.prepareCommand({
          contractVersion: 1,
          operation: 'bulk-execute',
          action: query.action,
          proof,
          accountId: item.accountId,
          expectedVersion: item.version,
          idempotencyKey: crypto.randomUUID(),
          confirmed: true,
        }),
      }]);
      emit({ phase: 'review', items: all.map(({ item }) => item), total: first.totalCount });
    } catch (error) {
      if (controller.signal.aborted || disposed) return;
      const issue = failure(error);
      prepared = [];
      emit({ phase: 'error', items: [], total: 0, error: issue.state });
      if (denied(issue)) onAuthorizationLost(issue);
    } finally {
      if (active === controller) active = undefined;
    }
  };
  const run = async () => {
    if (
      disposed ||
      !['review', 'paused', 'unknown'].includes(state.phase) ||
      Date.now() < (state.retryAt ?? 0)
    )
      return;
    stop = false;
    const controller = new AbortController();
    active = controller;
    emit({ ...state, phase: 'running', error: undefined });
    while (!disposed && position < prepared.length && !stop) {
      try {
        await prepared[position]!.command.execute(controller.signal);
        controller.signal.throwIfAborted();
        const items = state.items.slice();
        const index = prepared[position]!.index;
        items[index] = { ...items[index]!, result: 'committed', error: undefined };
        emit({ ...state, items });
        position += 1;
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        const issue = failure(error);
        const uncertain =
          issue.state === 'rate-limited' ||
          issue.state === 'unavailable' ||
          isAmbiguousPortalResponseV1(issue);
        const items = state.items.slice();
        const index = prepared[position]!.index;
        items[index] = {
          ...items[index]!,
          result: uncertain ? 'unknown' : 'failed',
          error: issue.state,
        };
        if (denied(issue)) {
          emit({ phase: 'error', items: [], total: 0, error: issue.state });
          prepared = [];
          onAuthorizationLost(issue);
          return;
        }
        if (uncertain) {
          emit({
            ...state,
            phase: 'unknown',
            items,
            error: issue.state,
            retryAt: Date.now() + (issue.retryAfterSeconds ?? 0) * 1000,
          });
          return;
        }
        emit({ ...state, items });
        position += 1;
      }
    }
    if (!disposed) emit({ ...state, phase: position === prepared.length ? 'done' : 'paused' });
    if (active === controller) active = undefined;
  };
  return {
    preview,
    run,
    finish() {
      if (state.phase === 'paused') {
        prepared = [];
        emit({ ...state, phase: 'done' });
      }
    },
    cancel() {
      stop = true;
      if (state.phase === 'loading' || state.phase === 'review') {
        active?.abort();
        prepared = [];
        emit({ phase: 'idle', items: [], total: 0 });
      }
    },
    dispose() {
      disposed = true;
      stop = true;
      active?.abort();
      prepared = [];
      state = { phase: 'idle', items: [], total: 0 };
    },
  };
}
