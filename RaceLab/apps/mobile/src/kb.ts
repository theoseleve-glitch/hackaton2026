import bundleJson from "../../../packages/kb/bundle.json";
import { assertValidKBData } from "../../../packages/engine/src";
import type { ChassisTemplate, KBData } from "../../../packages/engine/src";

/** The entire knowledge base, compiled by `npm run bundle` in packages/engine
 *  and shipped inside the app (D18: no API, fully offline). */
export const KB = bundleJson as unknown as KBData;
assertValidKBData(KB);

export const MP11_ID = "kyosho-inferno-mp11";
export const MP11: ChassisTemplate = KB.templates[MP11_ID];

export function label(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
