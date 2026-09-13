import { PortalClientErrorV1 } from './transport-v1';

export type PortalLoadStateV1<T> = { state: 'idle' | 'loading' } | { state: 'ready'; data: T }
  | { state: 'error'; error: PortalClientErrorV1 };

/** A scope switch clears protected data immediately, even when a fetch ignores abort. */
export function createLatestPortalRequestV1<T>(publish: (state: PortalLoadStateV1<T>) => void) {
  let generation = 0;
  let active: AbortController | undefined;
  return {
    clear() { generation += 1; active?.abort(); active = undefined; publish({ state: 'idle' }); },
    async run(load: (signal: AbortSignal) => Promise<T>) {
      const current = ++generation;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      publish({ state: 'loading' });
      try {
        const data = await load(controller.signal);
        if (current === generation && !controller.signal.aborted) publish({ state: 'ready', data });
      } catch (error) {
        if (current === generation && !controller.signal.aborted)
          publish({ state: 'error', error: error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('network-error') });
      } finally { if (current === generation) active = undefined; }
    },
  };
}
