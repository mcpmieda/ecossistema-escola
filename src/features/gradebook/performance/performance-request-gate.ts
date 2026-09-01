export interface PerformanceRequestTicketV1 {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  complete(): void;
}

export interface PerformanceRequestGateV1 {
  begin(key: string): PerformanceRequestTicketV1 | null;
  invalidate(): void;
}

interface ActiveRequestV1 {
  readonly key: string;
  readonly generation: number;
  readonly controller: AbortController;
}

/** One latest-request gate per UI concern: abort older work, deduplicate in-flight keys and reject stale completions. */
export function createPerformanceRequestGateV1(): PerformanceRequestGateV1 {
  let generation = 0;
  let active: ActiveRequestV1 | null = null;

  return {
    begin(key) {
      if (active?.key === key && !active.controller.signal.aborted) return null;

      active?.controller.abort();
      const controller = new AbortController();
      const requestGeneration = ++generation;
      active = { key, generation: requestGeneration, controller };

      return {
        signal: controller.signal,
        isCurrent() {
          return generation === requestGeneration && !controller.signal.aborted;
        },
        complete() {
          if (active?.generation === requestGeneration) active = null;
        },
      };
    },
    invalidate() {
      generation += 1;
      active?.controller.abort();
      active = null;
    },
  };
}
