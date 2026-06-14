import { diffValues } from "../../sheets/src/diff";
import type { ChangedField } from "../../sheets/src/diff";
import type { SetupValues } from "../../sheets/src/sheets";
import type { RunEntry } from "./types";

/**
 * Layer 2 — run comparison. Answers, deterministically:
 * "what changed?", "what got faster?", "what got easier to drive?".
 * Setup values are resolved by the caller (they live in SheetsState) so this
 * package stays free of storage concerns.
 */

export type ResolveSetup = (versionId: string) => SetupValues | undefined;

export interface RunComparison {
  a: RunEntry;
  b: RunEntry; // b is the later/right-hand run; deltas read "b vs a"
  /** undefined when either setup version can't be resolved (e.g. other device) */
  setup_changes?: ChangedField[];
  condition_changes: ChangedField[];
  tyre_changes: ChangedField[];
  /** numeric deltas, b − a; negative lap deltas = b faster */
  best_lap_delta_s?: number;
  avg_lap_delta_s?: number;
  consistency_delta_pct?: number;
  confidence_delta?: number;
  faster: "a" | "b" | "tie" | "unknown";
  easier: "a" | "b" | "tie" | "unknown";
  /** human-readable verdict lines, ready to render */
  summary: string[];
}

export function compareRuns(a: RunEntry, b: RunEntry, resolveSetup: ResolveSetup): RunComparison {
  const setupA = resolveSetup(a.setup_version_id);
  const setupB = resolveSetup(b.setup_version_id);
  const setup_changes = setupA && setupB ? diffValues(setupA, setupB) : undefined;

  const condition_changes = diffRecords(flattenConditions(a), flattenConditions(b));
  const tyre_changes = diffRecords(flattenTyres(a), flattenTyres(b));

  const best_lap_delta_s = delta(a.result?.best_lap_s, b.result?.best_lap_s);
  const avg_lap_delta_s = delta(a.result?.avg_lap_s, b.result?.avg_lap_s);
  const consistency_delta_pct = delta(a.result?.consistency_pct, b.result?.consistency_pct);
  const confidence_delta = delta(a.result?.driver_confidence, b.result?.driver_confidence);

  const faster = verdict(best_lap_delta_s ?? avg_lap_delta_s, "lower_wins");
  const easier = verdict(confidence_delta ?? consistency_delta_pct, "higher_wins");

  return {
    a,
    b,
    setup_changes,
    condition_changes,
    tyre_changes,
    best_lap_delta_s,
    avg_lap_delta_s,
    consistency_delta_pct,
    confidence_delta,
    faster,
    easier,
    summary: buildSummary({
      setup_changes,
      condition_changes,
      tyre_changes,
      best_lap_delta_s,
      avg_lap_delta_s,
      consistency_delta_pct,
      confidence_delta,
      faster,
      easier,
    }),
  };
}

