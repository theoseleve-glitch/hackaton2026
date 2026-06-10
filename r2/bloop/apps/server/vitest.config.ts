import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.ts'], // test-node/** runs under the ROOT vitest config in plain Node
    poolOptions: {
      workers: {
        // Cloudflare known issue: WebSockets + DOs do not work with per-test
        // isolated storage; documented workaround = shared storage, one worker.
        // Consequence: EVERY test must use a unique room code.
        singleWorker: true,
        isolatedStorage: false,
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
