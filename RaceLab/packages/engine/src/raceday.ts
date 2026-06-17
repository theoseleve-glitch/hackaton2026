import { type KBData, resolveTemplate } from "./data";
import { raceDayFilter } from "./guard";
import { humanize } from "./offline";
import type { Confidence, KBRule } from "./types";
import type { LearningTuple } from "../../schema/src/runs";
import { RAIN_RISK_THRESHOLD_PCT, deriveSky } from "../../schema/src/weather";
import type { WeatherObservation } from "../../schema/src/weather";
import type { TrackSnapshot } from "../../schema/src/tracks";

/**
 * Race-day planner — aggregate practice outcomes + a weather forecast into
 * KB-grounded predicted adjustments. Deterministic, offline, zero I/O (D18):
 * the forecast is DATA passed in (the app's weather adapter fetched it
 * earlier); nothing here touches the network or the clock.
 *
 * Grounded or silent: every adjustment cites a KB rule that is amplified on
 * the predicted condition tag AND clears the race-day bar (high confidence +
 * fast revert). Aspects the KB cannot ground (wind, or a tag no rule covers)
 * become EXPLICIT refusals, never guesses. Engine/nitro tuning is out of
 * scope by construction (D13) — only chassis rules exist in the KB.
 */

// Forecast → taxonomy-tag thresholds. hot/cold mirror schema conditionsToTags
// (air >= 30C → hot, air <= 10C → cold); rain risk mirrors schema deriveSky.
export const PLANNER_HOT_AIR_C = 30;
export const PLANNER_COLD_AIR_C = 10;
/** Above this, wind is reported — but the taxonomy has no wind tag, so it is
 *  always an explicit refusal aspect, never an adjustment. */
export const PLANNER_WIND_ASPECT_KMH = 25;
const MAX_ADJUSTMENTS_PER_TAG = 2;

export interface PlannedAdjustment {
  /** What in the forecast triggers this, e.g. "rain risk 70% at 2026-06-13T14:00Z". */
  trigger: string;
  /** The taxonomy condition tag the rule is amplified on. */
  condition_tag: string;
  setting: string;
  change: string;
  mechanism: string;
  confidence: Confidence;
  citations: string[];
  revert: string;
}

export interface PlannerRefusal {
  /** The ungrounded aspect, e.g. "wind", "cold". */
  aspect: string;
  message: string;
}

export interface RaceDayPlan {
  kind: "race_day_plan";
  source: "offline_deterministic";
  track: { name: string; surface: string };
  /** Deterministic echo of what the forecast predicts, tag by tag. */
  forecast_read: string[];
  /** Aggregated practice outcomes at this track (keep / avoid / neutral). */
  practice_read: string[];
  adjustments: PlannedAdjustment[];
  refusals: PlannerRefusal[];
  /** Input echo — explainable, never feels like magic (docs/04 §10 spirit). */
  assumptions: string[];
}

export interface RaceDayInput {
  practice: readonly LearningTuple[];
  forecast: readonly WeatherObservation[];
  track: TrackSnapshot;
  /** Needed for chassis-scope filtering of KB rules. */
  chassis_template_id: string;
  current_setup?: Record<string, string | number>;
}

export type RaceDayRejectReason = "unknown_template";

