/** Returns a bounded jitter using Web Crypto so retries do not synchronize clients. */
export function secureJitterV1(maxExclusive: number): number {
  const bound = Math.max(1, Math.floor(maxExclusive));
  const sample = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return sample % bound;
}
