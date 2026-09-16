import type { SavedBirthV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import type { PortalAdminReadClientV2 } from '../accounts/accounts-client-v2';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import {
  readBirthCollectionV1,
  readBirthPageV1,
  type BirthCursorsV1,
  type BirthScopeV1,
} from './birth-read-v1';
import { createBirthBatchV1, emptyBirthBatchV1, type BirthBatchStateV1 } from './birth-batch-v1';
import {
  birthClearItemV1,
  birthDirtyV1,
  birthDraftRowV1,
  birthErrorV1,
  birthProtectedFailureV1,
  birthRetryableV1,
  birthSetItemV1,
  birthSingleCommandV1,
  validBirthYearV1,
  type BirthBatchCommandV1,
  type BirthDraftRowV1,
  type BirthSingleCommandV1,
} from './birth-values-v1';

export type BirthReviewV1 =
  | { kind: 'provenance'; accountId: string; year: string; revision: number }
  | { kind: 'clear'; command: BirthSingleCommandV1; revision: number }
  | { kind: 'batch-set' | 'batch-clear'; command: BirthBatchCommandV1 };
export interface BirthSingleFailureV1 {
  accountId: string;
  error: PortalClientErrorV1;
  retryable: boolean;
  retryAt: number;
  committed: boolean;
}
export interface BirthEditorStateV1 {
  state: 'idle' | 'loading' | 'ready' | 'error';
  rows: BirthDraftRowV1[];
  scopeVersion: number;
  next: BirthCursorsV1 | null;
  mode: 'single' | 'batch';
  review: BirthReviewV1 | null;
  singleBusy: boolean;
  singleFailure: BirthSingleFailureV1 | null;
  batch: BirthBatchStateV1;
  error?: PortalClientErrorV1;
  retryAt: number;
  refreshing?: boolean;
  refreshError?: PortalClientErrorV1;
}
export const emptyBirthEditorV1 = (): BirthEditorStateV1 => ({
  state: 'idle',
  rows: [],
  scopeVersion: 0,
  next: null,
  mode: 'single',
  review: null,
  singleBusy: false,
  singleFailure: null,
  batch: emptyBirthBatchV1(),
  retryAt: 0,
});

/** Owns transient drafts and a single writer. No storage, logging, automatic CAS rebasing,
 * or mutation on incomplete input. Receipt success and refreshed CAS are separate facts. */
export function createBirthEditorV1(options: {
  client: PortalAdminClientV1;
  reader: PortalAdminReadClientV2;
  scope: BirthScopeV1;
  cursor?: BirthCursorsV1;
  continuous?: boolean;
  canWrite: boolean;
  /** Explicitly typed values are confirmed by the authorized operator (#817). */
  confirmOnEdit?: boolean;
  publish: (state: BirthEditorStateV1) => void;
  onAuthorizationLost?: (error: PortalClientErrorV1) => void;
  onChanged?: () => void;
  now?: () => number;
}) {
  const { client, reader, scope } = options,
    now = options.now ?? Date.now;
  let state = emptyBirthEditorV1(),
    generation = 0,
    clearing = false,
    navigationPaused = false;
  let active: AbortController | undefined, background: AbortController | undefined;
  const timers = new Map<string, ReturnType<typeof setTimeout>>(),
    queued = new Set<string>();
  let single:
    | {
        command: BirthSingleCommandV1;
        revision: number;
        prepared: ReturnType<PortalAdminClientV1['prepareCommand']>;
        receipt?: number;
        savedBirth?: SavedBirthV1;
      }
    | undefined;
  const emit = (patch: Partial<BirthEditorStateV1> = {}) => {
    state = { ...state, ...patch };
    options.publish({ ...state, rows: state.rows.map((row) => ({ ...row })) });
  };
  const find = (id: string) => state.rows.find((row) => row.record.account.accountId === id);
  const replace = (id: string, patch: Partial<BirthDraftRowV1>) => {
    state = {
      ...state,
      rows: state.rows.map((row) =>
        row.record.account.accountId === id ? { ...row, ...patch } : row,
      ),
    };
  };
  function stopTimers() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    queued.clear();
  }
  const batch = createBirthBatchV1(
    client,
    scope.kind === 'class' ? scope.classId : 0,
    (value) => {
      if (clearing) return;
      if (value.error && birthProtectedFailureV1(value.error)) {
        protectedFailure(value.error);
        return;
      }
      emit({ batch: value });
      if (value.state === 'complete') options.onChanged?.();
    },
    now,
  );
  function clear() {
    generation++;
    active?.abort();
    background?.abort();
    background = undefined;
    active = undefined;
    stopTimers();
    single = undefined;
    navigationPaused = false;
    clearing = true;
    batch.clear();
    clearing = false;
    state = emptyBirthEditorV1();
    emit();
  }
  function protectedFailure(error: PortalClientErrorV1) {
    clear();
    emit({ state: 'error', error, retryAt: now() + (error.retryAfterSeconds ?? 0) * 1000 });
    options.onAuthorizationLost?.(error);
  }
  async function load() {
    if (state.state === 'error' && now() < state.retryAt) return;
    const mode = state.mode;
    clear();
    const current = generation,
      controller = new AbortController();
    active = controller;
    emit({ state: 'loading', mode });
    try {
      const result = options.continuous
        ? await readBirthCollectionV1(client, reader, scope, controller.signal)
        : await readBirthPageV1(client, reader, scope, options.cursor, controller.signal);
      if (current !== generation || controller.signal.aborted) return;
      emit({
        state: 'ready',
        rows: result.rows.map(birthDraftRowV1),
        scopeVersion: result.scopeVersion,
        next: result.next,
      });
    } catch (error) {
      if (current !== generation || controller.signal.aborted) return;
      const failure = birthErrorV1(error);
      if (birthProtectedFailureV1(failure)) protectedFailure(failure);
      else
        emit({
          state: 'error',
          error: failure,
          rows: [],
          retryAt: now() + (failure.retryAfterSeconds ?? 0) * 1000,
        });
    } finally {
      if (current === generation) active = undefined;
    }
  }
  function editable() {
    return (
      options.canWrite &&
      state.state === 'ready' &&
      !state.review &&
      !navigationPaused &&
      state.batch.state === 'idle'
    );
  }
  function schedule(id: string) {
    const previous = timers.get(id);
    if (previous !== undefined) clearTimeout(previous);
    timers.delete(id);
    queued.delete(id);
    const row = find(id);
    if (
      !editable() ||
      state.mode !== 'single' ||
      !row ||
      !validBirthYearV1(row.year) ||
      !birthDirtyV1(row)
    )
      return;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        queued.add(id);
        void drain();
      }, 600),
    );
  }
  function edit(id: string, year: string) {
    const row = find(id);
    if (!editable() || !row || row.year === year) return;
    // Existing test/imported years are untouched until an operator edits or confirms.
    replace(id, {
      year,
      confirmation: options.confirmOnEdit ? 'confirmed' : 'unconfirmed-test',
      revision: row.revision + 1,
      status: 'draft',
      error: undefined,
    });
    emit();
    schedule(id);
  }
  async function refreshSingle(current: number, controller: AbortController) {
    const pending = single;
    if (!pending || pending.receipt === undefined) return;
    const id = pending.command.item.accountId;
    const existing = find(id);
    if (!existing) throw new PortalClientErrorV1('conflict');
    const saved = pending.savedBirth;
    if (
      saved &&
      (saved.accountId !== id ||
        saved.accountVersion !== pending.receipt ||
        (scope.kind === 'class' && saved.classId !== scope.classId))
    )
      throw new PortalClientErrorV1('conflict');
    // New servers return the committed value directly. Responses without a current snapshot and superseded replays
    // keep the established bounded read-after-write path without a duplicate mutation.
    const record = saved
      ? {
          account: { ...existing.record.account, version: saved.accountVersion },
          birth: {
            accountId: saved.accountId,
            accountVersion: saved.accountVersion,
            year: saved.year,
            confirmation: saved.confirmation,
            version: saved.version,
          },
        }
      : (
          await readBirthPageV1(
            client,
            reader,
            { kind: 'account', academicYear: 2026, accountId: id },
            undefined,
            controller.signal,
            scope.kind === 'class' ? scope.classId : undefined,
          )
        ).rows[0];
    if (current !== generation || controller.signal.aborted || single !== pending) return;
    const item = pending.command.item;
    if (
      !record ||
      record.account.version !== pending.receipt ||
      record.birth.year !== (item.action === 'set' ? item.year : null) ||
      record.birth.confirmation !== (item.action === 'set' ? item.confirmation : null)
    )
      throw new PortalClientErrorV1('conflict');
    const row = find(id);
    if (!row) throw new PortalClientErrorV1('conflict');
    if (row.revision === pending.revision)
      replace(id, {
        record,
        year: record.birth.year ?? '',
        confirmation: record.birth.confirmation ?? 'unconfirmed-test',
        status: 'saved',
        error: undefined,
      });
    else replace(id, { record, status: 'draft', error: undefined });
    single = undefined;
    emit({ singleFailure: null });
    // Any newer draft uses the acknowledged fresh versions, unless another operator won.
    schedule(id);
    options.onChanged?.();
  }
  async function runSingle() {
    if (!single || state.singleBusy || (state.singleFailure && now() < state.singleFailure.retryAt))
      return;
    const pending = single,
      current = generation,
      controller = new AbortController();
    active = controller;
    const id = pending.command.item.accountId;
    replace(id, {
      status: pending.receipt === undefined ? 'saving' : 'refresh-error',
      error: undefined,
    });
    emit({ singleBusy: true, singleFailure: null });
    try {
      if (pending.receipt === undefined) {
        const result = await pending.prepared.execute(controller.signal);
        if (current !== generation || controller.signal.aborted) return;
        if (result.state !== 'committed') throw new PortalClientErrorV1('invalid-response');
        pending.receipt = result.version;
        pending.savedBirth = result.savedBirth;
      }
      await refreshSingle(current, controller);
    } catch (error) {
      if (current !== generation || controller.signal.aborted) return;
      const failure = birthErrorV1(error);
      if (birthProtectedFailureV1(failure)) {
        protectedFailure(failure);
        return;
      }
      const committed = pending.receipt !== undefined;
      replace(id, {
        status: failure.state === 'conflict' ? 'conflict' : committed ? 'refresh-error' : 'error',
        error: failure,
      });
      emit({
        singleFailure: {
          accountId: id,
          error: failure,
          committed,
          retryable: birthRetryableV1(failure),
          retryAt:
            now() +
            Math.max(birthRetryableV1(failure) ? 1 : 0, failure.retryAfterSeconds ?? 0) * 1000,
        },
      });
    } finally {
      if (current === generation) {
        active = undefined;
        emit({ singleBusy: false });
        if (!single) void drain();
      }
    }
  }
  async function drain() {
    if (!editable() || state.mode !== 'single' || state.singleBusy || single) return;
    const id = queued.values().next().value as string | undefined;
    if (!id) return;
    queued.delete(id);
    const row = find(id);
    if (!row || !validBirthYearV1(row.year) || !birthDirtyV1(row)) {
      void drain();
      return;
    }
    const command = birthSingleCommandV1(row, birthSetItemV1(row));
    single = { command, revision: row.revision, prepared: client.prepareCommand(command) };
    await runSingle();
  }
  function review(kind: 'provenance' | 'clear' | 'batch-set' | 'batch-clear', id?: string) {
    if (!editable() || state.singleBusy || single) return;
    const row = id ? find(id) : undefined;
    let value: BirthReviewV1;
    if (kind === 'provenance') {
      if (!row || !validBirthYearV1(row.year)) return;
      value = {
        kind,
        accountId: row.record.account.accountId,
        year: row.year,
        revision: row.revision,
      };
    } else if (kind === 'clear') {
      if (!row || row.record.birth.year === null) return;
      value = {
        kind,
        command: birthSingleCommandV1(row, birthClearItemV1(row)),
        revision: row.revision,
      };
    } else {
      if (scope.kind !== 'class' || state.mode !== 'batch') return;
      const selected = state.rows.filter((r) => r.selected);
      if (
        !selected.length ||
        selected.length > 100 ||
        (kind === 'batch-set' && selected.some((r) => !validBirthYearV1(r.year)))
      )
        return;
      value = {
        kind,
        command: {
          contractVersion: 1,
          operation: 'birth-batch',
          idempotencyKey: crypto.randomUUID(),
          classId: scope.classId,
          expectedVersion: state.scopeVersion,
          expectedCount: selected.length,
          confirmed: true,
          items: selected.map(kind === 'batch-set' ? birthSetItemV1 : birthClearItemV1),
        },
      };
    }
    stopTimers();
    emit({ review: value });
  }
  function cancelReview() {
    emit({ review: null });
    for (const row of state.rows) schedule(row.record.account.accountId);
  }
  async function confirmReview() {
    const value = state.review;
    if (!value || !options.canWrite || state.singleBusy || single) return;
    emit({ review: null });
    if (value.kind === 'provenance') {
      const row = find(value.accountId);
      if (!row || row.revision !== value.revision || row.year !== value.year) return;
      replace(value.accountId, {
        confirmation: 'confirmed',
        revision: row.revision + 1,
        status: 'draft',
      });
      emit();
      for (const item of state.rows) schedule(item.record.account.accountId);
    } else if (value.kind === 'clear') {
      const row = find(value.command.item.accountId);
      if (!row || row.revision !== value.revision) return;
      single = {
        command: value.command,
        revision: value.revision,
        prepared: client.prepareCommand(value.command),
      };
      await runSingle();
      for (const item of state.rows) schedule(item.record.account.accountId);
    } else await batch.start(value.command);
  }
  function canRefresh() {
    return (
      state.state === 'ready' &&
      !active &&
      !background &&
      !single &&
      !navigationPaused &&
      !state.review &&
      !state.singleFailure &&
      state.batch.state === 'idle' &&
      !state.rows.some(birthDirtyV1) &&
      now() >= state.retryAt
    );
  }
  async function refresh(append = false) {
    if (!canRefresh()) return;
    const current = generation,
      controller = new AbortController();
    background = controller;
    emit({ refreshing: true });
    try {
      const page = options.continuous
        ? await readBirthCollectionV1(
            client,
            reader,
            scope,
            controller.signal,
            append ? 1000 : Math.max(1000, state.rows.length),
            append && state.next
              ? {
                  rows: state.rows.map((row) => row.record),
                  next: state.next,
                  scopeVersion: state.scopeVersion,
                }
              : undefined,
          )
        : await readBirthPageV1(client, reader, scope, options.cursor, controller.signal);
      if (current !== generation || controller.signal.aborted) return;
      // A user may start typing or a command may begin while this read is in flight.
      if (
        active ||
        single ||
        state.review ||
        navigationPaused ||
        state.batch.state !== 'idle' ||
        state.rows.some(birthDirtyV1)
      )
        return;
      const previous = new Map(state.rows.map((row) => [row.record.account.accountId, row]));
      emit({
        rows: page.rows.map((record) => {
          const old = previous.get(record.account.accountId);
          return {
            ...birthDraftRowV1(record),
            selected: old?.selected ?? false,
            status: old?.status === 'saved' ? ('saved' as const) : ('idle' as const),
          };
        }),
        scopeVersion: page.scopeVersion,
        next: page.next,
        refreshError: undefined,
        retryAt: 0,
      });
    } catch (error) {
      if (current !== generation || controller.signal.aborted) return;
      const failure = birthErrorV1(error);
      if (birthProtectedFailureV1(failure)) protectedFailure(failure);
      else
        emit({
          refreshError: failure,
          retryAt: now() + Math.max(5, failure.retryAfterSeconds ?? 0) * 1000,
        });
    } finally {
      if (background === controller) {
        background = undefined;
        emit({ refreshing: false });
      }
    }
  }
  return {
    load,
    refresh: () => refresh(false),
    loadMore: () => (state.next && options.continuous ? refresh(true) : Promise.resolve()),
    canRefresh,
    clear,
    edit,
    review,
    cancelReview,
    confirmReview,
    suspendDrafts() {
      navigationPaused = true;
      stopTimers();
    },
    resumeDrafts() {
      navigationPaused = false;
      for (const row of state.rows) schedule(row.record.account.accountId);
    },
    async flush(id: string) {
      if (!editable() || state.mode !== 'single') return;
      const row = find(id);
      if (
        options.confirmOnEdit &&
        row &&
        validBirthYearV1(row.year) &&
        row.confirmation !== 'confirmed'
      ) {
        replace(id, { confirmation: 'confirmed', revision: row.revision + 1, status: 'draft' });
        emit();
      }
      const timer = timers.get(id);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(id);
      queued.add(id);
      await drain();
    },
    retry() {
      if (state.singleFailure?.retryable) return runSingle();
    },
    restore(id: string) {
      const row = find(id);
      if (!editable() || !row || single?.command.item.accountId === id) return;
      const timer = timers.get(id);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(id);
      queued.delete(id);
      replace(id, {
        ...birthDraftRowV1(row.record),
        revision: row.revision + 1,
        selected: row.selected,
      });
      emit();
    },
    select(id: string, selected: boolean) {
      if (editable() && state.mode === 'batch') {
        replace(id, { selected });
        emit();
      }
    },
    selectAll(selected: boolean) {
      if (!editable() || state.mode !== 'batch') return;
      emit({ rows: state.rows.map((row) => ({ ...row, selected })) });
    },
    setMode(mode: 'single' | 'batch') {
      if (
        !editable() ||
        single ||
        state.singleBusy ||
        state.rows.some(birthDirtyV1) ||
        (mode === 'batch' && scope.kind !== 'class')
      )
        return;
      stopTimers();
      emit({ mode, rows: state.rows.map((row) => ({ ...row, selected: false })) });
    },
    pauseBatch: batch.pause,
    resumeBatch: batch.resume,
  };
}
export type BirthEditorV1 = ReturnType<typeof createBirthEditorV1>;
