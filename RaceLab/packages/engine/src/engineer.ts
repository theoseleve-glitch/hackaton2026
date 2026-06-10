import { loadChassisTemplate, loadRules, loadTaxonomy, validateRulesAgainstTaxonomy } from "./kb.js";
import { retrieve } from "./retrieval.js";
import {
  DO_NOTHING_MESSAGE,
  OUT_OF_KB_MESSAGE,
  engineScopeViolation,
  raceDayFilter,
} from "./guard.js";
import { buildOfflineCard, conditionsEcho } from "./offline.js";
import type { ContextBundle, Recommendation } from "./types.js";

/**
 * The pipeline of docs/04 §4 (D18: fully deterministic, no API):
 * scope check → deterministic retrieval → race-day filter → templated card.
 * Every card is built directly from retrieved KB rules, so citations are
 * valid and settings template-known by construction.
 */
export function recommend(bundle: ContextBundle): Recommendation {
  const taxonomy = loadTaxonomy();
  const rules = loadRules();
  const kbErrors = validateRulesAgainstTaxonomy(rules, taxonomy);
  if (kbErrors.length > 0) throw new Error(`KB validation failed:\n${kbErrors.join("\n")}`);
  const template = loadChassisTemplate(bundle.chassis_template_id);
  const echo = conditionsEcho(bundle);

  // 1. Engine-scope refusal (D13) — before anything else
  const refusal = engineScopeViolation(bundle, taxonomy);
  if (refusal) {
    return { kind: "refusal", source: "offline_deterministic", message: refusal, conditions_echo: echo };
  }

  // 2. Deterministic retrieval
  let scored = retrieve(rules, bundle, template);

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

  // 4. Templated card from the top-ranked rules (distinct settings)
  const card = buildOfflineCard(scored, bundle);
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
