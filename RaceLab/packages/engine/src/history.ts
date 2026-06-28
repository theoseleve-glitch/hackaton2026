import type { ContextBundle, HistoryEntry } from "./types";
import { renderConditions, conditionsToTags } from "../../schema/src/runs";
import type { LearningTuple } from "../../schema/src/runs";

/**
 * Learning-loop READ half (docs/04 §6): past (change, conditions, outcome)
 * rows re-rank retrieval. Pure functions, zero I/O (D18).
 *
 * GROUNDED-FIRST CAP — history can only re-order rules that ALREADY matched
 * the symptom, phase, conditions and chassis scope (retrieval filters first).
 * It can never resurrect a rule the KB wouldn't ground, and its influence is
 * bounded to one tier (+1 promoted / 0 clean / -1 demoted), so a 'better'
 * streak can't outrank the KB's own refusals.
 *
 * CONDITION-SEGMENTED — a change can rate better in one condition and worse in
 * another (better-when-hot / worse-when-cold). Each cited+this-track row is
 * classed against the CURRENT bundle's significant conditions:
 *   - MATCHED   (tagged, no conflicting significant condition) → drives the tier
 *   - CONFLICT  (tagged, opposite significant condition, e.g. a 'cold' row vs a
 *               'hot' forecast) → EXCLUDED entirely; a wrong-condition outcome
 *               must never re-rank or be claimed in the card (grounded-or-silent)
 *   - UNTAGGED  (legacy/no condition_tags) → the all-rows FALLBACK signal
 * The tier uses the matched signal when any matched row exists, else the
 * untagged fallback. If every row conflicts (only opposite-condition history),
 * there is NO usable signal → returns null. This is NOT a cold-start fix (it
 * needs ≥1 same- or no-condition row); the cross-driver prior is a separate
 * server-published data file, out of scope here.
 */

/** Condition tags that meaningfully change tuning — only these gate a
 *  "same conditions" match. Minor tags (dusty/bumpy/smooth/rough/…) don't
 *  discriminate the learned prior, so they never split the signal. */
const SIGNIFICANT_CONDITIONS: ReadonlySet<string> = new Set([
  "low_grip",
  "high_grip",
  "blue_groove",
  "hot",
  "cold",
  "wet",
]);

export interface RuleHistory {
  /** Untagged/legacy rows only — the FALLBACK signal (used when no matched row). */
  better: number;
  same: number;
  worse: number;
  net: number;
  /** Rows whose conditions MATCH the current bundle — the condition-specific
   *  signal. When matched_count > 0 the tier is driven by matched_net. */
  matched_better: number;
  matched_worse: number;
  matched_same: number;
  matched_net: number;
  matched_count: number;
}

/** Track-isolation rule for a history row (see HistoryEntry doc):
 *  - row without track_id → counts (caller pre-filtered to the current track)
 *  - row with track_id → counts only when the bundle's track_id matches
 *    (no bundle track_id ⇒ cannot attribute ⇒ ignored). */
export function historyRowApplies(row: HistoryEntry, bundleTrackId: string | undefined): boolean {
  if (row.track_id === undefined) return true;
  return bundleTrackId !== undefined && row.track_id === bundleTrackId;
}

/** The bundle's significant condition tags: the track's taxonomy tags plus
 *  hot/cold derived from the forecast — mirroring schema `conditionsToTags`
 *  EXACTLY (hot = air ≥ 30 OR track ≥ 40; cold = air ≤ 10 OR track ≤ 10) so a row tagged hot
 *  by track temperature isn't seen as conflicting by an air-only bundle. */
function bundleSignificantTags(bundle: ContextBundle): Set<string> {
  const sig = new Set<string>();
  for (const t of bundle.track.conditions) if (SIGNIFICANT_CONDITIONS.has(t)) sig.add(t);
  const air = bundle.weather?.air_temp_c;
  const track = bundle.weather?.track_temp_c;
  if ((air !== undefined && air >= 30) || (track !== undefined && track >= 40)) sig.add("hot");
  // cold mirrors conditionsToTags EXACTLY: air <= 10 OR track <= 10 (was air-only, so a
  // cold-track-only run — IR gun, no air reading — was untagged here while the bundle's
  // own condition tags called it cold, mis-segmenting history against opposite conditions).
  if ((air !== undefined && air <= 10) || (track !== undefined && track <= 10)) sig.add("cold");
  return sig;
}

type RowState = "untagged" | "match" | "conflict";

/** Classify a row against the bundle's significant conditions:
 *  - untagged (no condition_tags) → legacy fallback bucket
 *  - match: shares a significant condition, OR the ROW is generic (no significant
 *    tag ⇒ a usable prior in any condition)
 *  - conflict: the row carries a significant condition that the current day does
 *    NOT (a disjoint pair like cold-row vs hot-forecast, OR a condition-specific
 *    row on a condition-neutral day) → excluded entirely so a wrong-condition
 *    outcome can never re-rank or be claimed "in similar conditions" */
