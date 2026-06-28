import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKBData } from "./node-kb";
import { templateExposes } from "./retrieval";
import type { ChassisTemplate, KBRule } from "./types";

/**
 * LIVE-rule grounding gate (P0-3). The drafts gate (validate-drafts.ts) only ever
 * ran over kb/rules/drafts/, which is now empty — so the citation / contradiction /
 * caster / "source-contradiction" invariants were DARK for the 400+ rules that
 * actually ship in bundle.json. This runs them over the LIVE rules and is wired
 * into `npm test`, so a fabricated cite, a co-firing contradiction, a caster
 * inversion, or a rule that ships while its own REVIEW note says it contradicts
 * its source can never reach the app green again.
 *
 * loadKBData() already enforces schema + taxonomy (symptom/phase/condition/scope)
 * + duplicate-id on every load, so this adds only the gates assertValidKBData does
 * NOT cover: citation-anchor, cross-scope contradiction, caster convention, and the
 * raw-text source-contradiction marker (the P0-2 class).
 */

const KB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kb");
const liveDir = join(KB_DIR, "rules");

const data = loadKBData();
const errors: string[] = [];

// ── citation anchor: every live rule must name a real grounding source ───────
const SOURCE_ANCHORS = [
  "HUDY", "XRAY", "Cheat Sheet", "Associated", "TLR", "Losi", "Mugen", "Stevens",
  "CompetitionX", "petitrc", "Kyosho", "Yokomo", "Serpent", "Schumacher", "Traxxas",
  "JQRacing", "RC Car Stars", "EuroRC", "Hearns", "RC Racer",
];
for (const r of data.rules) {
  if (!r.sources.some((src) => SOURCE_ANCHORS.some((a) => src.includes(a)))) {
    errors.push(`${r.id}: no recognized grounding source in [${r.sources.join(" | ")}]`);
  }
}

// ── capability (union of full + category templates): a live rule's setting must
//    be exposed by SOME template that declares one of its scope tags. Per-model
//    templates (e.g. MP11 wing) legitimately expose settings the category template
//    omits, so the union avoids the false positives a category-only check produces.
const byScope: Record<string, ChassisTemplate[]> = {};
for (const t of [...Object.values(data.templates ?? {}), ...Object.values(data.categoryTemplates ?? {})]) {
  for (const s of t.scope ?? []) (byScope[s] ??= []).push(t);
}
for (const r of data.rules) {
  const candidates = r.scope.flatMap((s) => byScope[s] ?? []);
  if (candidates.length > 0 && !candidates.some((t) => templateExposes(t, r.setting))) {
    errors.push(`${r.id}: setting '${r.setting}' is exposed by NO template declaring scope [${r.scope.join(", ")}]`);
  }
}

// ── cross-scope contradiction: two rules that can load on the SAME car (share a
//    scope tag) must not push opposite directions on the same setting for a shared
//    symptom with overlapping amplified conditions. Per-file was insufficient.
const OPPOSITE: Record<string, string> = {
  increase: "decrease", decrease: "increase", stiffer: "softer", softer: "stiffer",
  harder: "softer", more: "less", less: "more", thicker: "thinner", thinner: "thicker",
  higher: "lower", lower: "higher", raise: "lower",
};
const overlap = (a: string[], b: string[]) => (a.length === 0 && b.length === 0) || a.some((x) => b.includes(x));
const R = data.rules;
for (let i = 0; i < R.length; i++) {
  for (let j = i + 1; j < R.length; j++) {
    const a = R[i], b = R[j];
    if (a.setting !== b.setting) continue;
    if (!a.scope.some((s) => b.scope.includes(s))) continue; // not co-loadable
    if (OPPOSITE[a.direction] !== b.direction && OPPOSITE[b.direction] !== a.direction) continue;
    if (!a.addresses.some((x) => b.addresses.some((y) => x.symptom === y.symptom))) continue;
    if (overlap(a.conditions.amplified_on, b.conditions.amplified_on)) {
      errors.push(`contradiction — ${a.id} (${a.direction}) vs ${b.id} (${b.direction}) on '${a.setting}' co-fire on a shared symptom`);
    }
  }
}

// ── caster convention (HUDY p.42 / NT1 p.16): MORE caster reduces off-power entry
//    turn-in; LESS caster reduces on-power exit drive. (Same guard as the drafts gate.)
for (const r of data.rules) {
  if (r.setting !== "caster") continue;
  const fixesEntryTurn = r.addresses.some((a) => (a.symptom === "understeer" || a.symptom === "sluggish_steering") && a.phase === "corner_entry");
  const fixesExitDrive = r.addresses.some((a) => a.symptom === "understeer" && (a.phase === "corner_exit" || a.phase === "on_power"));
  if (r.direction === "increase" && fixesEntryTurn) errors.push(`${r.id}: MORE caster cannot address corner-entry understeer (HUDY p.42)`);
  if (r.direction === "decrease" && fixesExitDrive) errors.push(`${r.id}: LESS caster cannot address corner-exit/on-power understeer (HUDY p.42)`);
}

// ── source-contradiction marker (P0-2): a rule whose own REVIEW note says it
//    contradicts / is inverted vs its cited source MUST NOT ship LIVE at
//    confidence:high. Comments are stripped by the YAML parser, so scan raw text:
//    a rule block (`- id:` … next `- id:`) carrying a contradiction marker AND
//    `confidence: high` is a D18 violation (grounded advice that refutes its cite).
// "the OPPOSITE of this rule['s ... claim]" is a self-contradiction marker: the
// rule's own REVIEW says its recommended DIRECTION is the inverse of its cite (a
// grounded-or-silent violation). Distinct from "the OPPOSITE of NT1 ... rule sides
// with NT1" (a legitimate source-disagreement where the rule picks a side) — that
// phrasing says "of NT1", not "of this rule", so it is NOT matched.
const MARKERS = /DIRECTLY CONTRADICTS|INVERTED on NT1|appears inverted|REVIEW: CONFLICT|the OPPOSITE of this rule/;
for (const file of readdirSync(liveDir).filter((f) => f.endsWith(".yaml"))) {
  const lines = readFileSync(join(liveDir, file), "utf8").split(/\r?\n/);
  let id: string | null = null, hasMarker = false, isHigh = false;
  const flush = () => {
    if (id && hasMarker && isHigh) errors.push(`${file}: ${id} ships LIVE at confidence:high while its REVIEW marks it as contradicting its cited source — quarantine or flip it`);
  };
  for (const l of lines) {
    const m = /^- id:\s*(\S+)/.exec(l);
    if (m) { flush(); id = m[1]; hasMarker = false; isHigh = false; continue; }
    if (MARKERS.test(l)) hasMarker = true;
    if (/^\s*confidence:\s*high\b/.test(l)) isHigh = true;
  }
  flush();
}

console.log(`validated ${data.rules.length} LIVE rules across ${readdirSync(liveDir).filter((f) => f.endsWith(".yaml")).length} file(s)`);
if (errors.length > 0) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log("✓ all LIVE rules pass citation + capability + contradiction + caster + source-marker gates");
