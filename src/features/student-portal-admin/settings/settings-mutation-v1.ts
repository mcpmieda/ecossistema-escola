import type { AdminCommandV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';

export type SettingsCommandV1 = Extract<
  AdminCommandV1,
  { operation: 'settings-set' | 'settings-inherit' | 'links-close' }
>;
export type SettingsMutationStateV1 =
  | { state: 'idle' | 'pending' }
  | { state: 'committed'; version: number }
  | { state: 'error'; error: PortalClientErrorV1; retryable: boolean; retryAt: number };

/** Same intended command keeps the original bytes, CAS and idempotency key on an uncertain retry. */
export function createSettingsMutationV1(
  client: PortalAdminClientV1,
  publish: (state: SettingsMutationStateV1) => void,
  now: () => number = Date.now,
) {
  let generation = 0,
    disposed = false,
    pending = false;
  let active: AbortController | undefined;
  let prepared: ReturnType<PortalAdminClientV1['prepareCommand']> | undefined;
  let retryAt = 0;
  async function run() {
    if (disposed || pending || !prepared || now() < retryAt) return;
    const command = prepared,
      current = ++generation;
    const controller = new AbortController();
    active = controller;
    pending = true;
    publish({ state: 'pending' });
    try {
      const result = await command.execute(controller.signal);
      if (disposed || current !== generation || controller.signal.aborted) return;
      if (result.state !== 'committed') throw new PortalClientErrorV1('invalid-response');
      prepared = undefined;
      publish({ state: 'committed', version: result.version });
    } catch (error) {
      if (disposed || current !== generation || controller.signal.aborted) return;
      const failure =
        error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('network-error');
      const retryable = [
        'network-error',
        'invalid-response',
        'unavailable',
        'rate-limited',
      ].includes(failure.state);
      retryAt = now() + (failure.retryAfterSeconds ?? 0) * 1000;
      if (!retryable) prepared = undefined;
      publish({ state: 'error', error: failure, retryable, retryAt });
    } finally {
      if (current === generation) {
        pending = false;
        active = undefined;
      }
    }
  }
  function clear() {
    generation++;
    active?.abort();
    active = undefined;
    prepared = undefined;
    pending = false;
    retryAt = 0;
    if (!disposed) publish({ state: 'idle' });
  }
  return {
    async submit(command: SettingsCommandV1) {
      if (disposed || pending) return;
      if (!['settings-set', 'settings-inherit', 'links-close'].includes(command.operation))
        throw new PortalClientErrorV1('invalid-request');
      prepared = client.prepareCommand(command);
      retryAt = 0;
      await run();
    },
    retry: run,
    clear,
    dispose() {
      disposed = true;
      clear();
    },
  };
}
