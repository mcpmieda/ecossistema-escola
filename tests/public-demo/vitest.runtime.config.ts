import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/public-demo/*.workerd.ts'],
    hookTimeout: 90_000,
    testTimeout: 30_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
