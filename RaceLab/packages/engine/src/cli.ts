import { readFileSync } from "node:fs";
import { recommend } from "./engineer";
import { loadKBData } from "./node-kb";
import type { ContextBundle, Recommendation, RecommendationOption } from "./types";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!file) {
  console.error("Usage: npm run cli -- <scenario.json>");
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(file, "utf8")).bundle as ContextBundle;
render(recommend(bundle, loadKBData()));

function render(rec: Recommendation): void {
  console.log(`\n🏁 RaceLab Race Engineer  [${rec.source}]`);
  console.log(`📍 ${rec.conditions_echo}\n`);
  if (rec.kind !== "recommendation") {
    console.log(`${rec.kind === "refusal" ? "🚫" : "🤝"} ${rec.message}\n`);
    return;
  }
  printOption("PRIMARY", rec.primary!);
  rec.alternatives?.forEach((alt, i) => printOption(`ALT ${i + 1}`, alt));
}

function printOption(label: string, o: RecommendationOption): void {
  console.log(`── ${label} ─ ${o.setting} ─ confidence: ${o.confidence}`);
  console.log(`   change:  ${o.change}`);
  if (o.magnitude) console.log(`   amount:  ${o.magnitude}`);
  console.log(`   why:     ${o.mechanism}`);
  console.log(`   expect:  ${o.expected_effect}`);
  console.log(`   revert:  ${o.revert}`);
  console.log(`   else:    ${o.if_it_does_not_help}`);
  console.log(`   sources: ${o.citations.join(", ")}\n`);
}
