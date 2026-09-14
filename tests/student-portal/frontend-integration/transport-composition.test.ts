import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createPortalTransportV1,
  hasPortalNoStoreV1,
} from '../../../src/features/student-portal/shared/transport-v1';
afterEach(() => vi.useRealTimers());
it.each(['no-store', 'no-store, no-cache, must-revalidate, private', 'PRIVATE, No-Store'])(
  'accepts the exact no-store directive in Pages header %s',
  (value) => {
    expect(hasPortalNoStoreV1(new Headers({ 'Cache-Control': value }))).toBe(true);
  },
);
it.each(['', 'private', 'max-age=0, no-cache', 'x-no-store', 'no-store-x', 'no-store="field"'])(
  'rejects missing or lookalike no-store directive %s',
  (value) => {
    expect(hasPortalNoStoreV1(new Headers({ 'Cache-Control': value }))).toBe(false);
  },
);
it('blocks manual/focus retries until Retry-After expires, without storing request bytes or retrying automatically', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        {
          contractVersion: 1,
          state: 'rate-limited',
          requestId: crypto.randomUUID(),
          retryAfterSeconds: 3,
        },
        { status: 429, headers: { 'Retry-After': '5' } },
      ),
    )
    .mockResolvedValue(
      Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } }),
    );
  const send = createPortalTransportV1({ fetch: fetcher, respectRetryAfter: true });
  const schema = z.object({ ok: z.literal(true) });
  await expect(send('/api/student/session', schema)).rejects.toMatchObject({
    state: 'rate-limited',
    retryAfterSeconds: 5,
  });
  await vi.advanceTimersByTimeAsync(2000);
  await expect(send('/api/student/session', schema)).rejects.toMatchObject({
    state: 'rate-limited',
    retryAfterSeconds: 3,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(send('/api/student/session', schema)).resolves.toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
