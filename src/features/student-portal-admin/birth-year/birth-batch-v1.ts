import type { AdminResponseV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { birthErrorV1, birthRetryableV1, type BirthBatchCommandV1 } from './birth-values-v1';

export type BirthBatchOutcomeV1 = Extract<AdminResponseV1, { state: 'batch' }>['items'][number];
export interface BirthBatchStateV1 {
  state: 'idle' | 'running' | 'waiting' | 'paused' | 'complete' | 'error';
  outcomes: BirthBatchOutcomeV1[];
  rounds: number;
  retryAt: number;
  retryable: boolean;
  pauseRequested?: boolean;
  error?: PortalClientErrorV1;
  reason?: 'operator' | 'budget' | 'stalled' | 'expired';
}
export const emptyBirthBatchV1 = (): BirthBatchStateV1 => ({
  state: 'idle',
  outcomes: [],
  rounds: 0,
  retryAt: 0,
  retryable: false,
});
const RUN_MS = 120_000,
  MAX_ROUNDS = 100,
  RECEIPT_MS = 23 * 60 * 60 * 1000;

/** Sequential replay of one immutable operation. A pause stops future calls, not commits. */
export function createBirthBatchV1(
  client: PortalAdminClientV1,
  classId: number,
  publish: (state: BirthBatchStateV1) => void,
  now = Date.now,
) {
  let state = emptyBirthBatchV1(),
    generation = 0,
    pending = false,
    automatic = false;
  let prepared: ReturnType<PortalAdminClientV1['prepareCommand']> | undefined;
  let ids: string[] = [],
    operationId: string | undefined,
    started = 0,
    runStarted = 0,
    runRounds = 0,
    stalls = 0;
  let active: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (patch: Partial<BirthBatchStateV1>) => {
    state = { ...state, ...patch };
    publish({ ...state, outcomes: state.outcomes.map((x) => ({ ...x })) });
  };
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  function schedule(progress: boolean) {
    if (!automatic) {
      emit({ state: 'paused', reason: 'operator', retryable: true });
      return;
    }
    if (runRounds >= MAX_ROUNDS || now() - runStarted >= RUN_MS) {
      automatic = false;
      emit({ state: 'paused', reason: 'budget', retryable: true });
      return;
    }
    if (stalls >= 3) {
      automatic = false;
      emit({ state: 'paused', reason: 'stalled', retryable: true });
      return;
    }
    const retryAt = Math.max(
      state.retryAt,
      now() + (progress ? 1000 : Math.min(8000, 1000 * 2 ** stalls)),
    );
    if (retryAt - runStarted >= RUN_MS) {
      automatic = false;
      emit({ state: 'paused', reason: 'budget', retryable: true, retryAt });
      return;
    }
    emit({ state: 'waiting', retryAt, retryable: true });
    timer = setTimeout(
      () => {
        timer = undefined;
        void run();
      },
      Math.max(0, retryAt - now()),
    );
  }
  async function run() {
    if (pending || !prepared || now() < state.retryAt) return;
    if (now() - started >= RECEIPT_MS) {
      automatic = false;
      prepared = undefined;
      emit({ state: 'error', reason: 'expired', retryable: false });
      return;
    }
    const current = generation,
      controller = new AbortController(),
      command = prepared;
    active = controller;
    pending = true;
    runRounds++;
    emit({
      state: 'running',
      rounds: state.rounds + 1,
      retryable: false,
      error: undefined,
      reason: undefined,
    });
    let progress = false,
      mayContinue = true;
    try {
      const result = await command.execute(controller.signal);
      if (current !== generation || controller.signal.aborted) return;
      if (
        result.state !== 'batch' ||
        (operationId && operationId !== result.operationId) ||
        result.items.length !== ids.length ||
        new Set(result.items.map((x) => x.accountId)).size !== ids.length
      )
        throw new PortalClientErrorV1('invalid-response');
      const incoming = new Map(result.items.map((x) => [x.accountId, x]));
      const previous = new Map(state.outcomes.map((x) => [x.accountId, x]));
      for (const id of ids) {
        const item = incoming.get(id),
          before = previous.get(id);
        if (
          !item ||
          (before &&
            before.state !== 'unavailable' &&
            (before.state !== item.state || before.version !== item.version))
        )
          throw new PortalClientErrorV1('invalid-response');
      }
      operationId = result.operationId;
      progress =
        result.items.filter((x) => x.state !== 'unavailable').length >
        state.outcomes.filter((x) => x.state !== 'unavailable').length;
      stalls = progress ? 0 : stalls + 1;
      emit({ outcomes: ids.map((id) => incoming.get(id)!), retryAt: 0 });
      if (result.items.every((x) => x.state !== 'unavailable')) {
        prepared = undefined;
        automatic = false;
        mayContinue = false;
        emit({ state: 'complete', retryable: false, pauseRequested: false });
      }
    } catch (error) {
      if (current !== generation || controller.signal.aborted) return;
      const failure = birthErrorV1(error),
        retryable = birthRetryableV1(failure);
      stalls++;
      emit({ error: failure, retryAt: now() + (failure.retryAfterSeconds ?? 0) * 1000, retryable });
      if (!retryable) {
        prepared = undefined;
        automatic = false;
        mayContinue = false;
        emit({ state: 'error' });
      }
    } finally {
      if (current === generation) {
        pending = false;
        active = undefined;
        if (mayContinue && prepared) schedule(progress);
      }
    }
  }
  return {
    start(command: BirthBatchCommandV1) {
      if (pending || prepared || command.classId !== classId) return;
      prepared = client.prepareCommand(command);
      ids = command.items.map((x) => x.accountId);
      operationId = undefined;
      started = now();
      runStarted = started;
      runRounds = 0;
      stalls = 0;
      automatic = true;
      state = emptyBirthBatchV1();
      return run();
    },
    resume() {
      if (pending || !prepared || now() < state.retryAt) return;
      stopTimer();
      automatic = true;
      runStarted = now();
      runRounds = 0;
      stalls = 0;
      emit({ pauseRequested: false });
      return run();
    },
    pause() {
      automatic = false;
      stopTimer();
      if (!prepared) return;
      emit(
        pending
          ? { pauseRequested: true }
          : { state: 'paused', reason: 'operator', retryable: true },
      );
    },
    clear() {
      generation++;
      active?.abort();
      active = undefined;
      stopTimer();
      prepared = undefined;
      ids = [];
      operationId = undefined;
      pending = false;
      automatic = false;
      state = emptyBirthBatchV1();
      publish(state);
    },
  };
}
