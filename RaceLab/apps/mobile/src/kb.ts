import bundleJson from "../../../packages/kb/bundle.json";
import { assertValidKBData } from "../../../packages/engine/src";
import type { ChassisTemplate, KBData } from "../../../packages/engine/src";

/** The entire knowledge base, compiled by `npm run bundle` in packages/engine
 *  and shipped inside the app (D18: no API, fully offline). */
export const KB = bundleJson as unknown as KBData;
assertValidKBData(KB);

export const MP11_ID = "kyosho-inferno-mp11";
export const MP11: ChassisTemplate = KB.templates[MP11_ID];

/** Kit-default setup extracted from the template (null defaults skipped). */
export function kitSetup(template: ChassisTemplate): Record<string, string | number> {
  const setup: Record<string, string | number> = {};
  for (const [id, field] of Object.entries(template.fields)) {
    const def = (field as { kit_default?: string | number | null }).kit_default;
    if (def !== undefined && def !== null) setup[id] = def;
  }
  return setup;
}

export function label(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