function rowConditionState(row: HistoryEntry, bundleSig: Set<string>): RowState {
  if (!row.condition_tags || row.condition_tags.length === 0) return "untagged";
  const rowSig = new Set<string>();
  for (const t of row.condition_tags) if (SIGNIFICANT_CONDITIONS.has(t)) rowSig.add(t);
  if (rowSig.size === 0) return "match"; // row is generic → a usable prior anywhere
  // The current day carries NO significant condition but the row does → it is a
  // DIFFERENT context (a hot-day 'better' must not re-rank a neutral-temp day, nor
  // let the card claim "in similar conditions"). Exclude it, same as a disjoint row.
  if (bundleSig.size === 0) return "conflict";
  for (const t of rowSig) if (bundleSig.has(t)) return "match"; // shared family
  return "conflict";
}

/** Aggregate this-track history for one KB rule (matched by rule id in the
 *  row's citations). Returns null when no USABLE (non-conflicting) row
 *  attributes to the rule here. */
export function historyForRule(ruleId: string, bundle: ContextBundle): RuleHistory | null {
  const rows = bundle.history;
  if (!rows || rows.length === 0) return null;
  const bundleSig = bundleSignificantTags(bundle);
  let better = 0;
  let same = 0;
  let worse = 0;
  let mBetter = 0;
  let mSame = 0;
  let mWorse = 0;
  for (const row of rows) {
    if (!row.citations || !row.citations.includes(ruleId)) continue;
    if (!historyRowApplies(row, bundle.track.track_id)) continue;
    const state = rowConditionState(row, bundleSig);
    if (state === "conflict") continue; // wrong-condition outcome — excluded entirely
    if (state === "match") {
      if (row.outcome === "better") mBetter++;
      else if (row.outcome === "worse") mWorse++;
      else mSame++;
    } else {
      if (row.outcome === "better") better++;
      else if (row.outcome === "worse") worse++;
      else same++;
    }
  }
  // No usable (non-conflicting) row attributed to this rule in the current
  // condition → no signal.
  if (better + same + worse + mBetter + mSame + mWorse === 0) return null;
  return {
    better,
    same,
    worse,
    net: better - worse,
    matched_better: mBetter,
    matched_worse: mWorse,
    matched_same: mSame,
    matched_net: mBetter - mWorse,
    matched_count: mBetter + mSame + mWorse,
  };
}

/** Whether the condition-matched signal (not the untagged fallback) drives the
 *  ranking. historyTier + historyNote MUST agree on this so the card text can't
 *  claim "in similar conditions" while the tier came from untagged rows. */
export function matchedSignalUsed(h: RuleHistory): boolean {
  return h.matched_count > 0;
}

/** Bounded influence: one tier up, one tier down, nothing else. Condition-
 *  matched rows take priority over the untagged fallback; conflicting rows
 *  never contribute. */
export function historyTier(h: RuleHistory | null | undefined): -1 | 0 | 1 {
  if (!h) return 0;
  const net = matchedSignalUsed(h) ? h.matched_net : h.net;
  if (net > 0) return 1;
  if (net < 0) return -1;
  return 0;
}

/** Deterministic template for the card text — never freeform. Scoped to the
 *  matched condition exactly when the matched signal drives the tier. */
export function historyNote(h: RuleHistory): string {
  const scoped = matchedSignalUsed(h);
  const net = scoped ? h.matched_net : h.net;
  const where = scoped ? "here in similar conditions" : "here";
  if (net < 0) return `Rated worse ${where} last time — ranked below untested options.`;
  if (net > 0) return `Rated better ${where} last time — ranked up.`;
  const b = scoped ? h.matched_better : h.better;
  const s = scoped ? h.matched_same : h.same;
  const w = scoped ? h.matched_worse : h.worse;
  return `Tried ${where} before: ${b} better / ${s} same / ${w} worse.`;
}

/** Build engine history rows from schema learning tuples, KEEPING the rule-id
 *  citations, track identity AND condition tags that schema's plain
 *  `toEngineHistory` drops — this is what the app should feed into
 *  ContextBundle.history. Bare run ratings (no change attached) are excluded;
 *  `limit` keeps the most recent N. */
export function historyFromTuples(
  tuples: readonly LearningTuple[],
  filter?: { track_id?: string; car_id?: string; limit?: number },
): HistoryEntry[] {
  let rows = tuples.filter((t) => t.change !== undefined);
  if (filter?.track_id !== undefined) {
    rows = rows.filter((t) => t.track.track_id === filter.track_id);
  }
  if (filter?.car_id !== undefined) {
    rows = rows.filter((t) => t.car_id === filter.car_id);
  }
  // Sort chronologically BEFORE taking the tail — "keep the most recent N" must not depend
  // on caller-supplied ordering (mirrors raceday.ts's `at` comparator), and the returned
  // history is then deterministically chronological.
  rows = [...rows].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (filter?.limit !== undefined && filter.limit >= 0 && rows.length > filter.limit) {
    rows = rows.slice(rows.length - filter.limit);
  }
  return rows.map((t) => ({
    change: `${t.change!.setting}: ${t.change!.change}`,
    conditions: renderConditions(t.conditions),
    outcome: t.outcome,
    citations: [...t.change!.citations],
    track_id: t.track.track_id,
    condition_tags: conditionsToTags(t.conditions),
  }));
}
