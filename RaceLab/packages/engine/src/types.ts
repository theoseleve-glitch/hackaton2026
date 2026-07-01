export type Confidence = "high" | "medium" | "low";

export interface KBEffect {
  axis: string;
  change: string;
}

export interface KBAddress {
  symptom: string;
  phase?: string;
}

export interface KBRule {
  id: string;
  setting: string;
  direction: string;
  effects: KBEffect[];
  addresses: KBAddress[];
  conditions: { amplified_on: string[]; reduced_on: string[] };
  counter_indications: string[];
  magnitude_guidance: string;
  reversal_cost_minutes: number;
  confidence: Confidence;
  sources: string[];
  scope: string[];
  /** Hard exclusion: if the run's conditions intersect this, the rule is DROPPED
   *  (not merely de-weighted like reduced_on) — for advice that is wrong, not just
   *  weaker, on a surface/condition (e.g. add-sway-bar on loose dirt). */
  forbidden_on?: string[];
  /** Hard exclusion by power sub-class legality: the rule fires only when the
   *  run's power tag is in this list (e.g. motor boost/turbo timing only in
   *  `modified_power`, never `stock_blinky`). Omitted = legal in all. */
  legal_in_power?: string[];
  /** OPTIONAL hard safety caveat surfaced verbatim on the change text (⚠️ SAFETY) —
   *  a physical-harm limit for an inherently risky change. Absent on main's rule packs
   *  today (KB-authoring follow-up for William to flag dangerous changes); the report
   *  layer renders it only when present. [merged from theo's safety-framing contract] */
  danger?: string;
  /** OPTIONAL estimated lap-time gain (s) for ROI framing in the report headline.
   *  Absent on main's packs today; when present the headline names the gain. */
  lap_time_impact_s?: number;
}

export interface Taxonomy {
  symptoms: { id: string }[];
  phases: { id: string }[];
  evolution: { id: string }[];
  conditions: string[];
  /** Class-scope vocabulary; rule.scope + template.scope must draw from this. */
  scopes?: string[];
  engine_scope_refusal: { keywords: string[]; refusal: string };
}

export interface ChassisTemplate {
  template_id: string;
  template_version: number;
  brand: string;
  model: string;
  category: string;
  scope: string[];
  fields: Record<
    string,
    {
      type: string;
      unit?: string;
      options?: (string | number)[];
      range?: [number, number];
      step?: number;
      of?: string[];
      [k: string]: unknown;
    }
  >;
}

export interface FeedbackTag {
  symptom: string;
  phase?: string;
  evolution?: string;
}

/** One row of past-change history — the learning loop's READ half (docs/04 §6).
 *  The required fields match schema `ContextHistoryEntry` exactly; `citations`
 *  and `track_id` are ADDITIVE enrichments (schema `historyFromTuples` on the
 *  engine side emits them) that unlock per-rule re-ranking:
 *  - `citations`: KB rule ids the change cited — rows without them never
 *    influence ranking (no rule id, no attribution, no effect).
 *  - `track_id`: rows WITHOUT one are treated as already filtered to the
 *    current track by the caller (legacy behavior); rows WITH one only count
 *    when the bundle's track has a matching `track_id`. */
export interface HistoryEntry {
  change: string;
  conditions: string;
  outcome: "better" | "same" | "worse";
  citations?: readonly string[];
  track_id?: string;
  /** Taxonomy condition tags the row was rated UNDER (schema `conditionsToTags`,
   *  e.g. ["high_grip","hot"]). ADDITIVE: rows without it fall back to the
   *  all-conditions net (legacy behavior). With it, the learner segments by
   *  condition — a change rated better-when-hot / worse-when-cold contributes
   *  the RIGHT signal for the current forecast instead of cancelling to zero. */
  condition_tags?: readonly string[];
}

export interface ContextBundle {
  chassis_template_id: string;
  setup: Record<string, string | number>;
  /** Saved version the setup values came from — stamped onto recommendations
   *  at TRIAL time so outcomes attribute to the right baseline. */
  setup_version_id?: string;
  track: {
    /** Schema TrackId when known — enables track-isolated history re-ranking. */
    track_id?: string;
    name: string;
    surface: string;
    grip: "green" | "medium" | "high" | "blue_groove";
    conditions: string[]; // taxonomy condition tags, e.g. ["low_grip","dusty","bumpy"]
    evolution?: "improving" | "stable" | "degrading"; // grip trend over the day
  };
  weather?: {
    air_temp_c?: number;
    /** Track-surface temperature (IR gun). hot is air≥30 OR track≥40, matching
     *  schema conditionsToTags — so history condition-segmentation isn't fooled
     *  on a mild-air / hot-track day. */
    track_temp_c?: number;
    humidity_pct?: number;
    wind_kmh?: number;
    rain_risk_pct?: number;
  };
  tyres?: {
    wear?: "new" | "light" | "medium" | "worn";
    run_count?: number;
  };
  feedback: { tags: FeedbackTag[]; text?: string };
  mode: "practice" | "race_day";
  history?: HistoryEntry[];
  question?: string;
}

export interface RecommendationOption {
  setting: string;
  change: string;
  /** OPTIONAL standalone magnitude line. main folds `magnitude_guidance` into
   *  `change`; the app renders this as a separate prominent line only when set. */
  magnitude?: string;
  mechanism: string;
  expected_effect: string;
  confidence: Confidence;
  /** ADDITIVE (M3): a deterministic, per-card honest read of how sure THIS
   *  recommendation is — composes match strength (exact vs symptom-only), source
   *  breadth (single/multi), this-condition history depth (better/worse/untested)
   *  and revert cost. Base read still keys off `confidence`; this NEVER changes
   *  which rules fire, their order, the ±1 history cap or the race-day bar.
   *  Optional so callers/persisted shapes predating it stay valid. */
  confidence_qualifier?: string;
  citations: string[];
  revert: string;
  if_it_does_not_help: string;
  /** Deterministic one-liner when this rule has rated history at this track
   *  ("Rated worse here last time — …"). Absent when there is no history. */
  history_note?: string;
}

export interface Recommendation {
  kind: "recommendation" | "do_nothing" | "refusal";
  source: "offline_deterministic" | "llm";
  primary?: RecommendationOption;
  alternatives?: RecommendationOption[];
  message?: string;
  conditions_echo: string; // condition context echoed back (docs/04 §10 — never feel generic)
}
