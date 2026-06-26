import { type KBData, resolveTemplate } from "./data";
import { proposePlan } from "./plan";
import { historyFromTuples } from "./history";
import type { ContextBundle } from "./types";
import {
  buildConditionTags,
  conditionsToTags,
  effectiveTiming,
  lapStats,
  learningTuples,
  renderConditions,
} from "../../schema/src/runs";
import type { LapTime, LearningTuple, OutcomeRecord, RunEntry } from "../../schema/src/runs";
import { detectTyreCliff } from "../../schema/src/strategy";
import type { TyreCliffReport } from "../../schema/src/strategy";

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

export interface RunAnalysisReport {
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
): RunAnalysisReport {
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
    // Grounded or silent: a cliff claim needs a real lap series. Summary-only or
    // untimed runs carry no per-lap signal, so detectTyreCliff is never run on
    // them and no cliff line is emitted (D18 — don't invent a cliff from a
    // driver-entered best/avg).
    if (r.timing === undefined || r.timing.kind !== "laps") return;
    const report = detectTyreCliff(r.timing.laps);
    if (report.detected) {
      lines.push(
        obs(
          `Run ${i + 1} (${r.type}): tyre cliff from lap ${report.cliff_lap} — sustained drop-off, confidence ${report.confidence} (${report.evidence.length} laps of evidence).`,
        ),
      );
      // Quantified observation + pit-timing recommendation. detectTyreCliff is
      // strategy math over THIS run's lap series (not a KB rule), so both lines
      // are framed as observations from the lap data — no fabricated KB citation.
      const dropPct = cliffDropPct(r.timing.laps, report);
      lines.push(
        obs(
          `Run ${i + 1} (${r.type}): tyres fell off ~lap ${report.cliff_lap} (pace dropped ${fmt(dropPct)}% vs the run's baseline) — plan a stop before it.`,
        ),
      );
      lines.push(
        cliffRec(
          `Run ${i + 1} (${r.type}): your cliff lands ~lap ${report.cliff_lap} — size stints to pit a lap or two before it rather than running the tyres past the drop-off. (Observed from this run's lap times, not a KB rule.)`,
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

/** Average slowdown across the cliff suffix as a % of the run's baseline pace.
 *  Reconstructs the baseline the detector used (lap_time − delta_s for the first
 *  evidence lap) so the % is grounded in the same math, not a re-estimate. */
function cliffDropPct(laps: readonly LapTime[], report: TyreCliffReport): number | undefined {
  if (report.evidence.length === 0) return undefined;
  const first = report.evidence[0];
  const firstLap = laps.find((l) => l.n === first.lap_n);
  if (firstLap === undefined) return undefined;
  const baseline = firstLap.t_s - first.delta_s;
  if (!(baseline > 0)) return undefined;
  const avgDelta = report.evidence.reduce((a, e) => a + e.delta_s, 0) / report.evidence.length;
  return Math.round((avgDelta / baseline) * 1000) / 10; // one decimal, e.g. 3.1
}

/** A pace/tyre-timing recommendation grounded in the run's own lap data rather
 *  than a KB rule — so it carries no `citations` (a recommendation line that
 *  cited a fake KB rule would violate grounded-or-silent). */
function cliffRec(text: string): ReportLine {
  return { kind: "recommendation", text };
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

  // The plan grounds on the most recent run that carries driver feedback tags —
  // and it must reason in THAT run's own context. Sourcing the symptom from the
  // feedback run but the conditions/surface/track from a later feedback-less run
  // mixed two contexts: a complaint logged on cold astro could be evaluated
  // against a hot-clay run's tags, lighting the wrong surface-amplified rules and
  // misfiring the forbidden_on hard-drop. So every grounding axis below comes
  // from feedbackRun, never `latest`.
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

  // When the complaint was logged at a DIFFERENT track than the latest run, the
  // latest run's surface/conditions no longer describe where the symptom was
  // seen, and a "next plan" for the latest track would be projecting a complaint
  // onto a track it was never observed on. We won't guess across tracks.
  if (feedbackRun.track_id !== latest.track_id) {
    return refusal(
      `The most recent driver complaint was logged at ${feedbackRun.track.name}, but the latest run was at ${latest.track.name} — I won't ground a next-track plan on a different track's complaint (grounded or silent).`,
    );
  }

  if (!resolveTemplate(data, feedbackRun.car_template_id)) {
    return refusal(
      `Chassis template '${feedbackRun.car_template_id}' is not in the KB — no grounded plan (grounded or silent).`,
    );
  }

  const bundle: ContextBundle = {
    chassis_template_id: feedbackRun.car_template_id,
    setup: opts?.current_setup ?? {},
    // setup_version_id + current_setup are the setup the driver is on NOW (latest);
    // grounding conditions are the feedback run's (same track, asserted above).
    setup_version_id: latest.setup_version_id,
    track: {
      track_id: feedbackRun.track_id,
      name: feedbackRun.track.name,
      surface: feedbackRun.track.surface,
      grip: feedbackRun.conditions.grip,
      // Union surface-family tags so this next-plan retrieval sees the same condition set
      // the live advisor does — otherwise surface-amplified rules stay dark AND the
      // forbidden_on hard-drop can't fire, letting analyzeRuns recommend a change that is
      // wrong for the surface. (power isn't carried on RunEntry, so it's omitted here.)
      conditions: [...buildConditionTags({ conditions: feedbackRun.conditions, surface: feedbackRun.track.surface })],
    },
    feedback: { tags: feedbackRun.feedback.tags.map((t) => ({ ...t })) },
    mode: opts?.mode ?? "practice",
    history: historyFromTuples(tuples, { track_id: feedbackRun.track_id, limit: 50 }),
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
  return v === undefined ? "?" : String(v);
}
