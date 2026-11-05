import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // e2e files share one database: run them one after the other so counts and
    // real-time events from one file never leak into another.
    fileParallelism: false,
  },
});
