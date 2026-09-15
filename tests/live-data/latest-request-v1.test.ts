import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLatestPortalRequestV1, type PortalLoadStateV1 } from '../../src/features/student-portal/shared/latest-request-v1';
import { PortalClientErrorV1 } from '../../src/features/student-portal/shared/transport-v1';

afterEach(() => vi.useRealTimers());
describe('silent read boundaries', () => {
  it('preserves the same visible object while refreshing, then applies the confirmed response', async () => {
    const states: PortalLoadStateV1<{ value: number }>[] = [];
    const reader = createLatestPortalRequestV1<{ value: number }>((state) => states.push(state));
    const first = { value: 1 };
    await reader.run(async () => first);
    let resolve!: (value: { value: number }) => void;
    const next = reader.run(() => new Promise((done) => { resolve = done; }), { background: true });
    expect(states.at(-1)).toEqual({ state: 'ready', data: first, refreshing: true });
    const duplicate = vi.fn(async () => ({ value: 9 }));
    await reader.run(duplicate, { background: true });
    expect(duplicate).not.toHaveBeenCalled();
    resolve({ value: 2 }); await next;
    expect(states.at(-1)).toEqual({ state: 'ready', data: { value: 2 } });
  });
  it('reports a transient refresh error without clearing the view, but clears after denial', async () => {
    const publish = vi.fn();
    const reader = createLatestPortalRequestV1(publish);
    await reader.run(async () => 'authorized');
    await reader.run(async () => { throw new PortalClientErrorV1('unavailable', 503); }, { background: true });
    expect(publish.mock.lastCall?.[0]).toMatchObject({ state: 'ready', data: 'authorized', refreshError: { state: 'unavailable' } });
    await reader.run(async () => { throw new PortalClientErrorV1('unauthenticated', 401); }, { background: true });
    expect(publish.mock.lastCall?.[0]).toMatchObject({ state: 'error', error: { state: 'unauthenticated' } });
  });
  it('bounds stale retention and never restores a cleared context from an obsolete read', async () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const reader = createLatestPortalRequestV1(publish);
    await reader.run(async () => 'first');
    vi.advanceTimersByTime(60_001);
    await reader.run(async () => { throw new PortalClientErrorV1('unavailable'); }, { background: true });
    expect(publish.mock.lastCall?.[0].state).toBe('error');
    let resolve!: (value: string) => void;
    const pending = reader.run(() => new Promise<string>((done) => { resolve = done; }));
    reader.clear(); resolve('obsolete'); await pending;
    expect(publish.mock.lastCall?.[0]).toEqual({ state: 'idle' });
  });
});
