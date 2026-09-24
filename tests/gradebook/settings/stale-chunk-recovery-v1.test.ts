import { expect, it } from 'vitest';
import { shouldReloadFailedModuleV1 } from '../../../src/platform/gradebook-workspace-shell';

it('reloads a missing deployed module once and retains the fallback for repeated failure', () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
  const missing = new TypeError('Failed to fetch dynamically imported module: https://example.invalid/assets/settings-old.js');
  expect(shouldReloadFailedModuleV1(missing, storage, 1_000_000)).toBe(true);
  expect(shouldReloadFailedModuleV1(missing, storage, 1_000_001)).toBe(false);
  expect(shouldReloadFailedModuleV1(new Error('Unexpected render failure'), storage, 1_000_002)).toBe(false);
  expect(shouldReloadFailedModuleV1(missing, storage, 1_061_000)).toBe(true);
});

it('keeps the isolated error when session storage is unavailable', () => {
  const storage = {
    getItem: (): string | null => { throw new Error('storage unavailable'); },
    setItem: (): void => { throw new Error('storage unavailable'); },
  };
  expect(shouldReloadFailedModuleV1(new TypeError('Importing a module script failed'), storage, 1_000_000)).toBe(false);
});
