import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
      thresholds: {
        'src/domain/**': { lines: 100, branches: 100, functions: 100 },
        'src/services/**': { lines: 95, branches: 90, functions: 100 },
        'src/routes/**': { lines: 90, branches: 85, functions: 100 },
        'src/errors.ts': { lines: 100, branches: 100, functions: 100 },
      },
    },
    pool: 'forks',
    testTimeout: 30_000,
  },
});
