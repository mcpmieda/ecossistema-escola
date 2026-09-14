import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/student-portal/frontend-integration/*.postgres.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