function buildSummary(c: {
  setup_changes?: ChangedField[];
  condition_changes: ChangedField[];
  tyre_changes: ChangedField[];
  best_lap_delta_s?: number;
  avg_lap_delta_s?: number;
  consistency_delta_pct?: number;
  confidence_delta?: number;
  faster: RunComparison["faster"];
  easier: RunComparison["easier"];
}): string[] {
  const lines: string[] = [];

  if (c.setup_changes === undefined) {
    lines.push("Setup diff unavailable (a referenced setup version is not on this device).");
  } else if (c.setup_changes.length === 0) {
    lines.push("Same setup on both runs — any difference is conditions, tyres or driving.");
  } else {
    lines.push(`${c.setup_changes.length} setup change${c.setup_changes.length > 1 ? "s" : ""} between the runs.`);
  }

  if (c.best_lap_delta_s !== undefined) {
    if (c.best_lap_delta_s !== 0) {
      lines.push(
        `Best lap ${Math.abs(c.best_lap_delta_s).toFixed(2)}s ${c.best_lap_delta_s < 0 ? "FASTER" : "slower"} on the later run.`,
      );
    } else {
      lines.push("Best lap identical.");
    }
  }
  if (c.avg_lap_delta_s !== undefined && c.avg_lap_delta_s !== 0) {
    lines.push(
      `Average lap ${Math.abs(c.avg_lap_delta_s).toFixed(2)}s ${c.avg_lap_delta_s < 0 ? "faster" : "slower"}.`,
    );
  }
  if (c.consistency_delta_pct !== undefined && c.consistency_delta_pct !== 0) {
    lines.push(
      `Consistency ${c.consistency_delta_pct > 0 ? "up" : "down"} ${Math.abs(c.consistency_delta_pct).toFixed(1)} pts.`,
    );
  }
  if (c.confidence_delta !== undefined && c.confidence_delta !== 0) {
    lines.push(
      `Driver confidence ${c.confidence_delta > 0 ? "up" : "down"} ${Math.abs(c.confidence_delta)} — the car got ${c.confidence_delta > 0 ? "easier" : "harder"} to drive.`,
    );
  }
  if (c.condition_changes.length > 0) {
    lines.push(
      `Conditions moved: ${c.condition_changes.map((ch) => `${ch.field} ${fmt(ch.from)}→${fmt(ch.to)}`).join(", ")}.`,
    );
  }
  if (c.tyre_changes.length > 0) {
    lines.push(`Tyres changed: ${c.tyre_changes.map((ch) => `${ch.field} ${fmt(ch.from)}→${fmt(ch.to)}`).join(", ")}.`);
  }
  if (
    c.setup_changes !== undefined &&
    c.setup_changes.length > 0 &&
    c.condition_changes.length > 0 &&
    (c.faster !== "unknown" || c.easier !== "unknown")
  ) {
    lines.push("Caution: setup AND conditions both changed — the lap delta is not attributable to the setup alone.");
  }
  return lines;
}

/** Conditions/tyres as flat records so the one diff shape serves everything. */
function flattenConditions(run: RunEntry): SetupValues {
  const c = run.conditions;
  const out: SetupValues = { grip: c.grip, surface: run.track.surface };
  if (c.bumpiness !== undefined) out.bumpiness = c.bumpiness;
  if (c.dusty !== undefined) out.dusty = String(c.dusty);
  if (c.sky !== undefined) out.sky = c.sky;
  if (c.evolution !== undefined) out.evolution = c.evolution;
  if (c.air_temp_c !== undefined) out.air_temp_c = c.air_temp_c;
  if (c.track_temp_c !== undefined) out.track_temp_c = c.track_temp_c;
  if (c.humidity_pct !== undefined) out.humidity_pct = c.humidity_pct;
  return out;
}

function flattenTyres(run: RunEntry): SetupValues {
  const t = run.tyres;
  const out: SetupValues = {};
  if (!t) return out;
  if (t.brand !== undefined) out.brand = t.brand;
  if (t.compound !== undefined) out.compound = t.compound;
  if (t.insert !== undefined) out.insert = t.insert;
  if (t.sauce !== undefined) out.sauce = t.sauce;
  if (t.wear !== undefined) out.wear = t.wear;
  if (t.run_count !== undefined) out.run_count = t.run_count;
  return out;
}

function diffRecords(from: SetupValues, to: SetupValues): ChangedField[] {
  return diffValues(from, to);
}

function delta(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined || b === undefined) return undefined;
  return round2(b - a);
}

function verdict(d: number | undefined, dir: "lower_wins" | "higher_wins"): RunComparison["faster"] {
  if (d === undefined) return "unknown";
  if (d === 0) return "tie";
  const bWins = dir === "lower_wins" ? d < 0 : d > 0;
  return bWins ? "b" : "a";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(v: string | number | undefined): string {
  return v === undefined ? "—" : String(v);
}
