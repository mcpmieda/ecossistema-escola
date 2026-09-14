import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminResponseV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import {
  createBirthBatchV1,
  emptyBirthBatchV1,
  type BirthBatchStateV1,
} from '../../../../src/features/student-portal-admin/birth-year/birth-batch-v1';
import type { BirthBatchCommandV1 } from '../../../../src/features/student-portal-admin/birth-year/birth-values-v1';
import { BIRTH_CLASS_V1, BIRTH_META_V1, birthJsonV1, birthMockV1 } from './fixtures-v1';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T20:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});
function command(mock: ReturnType<typeof birthMockV1>): BirthBatchCommandV1 {
  return {
    contractVersion: 1,
    operation: 'birth-batch',
    idempotencyKey: crypto.randomUUID(),
    expectedVersion: mock.scopeVersion,
    classId: BIRTH_CLASS_V1.classId,
    expectedCount: mock.accounts.length,
    confirmed: true,
    items: mock.accounts.map((account, i) => ({
      action: 'set',
      accountId: account.accountId,
      expectedVersion: mock.births.get(account.accountId)!.version,
      year: String(2001 + (i % 10)),
      confirmation: 'unconfirmed-test',
    })),
  };
}
describe('birth batch receipt replay', () => {
  it('resumes100 bounded invocations with exactly the same body and monotonic actual outcomes', async () => {
    const mock = birthMockV1({ count: 100 });
    let state = emptyBirthBatchV1();
    const counts: number[] = [];
    const runner = createBirthBatchV1(mock.client, BIRTH_CLASS_V1.classId, (value) => {
      state = value;
      counts.push(value.outcomes.filter((x) => x.state === 'committed').length);
    });
    await runner.start(command(mock));
    expect(state.outcomes.filter((x) => x.state === 'committed')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(state.state).toBe('complete');
    expect(mock.writes).toHaveLength(100);
    expect(new Set(mock.bodies).size).toBe(1);
    expect(state.outcomes.every((x) => x.state === 'committed')).toBe(true);
    expect(counts.every((count, i) => i === 0 || count >= counts[i - 1]!)).toBe(true);
    expect(mock.births.get(mock.accounts[0]!.accountId)?.confirmation).toBe('unconfirmed-test');
    runner.clear();
  });
  it('pauses future calls while an in-flight commit settles, then resumes the same receipt', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mock = birthMockV1({
      write: async (input) => {
        await gate;
        return mock.defaultWrite(input);
      },
    });
    let state = emptyBirthBatchV1();
    const runner = createBirthBatchV1(mock.client, BIRTH_CLASS_V1.classId, (value) => {
      state = value;
    });
    const running = runner.start(command(mock));
    runner.pause();
    expect(state.pauseRequested).toBe(true);
    release();
    await running;
    expect(state.state).toBe('paused');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mock.writes).toHaveLength(1);
    await runner.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.state).toBe('complete');
    expect(new Set(mock.bodies).size).toBe(1);
    runner.clear();
  });
  it('retains a lost reply and honors Retry-After before replaying committed items', async () => {
    let attempt = 0;
    const mock = birthMockV1({
      write: async (input) => {
        attempt++;
        if (attempt === 1) {
          mock.defaultWrite(input);
          throw new Error('synthetic-lost-response');
        }
        if (attempt === 2)
          return birthJsonV1(
            { ...BIRTH_META_V1, state: 'rate-limited', retryAfterSeconds: 30 },
            429,
          );
        return mock.defaultWrite(input);
      },
    });
    let state = emptyBirthBatchV1();
    const runner = createBirthBatchV1(mock.client, BIRTH_CLASS_V1.classId, (value) => {
      state = value;
    });
    await runner.start(command(mock));
    expect(state.outcomes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mock.writes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(27_000);
    expect(mock.writes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(state.state).toBe('complete');
    expect(mock.writes).toHaveLength(4);
    expect(new Set(mock.bodies).size).toBe(1);
    runner.clear();
  });
  it('stops after three stalled responses and preserves the immutable operation for manual resumption', async () => {
    let stalled = true;
    const mock = birthMockV1({
      write: async (input) =>
        input.operation === 'birth-batch' && stalled
          ? birthJsonV1({
              ...BIRTH_META_V1,
              state: 'batch',
              operationId: input.idempotencyKey,
              items: input.items.map((item) => ({
                accountId: item.accountId,
                state: 'unavailable',
                version: item.expectedVersion,
              })),
            })
          : mock.defaultWrite(input),
    });
    let state = emptyBirthBatchV1();
    const runner = createBirthBatchV1(mock.client, BIRTH_CLASS_V1.classId, (value) => {
      state = value;
    });
    await runner.start(command(mock));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state).toMatchObject({ state: 'paused', reason: 'stalled' });
    expect(mock.writes).toHaveLength(3);
    stalled = false;
    await runner.resume();
    await vi.advanceTimersByTimeAsync(3000);
    expect(state.state).toBe('complete');
    expect(new Set(mock.bodies).size).toBe(1);
    runner.clear();
  });
  it('rejects regression of a committed result without losing the confirmed result', async () => {
    let calls = 0;
    const mock = birthMockV1({
      write: async (input) => {
        calls++;
        const response = mock.defaultWrite(input);
        if (calls === 1) return response;
        const result = adminResponseV1.parse(await response.json());
        if (result.state !== 'batch') throw new Error('synthetic-unexpected-response');
        result.items[0]!.state = 'unavailable';
        return birthJsonV1(result);
      },
    });
    let state: BirthBatchStateV1 = emptyBirthBatchV1();
    const runner = createBirthBatchV1(mock.client, BIRTH_CLASS_V1.classId, (value) => {
      state = value;
    });
    await runner.start(command(mock));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.state).toBe('paused');
    expect(state.error?.state).toBe('invalid-response');
    expect(state.outcomes[0]?.state).toBe('committed');
    runner.clear();
  });
  it('clears timers and ignores late responses on scope exit; controller can be reused after StrictMode cleanup', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let block = true;
    const mock = birthMockV1({
      write: async (input) => {
        if (block) await gate;
        return mock.defaultWrite(input);
      },
    });
    let state = emptyBirthBatchV1();
    const runner = createBirthBatchV1(mock.client, BIRTH_CLASS_V1.classId, (value) => {
      state = value;
    });
    const pending = runner.start(command(mock));
    runner.clear();
    release();
    await pending;
    expect(state).toEqual(emptyBirthBatchV1());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mock.writes).toHaveLength(1);
    block = false;
    await runner.start(command(mock));
    await vi.advanceTimersByTimeAsync(3000);
    expect(state.state).toBe('complete');
    runner.clear();
  });
  it('never resumes after its conservative receipt window and requires a fresh review', async () => {
    const mock = birthMockV1();
    let state = emptyBirthBatchV1();
    const runner = createBirthBatchV1(mock.client, BIRTH_CLASS_V1.classId, (value) => {
      state = value;
    });
    await runner.start(command(mock));
    runner.pause();
    await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
    await runner.resume();
    expect(state).toMatchObject({ state: 'error', reason: 'expired', retryable: false });
    expect(mock.writes).toHaveLength(1);
    runner.clear();
  });
});
