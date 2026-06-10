#!/usr/bin/env node
/**
 * IMPORT FIREWALL (spec §4 rule 3) for apps/mobile: the phone may import
 * @bloop/protocol freely and @bloop/game-* as TYPES ONLY; @bloop/engine,
 * @bloop/kit and @bloop/server never. Exit 1 on any violation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url)); // r2/bloop

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

let violations = 0;
const flag = (file, detail) => {
  violations += 1;
  console.error(`firewall: ${relative(repo, file)}: ${detail}`);
};

for (const root of ['apps/mobile/src', 'apps/mobile/app']) {
  for (const file of files(join(repo, root))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^;]*?from\s*['"](@bloop\/[^'"]+)['"]|require\(\s*['"](@bloop\/[^'"]+)['"]\s*\)/gs) ?? []) {
      const spec = m[1] ?? m[2];
      const stmt = m[0];
      if (/^@bloop\/(engine|kit|server)/.test(spec)) flag(file, `forbidden package '${spec}'`);
      else if (/^@bloop\/game-/.test(spec) && !/^\s*(?:import|export)\s+type\b/.test(stmt)) {
        flag(file, `'${spec}' must be 'import type' — game logic never crosses to the phone`);
      }
    }
  }
}

if (violations > 0) {
  console.error(`check:firewall FAIL — ${violations} violation(s)`);
  process.exit(1);
}
console.log('check:firewall OK — mobile imports protocol + game types only');
