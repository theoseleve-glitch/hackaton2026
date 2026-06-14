import { writeFileSync } from "node:fs";
import { loadKBData, serializeBundle, KB_BUNDLE_PATH } from "./node-kb";

/** Compile the KB (yaml rules + taxonomy + chassis templates) into the single
 *  JSON bundle the app imports. Run after every KB change: npm run bundle
 *  (test-bundle-fresh.ts fails the suite if you forget). */
const data = loadKBData();
writeFileSync(KB_BUNDLE_PATH, serializeBundle(data));
console.log(
  `bundled ${data.rules.length} rules, ${Object.keys(data.templates).length} template(s)` +
    `${data.registry ? `, ${data.registry.length} registry entr(ies)` : ""}` +
    `${data.classes ? `, ${Object.keys(data.classes).length} class(es)` : ""}` +
    ` → ${KB_BUNDLE_PATH}`,
);
