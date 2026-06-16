import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { loadKBData, RuleSchema } from "./node-kb";
import { templateExposes } from "./retrieval";
import type { ChassisTemplate, KBRule } from "./types";

/**
 * Draft-rule validation gate (D49 / reviewer M2-M3). Validates every
 * kb/rules/drafts/*.yaml against the SAME rules the live KB must satisfy plus
 * the extra gates the authoring fan-out needs, WITHOUT bundling them:
 *   - schema (RuleSchema) + taxonomy (symptom/phase/condition/scope vocab)
 *   - capability: every rule.setting must be exposed by the category template
 *     its scope resolves to (so it can actually fire for that class)
 *   - contradiction: no two rules in a file share setting + a symptom + opposing
 *     direction with overlapping conditions
 *   - citation: every sources[] entry must name a known grounding source
 * Run: npm run validate-drafts. Exits non-zero on any error. This is the gate a
 * draft must pass before promotion to kb/rules/<family>.yaml (live).
 */

const KB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kb");
const draftsDir = join(KB_DIR, "rules", "drafts");

const data = loadKBData();
const tax = data.taxonomy;
const symptoms = new Set(tax.symptoms.map((s) => s.id));
const phases = new Set(tax.phases.map((p) => p.id));
const conditions = new Set(tax.conditions);
const scopeVocab = new Set(tax.scopes ?? []);

// scope tag → the category template that declares it (for the capability check)
const byScope: Record<string, ChassisTemplate> = {};
for (const t of Object.values(data.categoryTemplates ?? {})) {
  for (const s of t.scope ?? []) byScope[s] ??= t;
}

// citation anchors: a real source must be named (kills fabricated cites)
const SOURCE_ANCHORS = [
  "HUDY", "XRAY", "Cheat Sheet", "Associated", "TLR", "Losi", "Mugen", "Stevens",
  "CompetitionX", "petitrc", "Kyosho", "Yokomo", "Serpent", "Schumacher", "Traxxas",
];

const OPPOSITE: Record<string, string> = {
  increase: "decrease", decrease: "increase",
  stiffer: "softer", softer: "stiffer",
  more: "less", less: "more",
  thicker: "thinner", thinner: "thicker",
  higher: "lower", lower: "higher",
  raise: "lower", lower_: "raise",
};

function overlap(a: string[], b: string[]): boolean {
  if (a.length === 0 && b.length === 0) return true; // both always-on
  return a.some((x) => b.includes(x));
}

const errors: string[] = [];
const seenIds = new Set<string>();
let ruleCount = 0;
let fileCount = 0;

if (!existsSync(draftsDir)) {
  console.log("no drafts/ dir — nothing to validate");
  process.exit(0);
}

for (const file of readdirSync(draftsDir).filter((f) => f.endsWith(".yaml") && !f.startsWith("_")).sort()) {
  fileCount++;
  let docs: unknown[];
  try {
    docs = parse(readFileSync(join(draftsDir, file), "utf8")) as unknown[];
  } catch (e) {
    errors.push(`${file}: YAML parse failed — ${(e as Error).message}`);
    continue;
  }
  const fileRules: KBRule[] = [];
  for (const doc of docs ?? []) {
    const parsed = RuleSchema.safeParse(doc);
    if (!parsed.success) {
      errors.push(`${file}: schema — ${parsed.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).join("; ")}`);
      continue;
    }
    const r = parsed.data as KBRule;
    fileRules.push(r);
    ruleCount++;
    if (seenIds.has(r.id)) errors.push(`${file}: duplicate id ${r.id}`);
    seenIds.add(r.id);

    for (const a of r.addresses) {
      if (!symptoms.has(a.symptom)) errors.push(`${r.id}: unknown symptom '${a.symptom}'`);
      if (a.phase && !phases.has(a.phase)) errors.push(`${r.id}: unknown phase '${a.phase}'`);
    }
    for (const c of [...r.conditions.amplified_on, ...r.conditions.reduced_on, ...(r.forbidden_on ?? []), ...(r.legal_in_power ?? [])]) {
      if (!conditions.has(c)) errors.push(`${r.id}: unknown condition/power tag '${c}'`);
    }
    for (const ci of r.counter_indications) if (!symptoms.has(ci)) errors.push(`${r.id}: unknown counter-indication '${ci}'`);
    for (const s of r.scope) if (!scopeVocab.has(s)) errors.push(`${r.id}: unknown scope tag '${s}'`);

    // capability: the rule's setting must be exposed by a category template that
    // declares one of the rule's scope tags
    const tmpl = r.scope.map((s) => byScope[s]).find(Boolean);
    if (!tmpl) errors.push(`${r.id}: no category template declares any of scope [${r.scope.join(", ")}]`);
    else if (!templateExposes(tmpl, r.setting)) {
      errors.push(`${r.id}: setting '${r.setting}' is not exposed by category template '${tmpl.template_id}'`);
    }

    if (!r.sources.some((src) => SOURCE_ANCHORS.some((a) => src.includes(a)))) {
      errors.push(`${r.id}: no recognized grounding source in [${r.sources.join(" | ")}]`);
    }
  }

  // contradiction check within the file
  for (let i = 0; i < fileRules.length; i++) {
    for (let j = i + 1; j < fileRules.length; j++) {
      const a = fileRules[i], b = fileRules[j];
      if (a.setting !== b.setting) continue;
      if (OPPOSITE[a.direction] !== b.direction) continue;
      const sharedSymptom = a.addresses.some((x) => b.addresses.some((y) => x.symptom === y.symptom));
      if (!sharedSymptom) continue;
      const condsA = [...a.conditions.amplified_on, ...(a.forbidden_on ?? [])];
      const condsB = [...b.conditions.amplified_on, ...(b.forbidden_on ?? [])];
      if (overlap(condsA, condsB)) {
        errors.push(`${file}: contradiction — ${a.id} (${a.direction}) vs ${b.id} (${b.direction}) on '${a.setting}' for a shared symptom with overlapping conditions`);
      }
    }
  }
}

console.log(`validated ${ruleCount} draft rules across ${fileCount} file(s)`);
if (errors.length > 0) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log("✓ all drafts pass schema + taxonomy + capability + contradiction + citation gates");
