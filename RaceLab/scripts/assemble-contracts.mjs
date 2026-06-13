// One-shot assembler: builds CONTRACTS.md from the backend builders' returned
// contract_section blocks (workflow wf_0233fae5-e0f result JSON) plus the
// schema section authored inline. Re-runnable; output is the committed file.
import { readFileSync, writeFileSync } from "node:fs";

const [, , resultPath, schemaSectionPath, outPath] = process.argv;
if (!resultPath || !schemaSectionPath || !outPath) {
  console.error("usage: node assemble-contracts.mjs <result.json> <schema-section.md> <out.md>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(resultPath, "utf8"));
const r = raw.result ?? raw;
const schemaSection = readFileSync(schemaSectionPath, "utf8").trim();

const header = `# RaceLab CONTRACTS — frozen package surfaces

> **How to read this file.** Every package below is a contract: the exported
> names, result shapes and invariants documented here are what the rest of the
> codebase (and Théo's frontend) may rely on. Changes to a frozen surface are
> ADDITIVE ONLY; anything else needs a logged decision (D-row) first.
>
> House rules that hold across every package:
> - **D18**: nothing on the advice path does I/O. Advisor + strategy math are
>   deterministic, on-device, zero network/LLM/key.
> - **Injected capabilities**: no \`Date.now()\`, \`Math.random()\` or global
>   \`fetch\` inside domain logic — clocks/entropy/fetch/storage are parameters.
> - **Discriminated results**: \`{ok:true,...} | {ok:false,reason}\` — packages
>   never throw across their boundary.
> - **Never-wipe**: corrupt persisted data is quarantined and reported, never
>   deleted or silently dropped.
> - **Offline-first**: every Tier-B enrichment (weather, Speedhive, server) can
>   be fully down without breaking any app flow.
>
> Imports are source-level relative paths (\`../../packages/<name>/src\`) until
> npm workspaces land. Status of each package: \`packages/README.md\`.
> Generated from the B2–B10 build session (2026-06-12); assembled by
> \`scripts/assemble-contracts.mjs\`.
`;

const order = [
  ["schema", null], // authored section
  ["storage", r.storage],
  ["weather", r.weather],
  ["speedhive", r.speedhive],
  ["account", r.account],
  ["kb", r.kb],
  ["engine", r.engine],
];

const parts = [header];
for (const [name, station] of order) {
  parts.push("\n---\n");
  if (name === "schema") {
    parts.push(schemaSection);
    continue;
  }
  if (!station || !station.contract_section) {
    parts.push(`## packages/${name}\n\n(MISSING — station did not return a contract section)`);
    continue;
  }
  // Normalize top-level heading depth to h2.
  let s = station.contract_section.trim();
  if (s.startsWith("# ")) s = "#" + s;
  parts.push(s);
}

writeFileSync(outPath, parts.join("\n") + "\n", "utf8");
console.log(`wrote ${outPath}`);
