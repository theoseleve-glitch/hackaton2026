import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKBData } from "./node-kb";
import { recommend } from "./engineer";
import type { ContextBundle, Recommendation } from "./types";

interface Scenario {
  name: string;
  expect: {
    kind: "recommendation" | "refusal" | "do_nothing";
    settings_any_of?: string[];
    max_reversal_minutes?: number;
  };
  bundle: ContextBundle;
}

const scenariosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "scenarios");
const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json")).sort();
const kbData = loadKBData();
const kbIds = new Set(kbData.rules.map((r) => r.id));

let passed = 0;
const failures: string[] = [];

for (const file of files) {
  const scenario = JSON.parse(readFileSync(join(scenariosDir, file), "utf8")) as Scenario;
  const problems: string[] = [];
  let rec: Recommendation;
  try {
    rec = recommend(scenario.bundle, kbData);
  } catch (err) {
    failures.push(`✗ ${file}: threw ${(err as Error).message}`);
    console.log(`✗ ${scenario.name} — THREW`);
    continue;
  }

  if (rec.kind !== scenario.expect.kind) {
    problems.push(`expected kind=${scenario.expect.kind}, got ${rec.kind}`);
  }

  if (rec.kind === "recommendation") {
    const options = [rec.primary!, ...(rec.alternatives ?? [])];
    if (!rec.primary) problems.push("recommendation without primary");
    if ((rec.alternatives ?? []).length > 2) problems.push("more than 2 alternatives");
    for (const o of options) {
      if (o.citations.length === 0) problems.push(`${o.setting}: no citations`);
      for (const c of o.citations) if (!kbIds.has(c)) problems.push(`${o.setting}: cites unknown rule ${c}`);
    }
    const settings = options.map((o) => o.setting);
    if (new Set(settings).size !== settings.length) problems.push("duplicate setting across options");
    if (
      scenario.expect.settings_any_of &&
      !settings.some((s) => scenario.expect.settings_any_of!.includes(s))
    ) {
      problems.push(`no option in expert set [${scenario.expect.settings_any_of.join(", ")}]; got [${settings.join(", ")}]`);
    }
    if (!rec.conditions_echo || rec.conditions_echo.length < 10) problems.push("missing conditions echo");
  }

  if (problems.length === 0) {
    passed++;
    const summary =
      rec.kind === "recommendation" ? `→ ${rec.primary!.setting}` : `→ ${rec.kind}`;
    console.log(`✓ ${scenario.name} ${summary} [${rec.source}]`);
  } else {
    failures.push(`✗ ${file}: ${problems.join("; ")}`);
    console.log(`✗ ${scenario.name}\n    ${problems.join("\n    ")}`);
  }
}

console.log(`\n${passed}/${files.length} scenarios passed (deterministic engine, no API)`);
if (failures.length > 0) process.exit(1);
