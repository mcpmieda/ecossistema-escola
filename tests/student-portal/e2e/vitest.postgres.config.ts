import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/student-portal/e2e/*.postgres.ts'],
    hookTimeout: 120_000,
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
