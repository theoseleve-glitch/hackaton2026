import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Pre-purchase off-road TIRE-SELECTION advisor (D75). Deterministic + API-free (D18):
 * a pure function over a grounded selection KB. Given a track's surface + grip + weather
 * (the SAME condition tags the tuning engine already consumes) and an off-road class, it
 * returns the TWO best tire PROFILES to BUY = (tread pattern + compound/softness band).
 *
 * Grounded or silent: every pick cites a real published source; no grounded match → a
 * refusal, never a guess. Insert is out of scope (racers rarely change it). On-road is
 * out of scope (slick/durometer — a separate, smaller problem). See docs/TIRE_ADVISOR.md.
 */

export type GripBand = "low" | "medium" | "high";
export type TempBand = "cold" | "mild" | "hot";

const KB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kb");
const TIRE_SELECTION_FILE = join(KB_DIR, "tires", "offroad-selection.yaml");

export const TireSelectionEntrySchema = z.object({
  id: z.string().regex(/^tsel-[a-z0-9-]+$/),
  scope: z.array(z.string()).min(1),
  match: z.object({
    surface: z.string(),
    grip: z.array(z.enum(["low", "medium", "high"])).default([]),
    temp: z.array(z.enum(["cold", "mild", "hot"])).default([]),
    wet: z.boolean().optional(),
  }),
  tread: z.string(),
  compound: z.string(),
  examples: z.array(z.string()).default([]),
  rationale: z.string(),
  sources: z.array(z.string()).min(1),
  confidence: z.enum(["high", "medium", "low"]),
});
export type TireSelectionEntry = z.infer<typeof TireSelectionEntrySchema>;

export interface TireContext {
  /** off-road class scope tags, e.g. ["1-8-offroad", "1-8-nitro-offroad"] */
  scope: string[];
  /** surface family tag: loose_dirt | clay | blue_groove | astroturf | carpet | wet */
  surface: string;
  grip: GripBand;
  temp: TempBand;
  wet: boolean;
  dusty: boolean;
}

export interface TireProfilePick {
  tread: string;
  compound: string;
  examples: string[];
  rationale: string;
  citations: string[];
  confidence: "high" | "medium" | "low";
  /** human-readable reason this profile matched the context */
  fit: string;
}

export interface TireSelectionResult {
  kind: "tire_selection" | "refusal";
  picks?: TireProfilePick[];
  message?: string;
  source: "offline_deterministic";
  context_echo: string;
}

const CONFIDENCE_WEIGHT: Record<TireSelectionEntry["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Build the advisor context from the engine's existing condition tags + class scope, so
 *  the app can reuse the SAME buildConditionTags(...) output it computes for tuning. */
export function tireContextFromTags(tags: readonly string[], scope: string[]): TireContext {
  const has = (t: string) => tags.includes(t);
  const surface = ["loose_dirt", "clay", "blue_groove", "astroturf", "carpet", "wet"].find((s) => has(s)) ?? "";
  const grip: GripBand = has("high_grip") || has("blue_groove") ? "high" : has("low_grip") ? "low" : "medium";
  const temp: TempBand = has("hot") ? "hot" : has("cold") ? "cold" : "mild";
  return { scope, surface, grip, temp, wet: has("wet"), dusty: has("dusty") };
}

function entryFits(e: TireSelectionEntry, ctx: TireContext): boolean {
  if (!e.scope.some((s) => ctx.scope.includes(s))) return false;
  if (e.match.surface !== ctx.surface) return false;
  if (e.match.grip.length > 0 && !e.match.grip.includes(ctx.grip)) return false;
  if (e.match.temp.length > 0 && !e.match.temp.includes(ctx.temp)) return false;
  if (e.match.wet !== undefined && e.match.wet !== ctx.wet) return false;
  return true;
}

function score(e: TireSelectionEntry, ctx: TireContext): number {
  let s = CONFIDENCE_WEIGHT[e.confidence];
  if (e.match.grip.includes(ctx.grip)) s += 2; // a band-specific match beats an any-grip entry
  if (e.match.temp.includes(ctx.temp)) s += 2;
  return s;
}

function fitText(e: TireSelectionEntry, ctx: TireContext): string {
  const parts = [ctx.surface.replace(/_/g, " ")];
  if (e.match.grip.includes(ctx.grip)) parts.push(`${ctx.grip} grip`);
  if (e.match.temp.includes(ctx.temp)) parts.push(`${ctx.temp} temps`);
  if (e.match.wet === true) parts.push("wet");
  return parts.join(", ");
}

/**
 * The advisor. Deterministic: stable sort by score, then confidence, then id; dedupe to
 * distinct (tread, compound) profiles; return the top 2 (or a refusal if none grounded).
 */
export function recommendTires(ctx: TireContext, kb: TireSelectionEntry[]): TireSelectionResult {
  const echo = `${ctx.surface || "unknown surface"} · ${ctx.grip} grip · ${ctx.temp}${ctx.wet ? " · wet" : ""}${ctx.dusty ? " · dusty" : ""}`;

  if (!ctx.surface) {
    return {
      kind: "refusal",
      source: "offline_deterministic",
      context_echo: echo,
      message: "Tell me the track surface (loose dirt, clay, blue-groove, astroturf, carpet, or wet) and I'll pick the two best tire profiles to buy.",
    };
  }

  const ranked = kb
    .filter((e) => entryFits(e, ctx))
    .map((e) => ({ e, sc: score(e, ctx) }))
    .sort((a, b) =>
      b.sc - a.sc ||
      CONFIDENCE_WEIGHT[b.e.confidence] - CONFIDENCE_WEIGHT[a.e.confidence] ||
      (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0),
    );

  const picks: TireProfilePick[] = [];
  const seen = new Set<string>();
  for (const { e } of ranked) {
    const key = `${e.tread}|${e.compound}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push({
      tread: e.tread,
      compound: e.compound,
      examples: e.examples,
      rationale: e.rationale,
      citations: e.sources,
      confidence: e.confidence,
      fit: fitText(e, ctx),
    });
    if (picks.length === 2) break;
  }

  if (picks.length === 0) {
    return {
      kind: "refusal",
      source: "offline_deterministic",
      context_echo: echo,
      message: `No grounded tire profile for ${echo} on this class yet — I won't guess (grounded or silent). As the selection KB grows this will resolve.`,
    };
  }

  return { kind: "tire_selection", picks, source: "offline_deterministic", context_echo: echo };
}

/** Node-only loader (CLI, eval, tests). Returns [] if the dataset file is absent. */
export function loadTireSelectionKB(): TireSelectionEntry[] {
  if (!existsSync(TIRE_SELECTION_FILE)) return [];
  const raw = parse(readFileSync(TIRE_SELECTION_FILE, "utf8")) ?? [];
  const arr = Array.isArray(raw) ? raw : (raw.entries ?? []);
  const entries = z.array(TireSelectionEntrySchema).parse(arr);
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error(`duplicate tire-selection id: ${e.id}`);
    ids.add(e.id);
  }
  return entries;
}
