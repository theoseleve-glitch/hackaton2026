import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKBData } from "./node-kb";

/** Compile the KB (yaml rules + taxonomy + chassis templates) into the single
 *  JSON bundle the app imports. Run after every KB change: npm run bundle */
const data = loadKBData();
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kb", "bundle.json");
writeFileSync(out, JSON.stringify(data));
console.log(
  `bundled ${data.rules.length} rules, ${Object.keys(data.templates).length} template(s) → ${out}`,
);
