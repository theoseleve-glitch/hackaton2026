/**
 * health-probe test suite — the public GET /api/healthz handler exercised
 * directly against a fake HealthCtx. No HTTP, no Postgres, no Vercel.
 * Assertion style mirrors src/test-content.ts.
 *
 * Covers: db-up (200), db-down via ping resolving false (503), db-down via
 * ping rejecting (503, never throws), db-down via ping throwing synchronously
 * (503), seam reporting (booleans echoed verbatim, no secrets), auth-free
 * (no request input at all), and that server_time is always stamped.
 *
 * Run from C:/Users/willy/hackaton2026/RaceLab/server:
 *   npx tsx src/test-health.ts
 */

import { health, type HealthCtx, type HealthSeams } from "./handlers/health";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

const NOW = "2026-06-13T12:00:00.000Z";

const ALL_OFF: HealthSeams = { stripe: false, signing: false, blob: false, render: false };
const ALL_ON: HealthSeams = { stripe: true, signing: true, blob: true, render: true };

function ctx(opts: { ping: () => Promise<boolean>; seams?: HealthSeams }): HealthCtx {
  return { now: () => NOW, ping: opts.ping, seams: opts.seams ?? ALL_OFF };
}

// ═══ db up ═══════════════════════════════════════════════════════════════════

console.log("— db up —");
{
  const r = await health(ctx({ ping: async () => true, seams: ALL_ON }));
  check("up: status 200", r.status === 200);
  check("up: ok=true", r.json.ok === true);
  check("up: db=up", r.json.db === "up");
  check("up: server_time stamped", r.json.server_time === NOW);
  check("up: seams echoed (all on)", JSON.stringify(r.json.seams) === JSON.stringify(ALL_ON));
}

// ═══ db down — ping resolves false ═════════════════════════════════════════════

console.log("\n— db down (ping resolves false) —");
{
  const r = await health(ctx({ ping: async () => false, seams: ALL_ON }));
  check("down(false): status 503", r.status === 503);
  check("down(false): ok=false", r.json.ok === false);
  check("down(false): db=down", r.json.db === "down");
  check("down(false): server_time stamped", r.json.server_time === NOW);
  check("down(false): seams still reported", JSON.stringify(r.json.seams) === JSON.stringify(ALL_ON));
}

// ═══ db down — ping rejects (async throw) — must NOT escape ════════════════════

console.log("\n— db down (ping rejects) —");
{
  let threw = false;
  let r;
  try {
    r = await health(ctx({ ping: async () => { throw new Error("connection refused"); } }));
  } catch {
    threw = true;
  }
  check("reject: handler never throws across boundary", threw === false);
  check("reject: status 503", r !== undefined && r.status === 503);
  check("reject: ok=false", r !== undefined && r.json.ok === false);
  check("reject: db=down", r !== undefined && r.json.db === "down");
  check("reject: server_time stamped", r !== undefined && r.json.server_time === NOW);
}

// ═══ db down — ping throws SYNCHRONOUSLY (guard throws before awaiting) ════════

console.log("\n— db down (ping throws synchronously) —");
{
  let threw = false;
  let r;
  try {
    // a guard that throws before returning a promise at all
    const badPing = (() => { throw new Error("seam not configured"); }) as () => Promise<boolean>;
    r = await health(ctx({ ping: badPing }));
  } catch {
    threw = true;
  }
  check("sync-throw: handler never throws across boundary", threw === false);
  check("sync-throw: status 503", r !== undefined && r.status === 503);
  check("sync-throw: db=down", r !== undefined && r.json.db === "down");
}

// ═══ seam reporting — every combination, booleans only, no leakage ════════════

console.log("\n— seam reporting —");
{
  const mixed: HealthSeams = { stripe: true, signing: false, blob: true, render: false };
  const r = await health(ctx({ ping: async () => true, seams: mixed }));
  check("seams: stripe=true reported", (r.json.seams as HealthSeams).stripe === true);
  check("seams: signing=false reported", (r.json.seams as HealthSeams).signing === false);
  check("seams: blob=true reported", (r.json.seams as HealthSeams).blob === true);
  check("seams: render=false reported", (r.json.seams as HealthSeams).render === false);
  check("seams: exactly 4 keys (no extra/secret fields)", Object.keys(r.json.seams as object).sort().join(",") === "blob,render,signing,stripe");
}

// seams must report on the DOWN path too (a monitor wants both facts at once)
{
  const r = await health(ctx({ ping: async () => false, seams: ALL_ON }));
  check("seams: reported even when db down", JSON.stringify(r.json.seams) === JSON.stringify(ALL_ON));
}

// ═══ no secret leakage — extra ctx.seams fields are NOT copied through ═════════

console.log("\n— no secret leakage (extra fields dropped) —");
{
  // simulate a sloppy integrator handing a seams object that ALSO carries a
  // secret value; the handler must copy ONLY the four declared booleans.
  const leaky = { stripe: true, signing: true, blob: true, render: true, stripe_secret_key: "sk_live_DEADBEEF" } as unknown as HealthSeams;
  const r = await health(ctx({ ping: async () => true, seams: leaky }));
  const out = r.json.seams as Record<string, unknown>;
  check("leak: secret field NOT present in response seams", !("stripe_secret_key" in out));
  check("leak: only the 4 boolean keys survive", Object.keys(out).sort().join(",") === "blob,render,signing,stripe");
  check("leak: response seams is a fresh object, not the ctx alias", out !== (leaky as unknown as object));
}

// ═══ non-boolean values are coerced to a strict boolean (=== true only) ════════

console.log("\n— booleanization (only literal true survives as true) —");
{
  // any non-`true` seam value (1, "yes", undefined, 0) must come out as a
  // strict boolean false — the handler trusts ONLY the literal `true`, which
  // is what env-presence derivation produces. This is the leak-proof default.
  const sloppy = { stripe: 1, signing: "yes", blob: undefined, render: 0 } as unknown as HealthSeams;
  const r = await health(ctx({ ping: async () => true, seams: sloppy }));
  const out = r.json.seams as HealthSeams;
  check("coerce: stripe(1) -> false (not === true)", out.stripe === false);
  check("coerce: signing('yes') -> false", out.signing === false);
  check("coerce: blob(undefined) -> false", out.blob === false);
  check("coerce: render(0) -> false", out.render === false);
  check("coerce: all values are strict booleans", Object.values(out).every((v) => typeof v === "boolean"));
}

// ═══ ping resolving a truthy non-true must NOT be treated as up ════════════════

console.log("\n— ping must resolve strictly true to be up —");
{
  const truthyPing = (async () => 1) as unknown as () => Promise<boolean>;
  const r = await health(ctx({ ping: truthyPing }));
  check("strict-up: ping resolving 1 (not true) is treated as DOWN", r.status === 503 && r.json.db === "down");
}

// ═══ auth-free — handler takes NO request; cannot 401 ═════════════════════════

console.log("\n— auth-free (no request input) —");
{
  // health(ctx) is called with no HttpRequest at all — proving it never
  // consults an Authorization header and can answer a credential-less monitor.
  const r = await health(ctx({ ping: async () => true }));
  check("public: 200 with no request/bearer whatsoever", r.status === 200);
  check("public: never produces an auth-shaped error", r.json.error === undefined);
}

// ═══ verdict ═══════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nHEALTH: all checks passed" : `\nHEALTH: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
