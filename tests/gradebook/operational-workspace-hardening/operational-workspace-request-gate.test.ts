import { describe, expect, it } from 'vitest';
import { createOperationalWorkspaceRequestGate } from '../../../src/features/gradebook/operational-workspace/operational-workspace-request-gate';

describe('operational workspace latest-request gate', () => {
  it('aborts older work before a new context can become current', () => {
    const gate = createOperationalWorkspaceRequestGate();
    const previous = gate.begin('synthetic-context-a');
    expect(previous).not.toBeNull();

    const next = gate.begin('synthetic-context-b');
    expect(next).not.toBeNull();
    expect(previous?.signal.aborted).toBe(true);
    expect(previous?.isCurrent()).toBe(false);
    expect(next?.signal.aborted).toBe(false);
    expect(next?.isCurrent()).toBe(true);

    previous?.complete();
    expect(next?.isCurrent()).toBe(true);
    next?.complete();
  });

  it('deduplicates the same in-flight request without blocking a later retry', () => {
    const gate = createOperationalWorkspaceRequestGate();
    const first = gate.begin('synthetic-search-page');
    expect(first).not.toBeNull();
    expect(gate.begin('synthetic-search-page')).toBeNull();

    first?.complete();
    const retry = gate.begin('synthetic-search-page');
    expect(retry).not.toBeNull();
    expect(retry?.isCurrent()).toBe(true);
    retry?.complete();
  });

  it('invalidates pending work when the UI clears or unmounts its context', () => {
    const gate = createOperationalWorkspaceRequestGate();
    const request = gate.begin('synthetic-detail');
    expect(request).not.toBeNull();

    gate.invalidate();
    expect(request?.signal.aborted).toBe(true);
    expect(request?.isCurrent()).toBe(false);
  });
});
