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

export interface ContextBundle {
  chassis_template_id: string;
  setup: Record<string, string | number>;
  track: {
    name: string;
    surface: string;
    grip: "green" | "medium" | "high" | "blue_groove";
    conditions: string[]; // taxonomy condition tags, e.g. ["low_grip","dusty","bumpy"]
  };
  weather?: {
    air_temp_c?: number;
    humidity_pct?: number;
    wind_kmh?: number;
    rain_risk_pct?: number;
  };
  feedback: { tags: FeedbackTag[]; text?: string };
  mode: "practice" | "race_day";
  history?: { change: string; conditions: string; outcome: "better" | "same" | "worse" }[];
  question?: string;
}

export interface RecommendationOption {
  setting: string;
  change: string;
  mechanism: string;
  expected_effect: string;
  confidence: Confidence;
  citations: string[];
  revert: string;
  if_it_does_not_help: string;
}

export interface Recommendation {
  kind: "recommendation" | "do_nothing" | "refusal";
  source: "offline_deterministic" | "llm";
  primary?: RecommendationOption;
  alternatives?: RecommendationOption[];
  message?: string;
  conditions_echo: string; // condition context echoed back (docs/04 §10 — never feel generic)
}
