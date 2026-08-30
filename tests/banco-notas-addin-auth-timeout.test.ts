// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BancoNotasNaaSilentTimeoutError,
  withNaaSilentTimeout,
} from '../addin/banco-notas/auth-timeout';

describe('Banco de Notas NAA silent timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a silent token result before the deadline', async () => {
    await expect(withNaaSilentTimeout(Promise.resolve('token'), 50)).resolves.toBe('token');
  });

  it('releases a permanently pending silent request for the interactive fallback', async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => undefined);
    const result = withNaaSilentTimeout(pending, 12_000);
    const assertion = expect(result).rejects.toBeInstanceOf(BancoNotasNaaSilentTimeoutError);

    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });

  it('preserves a real silent acquisition failure', async () => {
    const failure = new Error('silent_failure');
    await expect(withNaaSilentTimeout(Promise.reject(failure), 50)).rejects.toBe(failure);
  });
});
