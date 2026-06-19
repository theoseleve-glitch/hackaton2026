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
  /** Hard safety limit / physical-harm caveat for this change, surfaced verbatim
   *  into the rendered advice (M1-M3). Present only on physical-risk rules. */
  danger?: string;
  reversal_cost_minutes: number;
  confidence: Confidence;
  sources: string[];
  scope: string[];
}

export interface Taxonomy {
  symptoms: { id: string }[];
  phases: { id: string }[];
  evolution: { id: string }[];
  conditions: string[];
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
    evolution?: "improving" | "stable" | "degrading"; // grip trend over the day (Theo: report + driving-tips)
  };
  weather?: {
    air_temp_c?: number;
    humidity_pct?: number;
    wind_kmh?: number;
    rain_risk_pct?: number;
  };
  /** Tyre state — Theo additive: feeds report.ts context + driving-tips.ts. */
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
  /** How much to move the lever, hoisted out of `change` so the step size is a
   *  standalone, prominent line ("1mm at a time, identical left/right"). Empty
   *  string when the rule carries no magnitude_guidance. */
  magnitude: string;
  mechanism: string;
  expected_effect: string;
  confidence: Confidence;
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
