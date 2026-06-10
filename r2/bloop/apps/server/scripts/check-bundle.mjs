#!/usr/bin/env node
/**
 * Bundle-size gate (server-shell adversarial review I6).
 * Run AFTER `wrangler deploy --dry-run --outdir <dir>` (the check:bundle npm
 * script chains both). Sums the raw bytes of every emitted .js/.mjs file
 * (sourcemaps are not uploaded) and fails over budget: 2 MiB raw — deliberate
 * headroom under Cloudflare's 3 MiB free-plan worker limit, so growth (zod v4,
 * obscenity datasets, new game modules) is caught long before a deploy fails.
 * Override for testing: BUNDLE_BUDGET_BYTES env var.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET = Number(process.env.BUNDLE_BUDGET_BYTES ?? 2 * 1024 * 1024);
const outdir = process.argv[2];
if (!outdir) {
  console.error('usage: node scripts/check-bundle.mjs <outdir emitted by wrangler deploy --dry-run --outdir>');
  process.exit(2);
}

let total = 0;
const lines = [];
for (const name of readdirSync(outdir)) {
  if (!/\.m?js$/.test(name)) continue; // skips .js.map and metadata
  const bytes = statSync(join(outdir, name)).size;
  lines.push(`  ${name}: ${(bytes / 1024).toFixed(1)} KiB`);
  total += bytes;
}

if (lines.length === 0) {
  console.error(`check:bundle FAIL — no .js emitted in ${outdir}; did the wrangler dry-run step run?`);
  process.exit(2);
}

console.log(lines.join('\n'));
console.log(`worker bundle: ${(total / 1024).toFixed(1)} KiB raw — ${((total / BUDGET) * 100).toFixed(1)}% of the ${(BUDGET / 1024).toFixed(0)} KiB budget`);
if (total > BUDGET) {
  console.error('check:bundle FAIL — over budget. Trim (zod/mini? obscenity dataset? per-game content) before raising it.');
  process.exit(1);
}
console.log('check:bundle OK');
