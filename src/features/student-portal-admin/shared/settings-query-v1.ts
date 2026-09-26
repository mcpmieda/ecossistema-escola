import type { AdminResponseV1 } from '../../../../shared/student-portal-contracts/admin-v1';

interface PendingSettingsV1 {
  controller: AbortController;
  consumers: Set<symbol>;
  promise: Promise<AdminResponseV1>;
  settled: boolean;
}

/** Shares only identical in-flight authorized reads. No response survives settlement. */
export function createSettingsQueryV1() {
  const pending = new Map<string, PendingSettingsV1>();
  const query = (
    key: string,
    read: (signal: AbortSignal) => Promise<AdminResponseV1>,
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    let entry = pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created: PendingSettingsV1 = {
        controller,
        consumers: new Set(),
        settled: false,
        promise: Promise.resolve()
          .then(() => read(controller.signal))
          .finally(() => {
            created.settled = true;
            if (pending.get(key) === created) pending.delete(key);
          }),
      };
      entry = created;
      pending.set(key, entry);
    }
    const current = entry;
    const token = Symbol();
    current.consumers.add(token);
    return new Promise<AdminResponseV1>((resolve, reject) => {
      const release = () => {
        signal?.removeEventListener('abort', abort);
        current.consumers.delete(token);
        if (!current.settled && current.consumers.size === 0) {
          if (pending.get(key) === current) pending.delete(key);
          current.controller.abort();
        }
      };
      const abort = () => {
        release();
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then(
        (value) => {
          release();
          if (signal?.aborted) reject(signal.reason);
          else resolve(value);
        },
        (error: unknown) => {
          release();
          reject(error);
        },
      );
    });
  };
  // Existing consumers retain their request; future reads cannot join across a possible write.
  return Object.assign(query, { invalidate: () => pending.clear() });
}
