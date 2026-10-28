import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
