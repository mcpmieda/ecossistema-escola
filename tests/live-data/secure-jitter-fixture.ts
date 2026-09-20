import { vi } from 'vitest';

function implementation(value: number): Crypto['getRandomValues'] {
  return ((array: ArrayBufferView) => {
    if (!(array instanceof Uint32Array) || array.length === 0)
      throw new Error('synthetic-secure-jitter-buffer-invalid');
    array[0] = value >>> 0;
    return array;
  }) as Crypto['getRandomValues'];
}

export function mockSecureJitterV1(value = 0) {
  if (vi.isMockFunction(globalThis.crypto.getRandomValues)) {
    vi.mocked(globalThis.crypto.getRandomValues).mockImplementation(implementation(value));
    return;
  }
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(implementation(value));
}
