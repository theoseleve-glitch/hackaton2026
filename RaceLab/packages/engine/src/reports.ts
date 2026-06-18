import type { KBData } from "./data";
import { proposePlan } from "./plan";
import { historyFromTuples } from "./history";
import type { ContextBundle } from "./types";
import {
  conditionsToTags,
  effectiveTiming,
  lapStats,
  learningTuples,
  renderConditions,
} from "../../schema/src/runs";
import type { LearningTuple, OutcomeRecord, RunEntry } from "../../schema/src/runs";
import { detectTyreCliff } from "../../schema/src/strategy";

/**
 * Run analysis — analyzeRuns turns a set of schema RunEntry rows (plus their
 * OutcomeRecords) into a deterministic engineer's report. Pure function, zero
 * I/O (D18); every claim is either a KB-cited recommendation or explicitly an
 * observation. The report is an ID-LESS pure object that JSON-serializes
 * cleanly — persisting/listing reports is storage's job, not the engine's.
 */

export type ReportLineKind = "observation" | "recommendation" | "refusal";

export interface ReportLine {
  kind: ReportLineKind;
  text: string;
  /** KB rule ids — present iff kind === "recommendation" or the line restates
   *  a cited change from the log. Grounded or silent: a recommendation line
   *  without citations is a bug. */
  citations?: string[];
}

export interface ReportSection {
  id: "summary" | "conditions" | "pace" | "tyres" | "setup_changes" | "next_plan";
  title: string;
  lines: ReportLine[];
}

export interface EngineerReport {
  kind: "engineer_report";
  source: "offline_deterministic";
  run_count: number;
  track_names: string[];
  /** Present when at least one run exists. */
  span?: { from: string; to: string };
  sections: ReportSection[];
}

export interface AnalyzeRunsOptions {
  /** OutcomeRecords linked to these runs — feeds the setup-change timeline
   *  and the history re-ranking of the recommended next plan. */
  outcomes?: readonly OutcomeRecord[];
  /** Setup values for the next-plan proposal (runs only carry version ids). */
  current_setup?: Record<string, string | number>;
  /** Mode for the next-plan proposal (default "practice"). */
  mode?: "practice" | "race_day";
}

export function analyzeRuns(
  runs: readonly RunEntry[],
  data: KBData,
  opts?: AnalyzeRunsOptions,
): EngineerReport {
  const sorted = [...runs].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1,
  );
  const outcomes = opts?.outcomes ?? [];
  const tuples = learningTuples(sorted, outcomes);
  const trackNames: string[] = [];
  for (const r of sorted) if (!trackNames.includes(r.track.name)) trackNames.push(r.track.name);

  const sections: ReportSection[] = [
    summarySection(sorted, trackNames),
    conditionsSection(sorted),
    paceSection(sorted),
    tyresSection(sorted),
    setupChangesSection(tuples),
    nextPlanSection(sorted, tuples, data, opts),
  ];

  return {
    kind: "engineer_report",
    source: "offline_deterministic",
    run_count: sorted.length,
    track_names: trackNames,
    ...(sorted.length > 0
      ? { span: { from: sorted[0].created_at, to: sorted[sorted.length - 1].created_at } }
      : {}),
    sections,
  };
}

// ── Section builders (all deterministic templates) ───────────────────────────

function obs(text: string): ReportLine {
  return { kind: "observation", text };
}

function summarySection(runs: readonly RunEntry[], trackNames: string[]): ReportSection {
  if (runs.length === 0) {
    return { id: "summary", title: "Summary", lines: [obs("No runs provided — nothing to analyze.")] };
  }
  const counts = { practice: 0, qualifier: 0, main: 0 };
  for (const r of runs) counts[r.type]++;
  const lines: ReportLine[] = [
    obs(
      `${runs.length} run(s) at ${trackNames.join(", ")} — ${counts.practice} practice / ${counts.qualifier} qualifier / ${counts.main} main.`,
    ),
  ];
  const versions: string[] = [];
  for (const r of runs) if (!versions.includes(r.setup_version_id)) versions.push(r.setup_version_id);
  lines.push(obs(`Setup versions on track: ${versions.join(", ")}.`));
  return { id: "summary", title: "Summary", lines };
}

function conditionsSection(runs: readonly RunEntry[]): ReportSection {
  if (runs.length === 0) {
    return { id: "conditions", title: "Conditions", lines: [obs("No runs — no conditions read.")] };
  }
  const lines: ReportLine[] = runs.map((r, i) => {
    const tags = conditionsToTags(r.conditions);
    return obs(
      `Run ${i + 1} (${r.type}): ${renderConditions(r.conditions)} → KB tags: ${tags.length > 0 ? tags.join(", ") : "none"}.`,
    );
  });
  if (runs.length >= 2) {
    const first = new Set(conditionsToTags(runs[0].conditions));
    const last = new Set(conditionsToTags(runs[runs.length - 1].conditions));
    const added = [...last].filter((t) => !first.has(t));
    const removed = [...first].filter((t) => !last.has(t));
    if (added.length > 0 || removed.length > 0) {
      lines.push(
        obs(
          `Conditions shifted across the set: ${[...added.map((t) => `+${t}`), ...removed.map((t) => `-${t}`)].join(", ")}.`,
        ),
      );
    } else {
      lines.push(obs("Conditions held steady across the set."));
    }
  }
  return { id: "conditions", title: "Conditions", lines };
}

