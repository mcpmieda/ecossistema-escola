import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createQrOperationV1,
  type QrCommandV1,
  type QrOperationStateV1,
} from '../../../../src/features/student-portal-admin/credentials/qr-operation-v1';
import { QR_META_V1, qrJsonV1, qrMockV1, syntheticQrRendererV1 } from './fixtures-v1';
import { qrPrintCardsV1, qrPrintIdV1 } from '../../qr-print/fixtures-v1';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const command = (overrides: Partial<QrCommandV1> = {}): QrCommandV1 =>
  ({
    contractVersion: 1,
    operation: 'qr-batch',
    classId: 755001,
    expectedVersion: 755,
    accountIds: [qrPrintIdV1(1)],
    mode: 'qr-name-class',
    confirmed: true,
    idempotencyKey: qrPrintIdV1(9900),
    ...overrides,
  }) as QrCommandV1;
function setup(mock = qrMockV1(), render = syntheticQrRendererV1, now = Date.now) {
  const states: QrOperationStateV1[] = [];
  const op = createQrOperationV1({
    client: mock.client,
    canWrite: true,
    publish: (state) => states.push(state),
    render,
    now,
  });
  return { mock, states, op };
}
describe('private credential operation lifecycle', () => {
  it('retries the exact command after a lost response and validates fresh receipt cards', async () => {
    let count = 0;
    const mock = qrMockV1({
      write: () =>
        ++count === 1 ? Promise.reject(new Error('lost synthetic response')) : undefined,
    });
    const { op, states } = setup(mock);
    const input = command();
    await op.submit(input, 'pdf');
    if (input.operation === 'qr-batch') input.accountIds = [qrPrintIdV1(2)];
    expect(states.at(-1)).toMatchObject({ state: 'error', stage: 'request', retryable: true });
    await op.retry();
    expect(mock.bodies[0]).toBe(mock.bodies[1]);
    expect(mock.receipts.size).toBe(1);
    expect(states.at(-1)).toMatchObject({ state: 'ready', count: 1, format: 'pdf' });
    expect(JSON.stringify(states)).not.toContain('SYNTHETIC');
    expect(JSON.stringify(states)).not.toContain('/access#');
    op.clear();
  });
  it('retries only local rendering after the server has committed', async () => {
    let renders = 0;
    const { op, states, mock } = setup(qrMockV1(), async (...args) => {
      if (++renders === 1) throw new Error('synthetic raster failure');
      return syntheticQrRendererV1(...args);
    });
    await op.submit(command(), 'pdf');
    expect(states.at(-1)).toMatchObject({ state: 'error', stage: 'render', retryable: true });
    await op.retry();
    expect(mock.writes).toHaveLength(1);
    expect(renders).toBe(2);
    expect(states.at(-1)).toMatchObject({ state: 'ready' });
    op.clear();
  });
  it('honors Retry-After and refuses an expired 23h receipt rather than creating a new intent', async () => {
    let time = 1000;
    const mock = qrMockV1({
      write: () =>
        Promise.resolve(
          qrJsonV1({ ...QR_META_V1, state: 'rate-limited', retryAfterSeconds: 30 }, 429, {
            'Retry-After': '30',
          }),
        ),
    });
    const { op, states } = setup(mock, syntheticQrRendererV1, () => time);
    await op.submit(command(), 'pdf');
    await op.retry();
    expect(mock.writes).toHaveLength(1);
    time += 30_000;
    await op.retry();
    expect(mock.writes).toHaveLength(2);
    expect(mock.bodies[0]).toBe(mock.bodies[1]);
    time += 23 * 3600_000;
    await op.retry();
    expect(states.at(-1)).toEqual({ state: 'expired' });
    expect(mock.writes).toHaveLength(2);
    op.clear();
  });
  it.each(['conflict', 'forbidden', 'unauthenticated'] as const)(
    'does not retry %s or reveal response credentials',
    async (state) => {
      const status = state === 'conflict' ? 409 : state === 'forbidden' ? 403 : 401;
      const mock = qrMockV1({
        write: () => Promise.resolve(qrJsonV1({ ...QR_META_V1, state }, status)),
      });
      const lost = vi.fn(),
        states: QrOperationStateV1[] = [];
      const op = createQrOperationV1({
        client: mock.client,
        canWrite: true,
        publish: (value) => states.push(value),
        onAuthorizationLost: lost,
        render: syntheticQrRendererV1,
      });
      await op.submit(command(), 'pdf');
      await op.retry();
      expect(states.at(-1)).toMatchObject({ state: 'error', retryable: false });
      expect(mock.writes).toHaveLength(1);
      expect(lost).toHaveBeenCalledTimes(state === 'conflict' ? 0 : 1);
      op.clear();
    },
  );
  it('rejects cards from another account or wrong mode before rendering', async () => {
    const render = vi.fn(syntheticQrRendererV1);
    const mock = qrMockV1({
      write: () =>
        Promise.resolve(
          qrJsonV1({ ...QR_META_V1, state: 'qr', version: 755, cards: qrPrintCardsV1(2).slice(1) }),
        ),
    });
    const { op, states } = setup(mock, render);
    await op.submit(command(), 'pdf');
    expect(states.at(-1)).toMatchObject({ state: 'error', error: { state: 'invalid-response' } });
    expect(render).not.toHaveBeenCalled();
    op.clear();
  });
  it('cancels requests and late renders, and can be reused after StrictMode cleanup', async () => {
    let release: (() => void) | undefined;
    const { op, states, mock } = setup(qrMockV1(), async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return syntheticQrRendererV1(...args);
    });
    const pending = op.submit(command(), 'pdf');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    op.cancel();
    release!();
    await pending;
    expect(states.at(-1)).toEqual({ state: 'cancelled' });
    expect(states.some((s) => s.state === 'ready')).toBe(false);
    op.clear();
    const again = op.submit(command({ idempotencyKey: qrPrintIdV1(9901) }), 'pdf');
    await vi.waitFor(() => expect(mock.writes).toHaveLength(2));
    await vi.waitFor(() => expect(states.at(-1)?.state).toBe('rendering'));
    release!();
    await again;
    expect(states.at(-1)?.state).toBe('ready');
    op.clear();
  });
  it('clears artifacts after five minutes and cannot export after expiry or readonly refusal', async () => {
    vi.useFakeTimers();
    const { op, states, mock } = setup();
    await op.submit(command(), 'pdf');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(states.at(-1)).toEqual({ state: 'expired' });
    op.download();
    op.clear();
    const readonly = createQrOperationV1({
      client: mock.client,
      canWrite: false,
      publish: () => {},
      render: syntheticQrRendererV1,
    });
    await readonly.submit(command(), 'pdf');
    expect(mock.writes).toHaveLength(1);
    readonly.clear();
  });
});
