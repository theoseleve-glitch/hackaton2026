import raw from "./rcdata.json";

/**
 * Bundled RC reference data (compiled from docs/research/*.json) feeding every
 * autofill field — brands, models, engines, surfaces, tires, oils. 100%
 * offline: prefix search over a static dataset, no network ever (D18-safe).
 */

interface RcData {
  carBrands: { n: string; models: string[] }[];
  engines: string[];
  electric: string[];
  categories: { id: string; name: string; scale: string }[];
  surfaces: { id: string; label: string; d: string; loc: string }[];
  tireBrands: { n: string; d: string; lines: { n: string; profiles: string[]; compounds: string[] }[] }[];
  oilBrands: string[];
}

export const RC = raw as unknown as RcData;

/** Top candidates for a query: prefix matches first, then substring matches,
 *  stable order, max `limit` (the product asks for 3-4). Empty query → []. */
export function suggest(query: string, pool: string[], limit = 4): string[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const item of pool) {
    const low = item.toLowerCase();
    if (low === q) continue; // already typed exactly — no point suggesting it
    if (low.startsWith(q)) starts.push(item);
    else if (low.includes(q)) contains.push(item);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export const CAR_BRANDS: string[] = RC.carBrands.map((b) => b.n);

/** Models for one brand when known, every model otherwise. */
export function modelsForBrand(brand: string): string[] {
  const b = RC.carBrands.find((x) => x.n.toLowerCase() === brand.trim().toLowerCase());
  return b ? b.models : RC.carBrands.flatMap((x) => x.models);
}

export const ENGINES: string[] = RC.engines;
export const ELECTRIC: string[] = RC.electric;
export const OIL_BRANDS: string[] = RC.oilBrands;
export const SURFACE_IDS: string[] = RC.surfaces.map((s) => s.id);

/** Surfaces ordered offroad-first (the app's home discipline). */
export function surfacesByDiscipline(): { id: string; label: string; d: string }[] {
  return [...RC.surfaces].sort((a, b) => (a.d === b.d ? 0 : a.d === "offroad" ? -1 : 1));
}

export const TIRE_BRAND_NAMES: string[] = RC.tireBrands.map((b) => b.n);

export function tireLinesForBrand(brand: string): string[] {
  const b = RC.tireBrands.find((x) => x.n.toLowerCase() === brand.trim().toLowerCase());
  return b ? b.lines.map((l) => l.n) : RC.tireBrands.flatMap((x) => x.lines.map((l) => l.n));
}

export function tireCompoundsForBrand(brand: string): string[] {
  const b = RC.tireBrands.find((x) => x.n.toLowerCase() === brand.trim().toLowerCase());
  const all = (b ? [b] : RC.tireBrands).flatMap((x) => x.lines.flatMap((l) => l.compounds));
  return [...new Set(all)];
}

export function tireProfilesForBrand(brand: string): string[] {
  const b = RC.tireBrands.find((x) => x.n.toLowerCase() === brand.trim().toLowerCase());
  const all = (b ? [b] : RC.tireBrands).flatMap((x) => x.lines.flatMap((l) => l.profiles));
  return [...new Set(all)];
}