function paceSection(runs: readonly RunEntry[]): ReportSection {
  const lines: ReportLine[] = [];
  const bests: { run_n: number; best: number }[] = [];
  runs.forEach((r, i) => {
    if (r.timing === undefined) return;
    if (r.timing.kind === "laps") {
      const s = lapStats(r.timing.laps);
      lines.push(
        obs(
          `Run ${i + 1} (${r.type}): best ${fmt(s.best_lap_s)}s, avg ${fmt(s.avg_lap_s)}s, consistency ${fmt(s.consistency_pct)}% over ${s.lap_count} laps.`,
        ),
      );
      if (s.best_lap_s !== undefined) bests.push({ run_n: i + 1, best: s.best_lap_s });
    } else {
      const s = effectiveTiming(r);
      lines.push(
        obs(
          `Run ${i + 1} (${r.type}): driver-entered summary — best ${fmt(s?.best_lap_s)}s, avg ${fmt(s?.avg_lap_s)}s${r.timing.result.position !== undefined ? `, finished P${r.timing.result.position}` : ""}.`,
        ),
      );
      if (s?.best_lap_s !== undefined) bests.push({ run_n: i + 1, best: s.best_lap_s });
    }
  });
  if (bests.length >= 2) {
    const first = bests[0];
    const last = bests[bests.length - 1];
    const delta = Math.round((last.best - first.best) * 1000) / 1000;
    lines.push(
      obs(
        `Best-lap trend: ${first.best}s (run ${first.run_n}) → ${last.best}s (run ${last.run_n}) — ${delta <= 0 ? "" : "+"}${delta}s.`,
      ),
    );
  }
  if (lines.length === 0) lines.push(obs("No timing logged in this set."));
  return { id: "pace", title: "Pace & consistency", lines };
}

function tyresSection(runs: readonly RunEntry[]): ReportSection {
  const lines: ReportLine[] = [];
  runs.forEach((r, i) => {
    if (r.timing === undefined || r.timing.kind !== "laps") return;
    const report = detectTyreCliff(r.timing.laps);
    if (report.detected) {
      lines.push(
        obs(
          `Run ${i + 1} (${r.type}): tyre cliff from lap ${report.cliff_lap} — sustained drop-off, confidence ${report.confidence} (${report.evidence.length} laps of evidence).`,
        ),
      );
    } else {
      lines.push(
        obs(
          `Run ${i + 1} (${r.type}): no sustained tyre drop-off detected over ${r.timing.laps.length} laps.`,
        ),
      );
    }
  });
  if (lines.length === 0) {
    lines.push(obs("No lap series logged — tyre life not assessable from this set."));
  }
  return { id: "tyres", title: "Tyre life", lines };
}

function setupChangesSection(tuples: readonly LearningTuple[]): ReportSection {
  const lines: ReportLine[] = [];
  for (const t of tuples) {
    if (t.change !== undefined) {
      lines.push({
        kind: "observation",
        text: `${t.at}: ${t.change.setting} — ${t.change.change} → rated ${t.outcome}.`,
        citations: [...t.change.citations],
      });
    } else {
      lines.push(obs(`${t.at}: run rated ${t.outcome} vs previous (no advised change attached).`));
    }
  }
  if (lines.length === 0) lines.push(obs("No rated changes in this set."));
  return { id: "setup_changes", title: "Setup-change timeline", lines };
}

function nextPlanSection(
  runs: readonly RunEntry[],
  tuples: readonly LearningTuple[],
  data: KBData,
  opts?: AnalyzeRunsOptions,
): ReportSection {
  const refusal = (text: string): ReportSection => ({
    id: "next_plan",
    title: "Recommended next plan",
    lines: [{ kind: "refusal", text }],
  });
  if (runs.length === 0) return refusal("No runs — nothing to ground a plan on.");

  const latest = runs[runs.length - 1];
  if (!data.templates[latest.car_template_id]) {
    return refusal(
      `Chassis template '${latest.car_template_id}' is not in the KB — no grounded plan (grounded or silent).`,
    );
  }

  // most recent run that carries driver feedback tags grounds the plan
  let feedbackRun: RunEntry | undefined;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].feedback.tags.length > 0) {
      feedbackRun = runs[i];
      break;
    }
  }
  if (!feedbackRun) {
    return refusal(
      "No driver feedback tags in these runs — nothing to ground a recommendation on (grounded or silent).",
    );
  }

  const bundle: ContextBundle = {
    chassis_template_id: latest.car_template_id,
    setup: opts?.current_setup ?? {},
    setup_version_id: latest.setup_version_id,
    track: {
      track_id: latest.track_id,
      name: latest.track.name,
      surface: latest.track.surface,
      grip: latest.conditions.grip,
      conditions: [...conditionsToTags(latest.conditions)],
    },
    feedback: { tags: feedbackRun.feedback.tags.map((t) => ({ ...t })) },
    mode: opts?.mode ?? "practice",
    history: historyFromTuples(tuples, { track_id: latest.track_id, limit: 50 }),
  };
  const plan = proposePlan(bundle, data);
  if (plan.kind !== "plan") {
    return refusal(plan.message ?? "The KB grounds no change for the reported symptoms.");
  }
  const lines: ReportLine[] = plan.changes.map((c) => ({
    kind: "recommendation",
    text: `#${c.position} ${c.option.change} — why: ${c.option.mechanism} ${c.rationale}`,
    citations: [...c.option.citations],
  }));
  return { id: "next_plan", title: "Recommended next plan", lines };
}

function fmt(v: number | undefined): string {
  // M5: a non-finite stat (NaN/Infinity, e.g. avg of an empty/garbage lap set)
  // must never render as "NaN"/"Infinity"; show "?" instead.
  return v === undefined || !Number.isFinite(v) ? "?" : String(v);
}
