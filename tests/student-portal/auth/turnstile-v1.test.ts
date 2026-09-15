import { describe, expect, it, vi } from 'vitest';
import { TURNSTILE_ACTION_V1, TurnstileVerifierV1 } from '../../../server/student-portal/auth/turnstile-v1';

describe('server-side Turnstile verification', () => {
  it('checks success, exact hostname and action and sends no IP identity', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, hostname: 'aluno.escolaieda.com', action: TURNSTILE_ACTION_V1 }));
    const verifier = new TurnstileVerifierV1('synthetic-secret', fetcher);
    expect(await verifier.verify('synthetic-token')).toBe(true);
    const [endpoint, options] = fetcher.mock.calls[0]!;
    expect(endpoint).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(options?.redirect).toBe('manual');
    const form = options?.body as URLSearchParams;
    expect([...form.keys()].sort()).toEqual(['response', 'secret']);
    for (const result of [{ success: false }, { success: true, hostname: 'attacker.invalid', action: TURNSTILE_ACTION_V1 },
      { success: true, hostname: 'aluno.escolaieda.com', action: 'wrong' }, { success: true }]) {
      fetcher.mockResolvedValueOnce(Response.json(result));
      expect(await verifier.verify('synthetic-token')).toBe(false);
    }
  });
  it('fails closed on missing configuration, transport failure, malformed response and timeout', async () => {
    expect(() => new TurnstileVerifierV1('')).toThrow('risk-unavailable');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('synthetic-secret-provider-error'))
      .mockResolvedValueOnce(new Response('invalid'))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const verifier = new TurnstileVerifierV1('synthetic-secret', fetcher);
    for (let i = 0; i < 3; i++) await expect(verifier.verify('synthetic-token')).rejects.toThrow('student-portal-risk-unavailable');
    vi.useFakeTimers();
    try {
      fetcher.mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));
      const pending = expect(verifier.verify('synthetic-token')).rejects.toThrow('student-portal-risk-unavailable');
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
    } finally { vi.useRealTimers(); }
  });
});
