import type { KBData } from "./data";
import { retrieve } from "./retrieval";
import {
  DO_NOTHING_MESSAGE,
  OUT_OF_KB_MESSAGE,
  engineScopeViolation,
  raceDayFilter,
  sanitizeBundle,
} from "./guard";
import { buildOfflineCard, conditionsEcho, filterToTemplate } from "./offline";
import type { ContextBundle, Recommendation } from "./types";

/**
 * The pipeline of docs/04 §4 (D18: fully deterministic, no API, no I/O):
 * scope check → deterministic retrieval → race-day filter → templated card.
 * Pure function of (bundle, data) — runs identically in node and in the app.
 */
export function recommend(rawBundle: ContextBundle, data: KBData): Recommendation {
  // M5: strip non-finite numerics at the boundary before anything is rendered.
  const bundle = sanitizeBundle(rawBundle);
  const echo = conditionsEcho(bundle);

  // M4: unknown chassis template is an in-band refusal — NEVER a throw across
  // the package boundary (mirrors proposePlan()).
  const template = data.templates[bundle.chassis_template_id];
  if (!template) {
    return {
      kind: "refusal",
      source: "offline_deterministic",
      message: `Chassis template '${bundle.chassis_template_id}' is not in the KB — no grounded recommendation.`,
      conditions_echo: echo,
    };
  }

  // 1. Engine-scope refusal (D13) — before anything else
  const refusal = engineScopeViolation(bundle, data.taxonomy);
  if (refusal) {
    return { kind: "refusal", source: "offline_deterministic", message: refusal, conditions_echo: echo };
  }

  // 2. Deterministic retrieval
  let scored = retrieve(data.rules, bundle, template);
  const retrievedIds = new Set(scored.map(({ rule }) => rule.id));

  // 2b. M6b: drop rules whose setting isn't on this template (grounded-or-silent).
  scored = filterToTemplate(scored, template);

  // 3. Race-day mode: filter the candidate pool BEFORE choosing
  if (bundle.mode === "race_day") {
    scored = scored.filter(({ rule }) => raceDayFilter(rule).allowed);
  }

  if (scored.length === 0) {
    const message =
      bundle.mode === "race_day"
        ? DO_NOTHING_MESSAGE
        : `${OUT_OF_KB_MESSAGE} Closest area to investigate: tires/inserts for this surface — the most common cause when no chassis rule matches.`;
    return {
      kind: bundle.mode === "race_day" ? "do_nothing" : "refusal",
      source: "offline_deterministic",
      message,
      conditions_echo: echo,
    };
  }

  // 4. Templated card from the top-ranked rules (distinct settings). Each option
  //    passes the fail-closed emittable gate (grounded + on-template + finite).
  const card = buildOfflineCard(scored, bundle, template, retrievedIds);
  if (!card) {
    return { kind: "refusal", source: "offline_deterministic", message: OUT_OF_KB_MESSAGE, conditions_echo: echo };
  }
  return {
    kind: "recommendation",
    source: "offline_deterministic",
    primary: card.primary,
    alternatives: card.alternatives,
    conditions_echo: echo,
  };
}