export function planRaceDay(
  input: RaceDayInput,
  data: KBData,
): { ok: true; plan: RaceDayPlan } | { ok: false; reason: RaceDayRejectReason } {
  const template = resolveTemplate(data, input.chassis_template_id);
  if (!template) return { ok: false, reason: "unknown_template" };

  const refusals: PlannerRefusal[] = [];
  const forecast = [...input.forecast].sort((a, b) =>
    a.observed_at < b.observed_at ? -1 : a.observed_at > b.observed_at ? 1 : 0,
  );

  // ── Forecast → predicted taxonomy tags (first trigger wins, deterministic) ──
  const predicted = new Map<string, string>(); // tag → trigger
  let windFlagged = false;
  for (const obs of forecast) {
    const sky = obs.sky ?? deriveSky(obs);
    if (sky === "raining") {
      if (!predicted.has("wet")) predicted.set("wet", `rain at ${obs.observed_at}`);
    } else if (sky === "rain_risk") {
      const pct =
        obs.precipitation_probability_pct !== undefined
          ? `${obs.precipitation_probability_pct}%`
          : `>=${RAIN_RISK_THRESHOLD_PCT}%`;
      if (!predicted.has("wet")) predicted.set("wet", `rain risk ${pct} at ${obs.observed_at}`);
    }
    if (obs.air_temp_c !== undefined && obs.air_temp_c >= PLANNER_HOT_AIR_C && !predicted.has("hot")) {
      predicted.set("hot", `air ${obs.air_temp_c}C at ${obs.observed_at}`);
    }
    if (obs.air_temp_c !== undefined && obs.air_temp_c <= PLANNER_COLD_AIR_C && !predicted.has("cold")) {
      predicted.set("cold", `air ${obs.air_temp_c}C at ${obs.observed_at}`);
    }
    if (
      obs.wind_speed_kmh !== undefined &&
      obs.wind_speed_kmh >= PLANNER_WIND_ASPECT_KMH &&
      !windFlagged
    ) {
      windFlagged = true;
      refusals.push({
        aspect: "wind",
        message: `Forecast wind ${obs.wind_speed_kmh} km/h at ${obs.observed_at}: the KB has no wind condition tag — no recommendation (grounded or silent).`,
      });
    }
  }

  const forecast_read: string[] = [];
  for (const [tag, trigger] of predicted) forecast_read.push(`${tag} expected — ${trigger}`);
  if (forecast_read.length === 0) {
    forecast_read.push(
      forecast.length === 0
        ? "no forecast provided — plan grounded on practice + KB only"
        : "forecast shows no condition change the KB reasons about",
    );
  }

  // ── Practice aggregation (this track only — outcomes never bleed across) ────
  const practice_read: string[] = [];
  const avoidRuleIds = new Set<string>();
  const atTrack = [...input.practice]
    .filter((t) => t.track.track_id === input.track.track_id)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const bySetting = new Map<string, LearningTuple>(); // latest verdict per (setting, change)
  let bareBetter = 0;
  let bareSame = 0;
  let bareWorse = 0;
  for (const t of atTrack) {
    if (t.change !== undefined) {
      bySetting.set(`${t.change.setting}|${t.change.change}`, t);
    } else if (t.outcome === "better") bareBetter++;
    else if (t.outcome === "same") bareSame++;
    else bareWorse++;
  }
  for (const t of bySetting.values()) {
    const c = t.change!;
    const cite = c.citations.join(", ");
    if (t.outcome === "better") {
      practice_read.push(`keep: ${c.setting} — ${c.change} (rated better; ${cite})`);
    } else if (t.outcome === "worse") {
      practice_read.push(`avoid: ${c.setting} — ${c.change} (rated worse; ${cite})`);
      for (const id of c.citations) avoidRuleIds.add(id);
    } else {
      practice_read.push(`neutral: ${c.setting} — ${c.change} (rated same; ${cite})`);
    }
  }
  if (bareBetter + bareSame + bareWorse > 0) {
    practice_read.push(
      `runs rated vs previous: ${bareBetter} better / ${bareSame} same / ${bareWorse} worse`,
    );
  }
  if (practice_read.length === 0) {
    practice_read.push("no practice history at this track — plan grounded on forecast + KB only");
  }

  // ── KB-grounded adjustments per predicted tag (race-day bar applies) ────────
  // Collect candidates across ALL predicted tags, then resolve same-setting
  // collisions across conditions before emitting: identical direction → ONE
  // merged change (never advise two steps of the same lever — e.g. cold+wet both
  // want thinner oil); opposite directions → refuse the setting (grounded or
  // silent: we do not silently pick a winner between two grounded conditions —
  // e.g. hot wants front oil thicker, wet wants it thinner). Keeps the
  // one-change-at-a-time contract honest when conditions overlap.
  const predictedTags = new Set(predicted.keys());
  const candidatesBySetting = new Map<string, RuleCandidate[]>();
  for (const [tag, trigger] of predicted) {
    const candidates = data.rules
      .filter(
        (r) =>
          r.scope.some((s) => template.scope.includes(s)) &&
          r.conditions.amplified_on.includes(tag) &&
          raceDayFilter(r).allowed &&
          !r.conditions.reduced_on.some((c) => predictedTags.has(c)) &&
          !avoidRuleIds.has(r.id),
      )
      .sort(
        (a, b) =>
          a.reversal_cost_minutes - b.reversal_cost_minutes ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .slice(0, MAX_ADJUSTMENTS_PER_TAG);
    if (candidates.length === 0) {
      refusals.push({
        aspect: tag,
        message: `No KB rule covers '${tag}' on ${input.track.surface} for this chassis — no recommendation (grounded or silent).`,
      });
      continue;
    }
    for (const rule of candidates) {
      const list = candidatesBySetting.get(rule.setting) ?? [];
      list.push({ rule, tag, trigger });
      candidatesBySetting.set(rule.setting, list);
    }
  }

  const adjustments: PlannedAdjustment[] = [];
  for (const setting of [...candidatesBySetting.keys()].sort()) {
    const group = candidatesBySetting.get(setting)!;
    const directions = new Set(group.map((g) => g.rule.direction));
    if (directions.size > 1) {
      const detail = [...group]
        .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
        .map((g) => `${g.tag} → ${humanize(g.rule.direction)}`)
        .join(", ");
      refusals.push({
        aspect: setting,
        message: `Conditions disagree on ${humanize(setting)} (${detail}) — no single grounded call (grounded or silent); your decision on the day.`,
      });
      continue;
    }
    adjustments.push(mergeAdjustment(group, input));
  }

  const assumptions = [
    `track: ${input.track.name} (${input.track.surface}${input.track.indoor ? ", indoor" : ""})`,
    `chassis template: ${input.chassis_template_id}`,
    forecast.length > 0
      ? `forecast window: ${forecast[0].observed_at} → ${forecast[forecast.length - 1].observed_at} (${forecast.length} observation(s))`
      : "forecast window: none",
    `practice datapoints at this track: ${atTrack.length}`,
    `thresholds: rain risk >= ${RAIN_RISK_THRESHOLD_PCT}%, hot >= ${PLANNER_HOT_AIR_C}C, cold <= ${PLANNER_COLD_AIR_C}C, wind aspect >= ${PLANNER_WIND_ASPECT_KMH} km/h`,
    `race-day bar: high confidence + reversal <= 15 min; max ${MAX_ADJUSTMENTS_PER_TAG} adjustment(s) per condition`,
  ];

  return {
    ok: true,
    plan: {
      kind: "race_day_plan",
      source: "offline_deterministic",
      track: { name: input.track.name, surface: input.track.surface },
      forecast_read,
      practice_read,
      adjustments,
      refusals,
      assumptions,
    },
  };
}

interface RuleCandidate {
  rule: KBRule;
  tag: string;
  trigger: string;
}

function toAdjustment(
  rule: KBRule,
  tag: string,
  trigger: string,
  input: RaceDayInput,
): PlannedAdjustment {
  const current = input.current_setup?.[rule.setting];
  const currentTxt = current !== undefined ? ` (currently ${current})` : "";
  const effects = rule.effects.map((e) => `${humanize(e.axis)}: ${humanize(e.change)}`).join("; ");
  return {
    trigger,
    condition_tag: tag,
    setting: rule.setting,
    change: `${humanize(rule.direction)} ${humanize(rule.setting)}${currentTxt} — ${rule.magnitude_guidance}`,
    mechanism: `Per ${rule.sources[0]}: ${effects}.`,
    confidence: rule.confidence,
    citations: [rule.id],
    revert: `Reverse the change; ~${rule.reversal_cost_minutes} min.`,
  };
}

/** Resolve a same-setting/same-direction group into ONE adjustment. A single
 *  candidate passes through unchanged; multiple conditions that call for the
 *  identical change are merged — the change is made ONCE, with the fastest-revert
 *  rule leading and every contributing rule cited, so a cold+wet day surfaces one
 *  "thinner oil" step (not two) without dropping either citation. */
function mergeAdjustment(group: RuleCandidate[], input: RaceDayInput): PlannedAdjustment {
  const seen = new Set<string>();
  const uniq = group
    .filter((g) => (seen.has(g.rule.id) ? false : (seen.add(g.rule.id), true)))
    .sort(
      (a, b) =>
        a.rule.reversal_cost_minutes - b.rule.reversal_cost_minutes ||
        (a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0),
    );
  const tags = [...new Set(uniq.map((g) => g.tag))].sort();
  const base = toAdjustment(uniq[0].rule, tags.join("+"), uniq.map((g) => g.trigger).join("; "), input);
  if (uniq.length === 1) return base;
  return {
    ...base,
    citations: uniq.map((g) => g.rule.id),
    mechanism: `${base.mechanism} Reinforced by ${tags.join(" + ")} — each calls for the same change, so make it ONCE.`,
  };
}
