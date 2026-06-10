#!/usr/bin/env node
/**
 * Billing + purity CI lint. Exit 1 on any violation.
 *
 * Rule 1 — BILLING (design §7.1), apps/server/src: no setInterval/setTimeout
 * (all time-based work rides the single DO alarm) and no bare `.accept(`
 * (only hibernatable ctx.acceptWebSocket — note `acceptWebSocket(` does NOT
 * match `.accept(`, so the legal call never trips this).
 *
 * Rule 2 — PURITY (spec §4), packages/{kit,engine,games/<each>}/src: no
 * Date.now/Math.random — all nondeterminism enters via seed + event.at.
 *
 * Comment handling: full-comment lines (//, *, /*) are skipped and trailing
 * `//` comments are stripped before matching, so doc mentions of the banned
 * tokens (engine types.ts JSDoc, room-do.ts margin notes) never false-positive.
 * (A violation sharing a line with an earlier `//`-bearing string literal
 * would be missed — acceptable for a lint; the Tier-B suite is the backstop.)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url)); // r2/bloop

function tsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function codeOnly(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  const cut = line.indexOf('//');
  return cut === -1 ? line : line.slice(0, cut);
}

const gameSrcRoots = readdirSync(join(repo, 'packages/games'))
  .map((d) => join('packages/games', d, 'src'))
  .filter((p) => existsSync(join(repo, p)));

const RULES = [
  {
    name: 'billing §7.1 (DO source must hibernate cleanly)',
    roots: ['apps/server/src'],
    patterns: [/\bsetInterval\s*\(/, /\bsetTimeout\s*\(/, /\.accept\s*\(/],
  },
  {
    name: 'purity (game logic sees no ambient clock/RNG)',
    roots: ['packages/kit/src', 'packages/engine/src', ...gameSrcRoots],
    patterns: [/\bDate\.now\b/, /\bMath\.random\b/],
  },
];

let violations = 0;
for (const rule of RULES) {
  for (const root of rule.roots) {
    for (const file of tsFiles(join(repo, root))) {
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const code = codeOnly(line);
        for (const pattern of rule.patterns) {
          if (pattern.test(code)) {
            violations += 1;
            console.error(`${rule.name}: ${relative(repo, file)}:${i + 1}: ${line.trim()}`);
          }
        }
      });
    }
  }
}

if (violations > 0) {
  console.error(`check:billing FAIL — ${violations} violation(s)`);
  process.exit(1);
}
console.log('check:billing OK — DO source alarm-only; kit/engine/games deterministic');
