import type { AdminResponseV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import type { AccountCommandV1 } from './accounts-values-v1';

export type AccountQrResultV1 = Extract<AdminResponseV1, { state: 'qr' }>;
export type AccountMutationStateV1 =
  | { state: 'idle' | 'pending' }
  | {
      state: 'committed';
      version: number;
      operation?: AccountCommandV1['operation'];
      artifact: 'none' | 'preparing' | 'offered' | 'unavailable';
    }
  | { state: 'error'; error: PortalClientErrorV1; retryable: boolean; retryAt: number };

/** Credentials exist only in the handoff callback, never in generic presentation state. */
export function createAccountMutationV1(
  client: PortalAdminClientV1,
  accountId: string,
  publish: (state: AccountMutationStateV1) => void,
  onQr?: (result: AccountQrResultV1, signal: AbortSignal) => void | Promise<void>,
  now = Date.now,
) {
  let generation = 0,
    pending = false,
    retryAt = 0;
  let active: AbortController | undefined;
  let prepared: ReturnType<PortalAdminClientV1['prepareCommand']> | undefined;
  let operation: AccountCommandV1['operation'] | undefined;
  async function run() {
    if (pending || !prepared || now() < retryAt) return;
    const command = prepared,
      completedOperation = operation,
      current = ++generation,
      controller = new AbortController();
    active = controller;
    pending = true;
    publish({ state: 'pending' });
    try {
      const result = await command.execute(controller.signal);
      if (current !== generation || controller.signal.aborted) return;
      if (result.state !== 'committed' && result.state !== 'qr')
        throw new PortalClientErrorV1('invalid-response');
      if (
        operation === 'qr-regenerate'
          ? result.state !== 'qr' ||
            result.cards.length !== 1 ||
            result.cards[0]?.accountId !== accountId
          : result.state !== 'committed'
      )
        throw new PortalClientErrorV1('invalid-response');
      prepared = undefined;
      operation = undefined;
      const committed = {
        state: 'committed' as const,
        version: result.version,
        operation: completedOperation,
        artifact: result.state === 'qr' ? ('unavailable' as const) : ('none' as const),
      };
      publish(result.state === 'qr' && onQr ? { ...committed, artifact: 'preparing' } : committed);
      if (result.state === 'qr' && onQr) {
        try {
          await onQr(result, controller.signal);
          if (current === generation && !controller.signal.aborted)
            publish({ ...committed, artifact: 'offered' });
        } catch {
          // The server already committed. Reprinting is separate; never retry the rotation.
          if (current === generation && !controller.signal.aborted) publish(committed);
        }
      }
    } catch (error) {
      if (current !== generation || controller.signal.aborted) return;
      const failure =
        error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('network-error');
      const retryable = [
        'network-error',
        'invalid-response',
        'unavailable',
        'rate-limited',
      ].includes(failure.state);
      retryAt = now() + (failure.retryAfterSeconds ?? 0) * 1000;
      if (!retryable) {
        prepared = undefined;
        operation = undefined;
      }
      publish({ state: 'error', error: failure, retryable, retryAt });
    } finally {
      if (current === generation) {
        pending = false;
        active = undefined;
      }
    }
  }
  return {
    async submit(command: AccountCommandV1) {
      if (pending || prepared) return;
      if (
        command.accountId !== accountId ||
        !['block', 'password-reset', 'account-reset', 'qr-regenerate'].includes(command.operation)
      )
        throw new PortalClientErrorV1('invalid-request');
      prepared = client.prepareCommand(command);
      operation = command.operation;
      retryAt = 0;
      await run();
    },
    retry: run,
    clear() {
      generation++;
      active?.abort();
      active = undefined;
      prepared = undefined;
      operation = undefined;
      pending = false;
      retryAt = 0;
      publish({ state: 'idle' });
    },
  };
}
