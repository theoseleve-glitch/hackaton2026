import { existsSync, readFileSync } from "node:fs";
import { serializeBundle, KB_BUNDLE_PATH } from "./node-kb";

/**
 * Drift guard: the committed packages/kb/bundle.json (what the APP imports) MUST
 * match what `npm run bundle` would produce from the live YAML rules + templates.
 * The eval/CLI read the YAML directly via loadKBData, so they never notice a stale
 * bundle — but the app ships the bundle. Without this guard, editing a rule and
 * forgetting `npm run bundle` silently ships old advice. Uses the bundler's own
 * serializeBundle() so the check can't diverge from the writer.
 */

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

check("bundle.json exists", existsSync(KB_BUNDLE_PATH), KB_BUNDLE_PATH);

if (existsSync(KB_BUNDLE_PATH)) {
  const committed = readFileSync(KB_BUNDLE_PATH, "utf8");
  const fresh = serializeBundle();
  check(
    "committed bundle.json is in sync with the live KB (run `npm run bundle` if this fails)",
    committed === fresh,
    committed.length === fresh.length
      ? "same length but different content — a rule/template field changed"
      : `committed ${committed.length} chars vs fresh ${fresh.length} chars — rule/template count or content drifted`,
  );

  // Cheap structural sanity so a corrupt-but-equal pair can't pass silently.
  try {
    const parsed = JSON.parse(committed) as { rules?: unknown[]; templates?: Record<string, unknown> };
    check("bundle parses + carries rules", Array.isArray(parsed.rules) && parsed.rules.length > 0);
    check("bundle carries templates", !!parsed.templates && Object.keys(parsed.templates).length > 0);
  } catch (e) {
    check("bundle parses", false, String(e));
  }
}

console.log(failures === 0 ? "BUNDLE-FRESH: in sync" : `BUNDLE-FRESH: ${failures} failures`);
if (failures > 0) process.exit(1);
