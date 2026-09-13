import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionMutationV1,
  type RevokeCommandV1,
  type SessionMutationStateV1,
} from '../../../../src/features/student-portal-admin/sessions/session-mutation-v1';
import {
  operationsMockV1,
  opIdV1,
  opJsonV1,
  OP_ACCOUNT_V1,
  OP_META_V1,
} from '../overview/fixtures-v1';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const input = (): RevokeCommandV1 => ({
  contractVersion: 1,
  operation: 'sessions-revoke',
  scope: OP_ACCOUNT_V1,
  expectedVersion: 11,
  idempotencyKey: opIdV1(999),
  confirmed: true,
});
describe('session revocation receipts and cancellation', () => {
  it('retries identical captured bytes/CAS despite caller changes and prevents replacing an uncertain intent', async () => {
    let calls = 0;
    const mock = operationsMockV1({
      write: () =>
        ++calls === 1 ? Promise.reject(new Error('synthetic lost response')) : undefined,
    });
    const states: SessionMutationStateV1[] = [];
    const op = createSessionMutationV1(mock.client, true, (s) => states.push(s));
    const command = input();
    await op.submit(command);
    command.expectedVersion = 900;
    await op.submit({ ...input(), sessionId: opIdV1(100) });
    expect(mock.writes).toHaveLength(1);
    await op.retry();
    expect(mock.bodies[0]).toBe(mock.bodies[1]);
    expect(states.at(-1)).toMatchObject({ state: 'committed', version: 12 });
    expect(mock.receipts.size).toBe(1);
  });
  it('honors Retry-After and expires uncertain retries before the 24h server receipt window', async () => {
    let now = 0;
    const mock = operationsMockV1({
      write: () =>
        Promise.resolve(
          opJsonV1({ ...OP_META_V1, state: 'rate-limited' }, 429, { 'Retry-After': '30' }),
        ),
    });
    const states: SessionMutationStateV1[] = [];
    const op = createSessionMutationV1(
      mock.client,
      true,
      (s) => states.push(s),
      () => now,
    );
    await op.submit(input());
    await op.retry();
    expect(mock.writes).toHaveLength(1);
    now = 30_000;
    await op.retry();
    expect(mock.writes).toHaveLength(2);
    now = 23 * 3600_000;
    await op.retry();
    expect(mock.writes).toHaveLength(2);
    expect(states.at(-1)).toEqual({ state: 'expired' });
  });
  it.each([
    ['conflict', 409],
    ['forbidden', 403],
    ['unauthenticated', 401],
  ] as const)('does not replay %s', async (state, status) => {
    const mock = operationsMockV1({
      write: () => Promise.resolve(opJsonV1({ ...OP_META_V1, state }, status)),
    });
    const states: SessionMutationStateV1[] = [];
    const op = createSessionMutationV1(mock.client, true, (s) => states.push(s));
    await op.submit(input());
    await op.retry();
    expect(mock.writes).toHaveLength(1);
    expect(states.at(-1)).toMatchObject({ state: 'error', retryable: false });
  });
  it('clears late responses and remains reusable after StrictMode cleanup; read-only cannot write', async () => {
    let release: ((value: Response) => void) | undefined,
      calls = 0;
    const mock = operationsMockV1({
      write: () =>
        ++calls === 1
          ? new Promise((resolve) => {
              release = resolve;
            })
          : undefined,
    });
    const states: SessionMutationStateV1[] = [];
    const op = createSessionMutationV1(mock.client, true, (s) => states.push(s));
    const pending = op.submit(input());
    op.clear();
    release!(
      opJsonV1({ ...OP_META_V1, state: 'committed', operationId: opIdV1(900), version: 12 }),
    );
    await pending;
    expect(states.at(-1)).toEqual({ state: 'idle' });
    await op.submit(input());
    expect(states.at(-1)?.state).toBe('committed');
    const readonly = createSessionMutationV1(mock.client, false, () => {});
    await readonly.submit(input());
    expect(mock.writes).toHaveLength(2);
  });
});
