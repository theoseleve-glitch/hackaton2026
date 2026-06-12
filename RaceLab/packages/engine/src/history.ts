import type { ContextBundle, HistoryEntry } from "./types";
import { renderConditions } from "../../schema/src/runs";
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
 */

export interface RuleHistory {
  better: number;
  same: number;
  worse: number;
  /** better - worse. Positive ⇒ promote one tier, negative ⇒ demote one tier. */
  net: number;
  /** Outcome of the most recent matching row (rows arrive oldest-first). */
  last: "better" | "same" | "worse";
}

/** Track-isolation rule for a history row (see HistoryEntry doc):
 *  - row without track_id → counts (caller pre-filtered to the current track)
 *  - row with track_id → counts only when the bundle's track_id matches
 *    (no bundle track_id ⇒ cannot attribute ⇒ ignored). */
export function historyRowApplies(row: HistoryEntry, bundleTrackId: string | undefined): boolean {
  if (row.track_id === undefined) return true;
  return bundleTrackId !== undefined && row.track_id === bundleTrackId;
}

/** Aggregate this-track history for one KB rule (matched by rule id in the
 *  row's citations). Returns null when no row attributes to the rule here. */
export function historyForRule(ruleId: string, bundle: ContextBundle): RuleHistory | null {
  const rows = bundle.history;
  if (!rows || rows.length === 0) return null;
  let better = 0;
  let same = 0;
  let worse = 0;
  let last: RuleHistory["last"] | null = null;
  for (const row of rows) {
    if (!row.citations || !row.citations.includes(ruleId)) continue;
    if (!historyRowApplies(row, bundle.track.track_id)) continue;
    if (row.outcome === "better") better++;
    else if (row.outcome === "worse") worse++;
    else same++;
    last = row.outcome;
  }
  if (last === null) return null;
  return { better, same, worse, net: better - worse, last };
}

/** Bounded influence: one tier up, one tier down, nothing else. */
export function historyTier(h: RuleHistory | null | undefined): -1 | 0 | 1 {
  if (!h) return 0;
  if (h.net > 0) return 1;
  if (h.net < 0) return -1;
  return 0;
}

/** Deterministic template for the card text — never freeform. */
export function historyNote(h: RuleHistory): string {
  if (h.net < 0) {
    return "Rated worse here last time — ranked below untested options.";
  }
  if (h.net > 0) {
    return "Rated better here last time — ranked up.";
  }
  return `Tried here before: ${h.better} better / ${h.same} same / ${h.worse} worse.`;
}

/** Build engine history rows from schema learning tuples, KEEPING the rule-id
 *  citations and track identity that schema's plain `toEngineHistory` drops —
 *  this is what the app should feed into ContextBundle.history. Bare run
 *  ratings (no change attached) are excluded; `limit` keeps the most recent N. */
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
  if (filter?.limit !== undefined && filter.limit >= 0 && rows.length > filter.limit) {
    rows = rows.slice(rows.length - filter.limit);
  }
  return rows.map((t) => ({
    change: `${t.change!.setting}: ${t.change!.change}`,
    conditions: renderConditions(t.conditions),
    outcome: t.outcome,
    citations: [...t.change!.citations],
    track_id: t.track.track_id,
  }));
}
