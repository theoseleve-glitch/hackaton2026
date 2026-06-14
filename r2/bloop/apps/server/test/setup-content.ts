import { beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { seedContent } from '../src/content/index.js';

// R2 content seam: the worker loads packs from the CONTENT bucket at runtime, so
// the workerd integration suite must seed it before any room calls startGame.
// env.CONTENT is the bucket from wrangler.jsonc (typed via test/env.d.ts's
// ProvidedEnv extends Env). seedContent is idempotent.
beforeAll(async () => {
  await seedContent(env.CONTENT);
});
