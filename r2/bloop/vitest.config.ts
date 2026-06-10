import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/test/**/*.test.ts',
      // Tier A: pure-Node server logic. The workerd Tier-B suite lives in
      // apps/server/test/** and runs under apps/server/vitest.config.ts.
      'apps/server/test-node/**/*.test.ts',
    ],
  },
});
