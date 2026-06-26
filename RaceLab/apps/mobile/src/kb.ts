import bundleJson from "../../../packages/kb/bundle.json";
import { assertValidKBData, resolveTemplate } from "../../../packages/engine/src";
import type { ChassisTemplate, KBData } from "../../../packages/engine/src";

/** The entire knowledge base, compiled by `npm run bundle` in packages/engine
 *  and shipped inside the app (D18: no API, fully offline). */
export const KB = bundleJson as unknown as KBData;
assertValidKBData(KB);

export const MP11_ID = "kyosho-inferno-mp11";
export const MP11: ChassisTemplate = KB.templates[MP11_ID];

/** Resolve a car's template_id to the setup-sheet scaffold to render, the SAME
 *  way the engine grounds advice (resolveTemplate handles category-template ids,
 *  which live in KB.categoryTemplates, NOT KB.templates). A bare KB.templates[id]
 *  here would miss every on-road category id and silently fall back to the
 *  off-road sheet — diverging the rendered sheet from the engine's template. */
export function sheetTemplate(id: string | null | undefined): ChassisTemplate {
  return (id ? resolveTemplate(KB, id) : undefined) ?? KB.templates["generic-offroad"];
}

export function label(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
