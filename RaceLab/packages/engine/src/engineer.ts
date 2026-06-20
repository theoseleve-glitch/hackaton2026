import { type KBData, resolveTemplate } from "./data";
import { retrieve } from "./retrieval";
import {
  DO_NOTHING_MESSAGE,
  OUT_OF_KB_MESSAGE,
  engineScopeViolation,
} from "./guard";
import { buildOfflineCard, conditionsEcho } from "./offline";
import type { ContextBundle, Recommendation } from "./types";

/**
 * The pipeline of docs/04 §4 (D18: fully deterministic, no API, no I/O):
 * scope check → deterministic retrieval → race-day filter → templated card.
 * Pure function of (bundle, data) — runs identically in node and in the app.
 */
export function recommend(bundle: ContextBundle, data: KBData): Recommendation {
  const echo = conditionsEcho(bundle);

  // 0. Unknown chassis → refuse in-band (never throw on the data path), matching
  //    proposePlan/planRaceDay. The registry carries pending_pdf chassis, so the
  //    app can legitimately ask about one not yet extracted.
  const template = resolveTemplate(data, bundle.chassis_template_id);
  if (!template) {
    return {
      kind: "refusal",
      source: "offline_deterministic",
      message: `I don't have a verified setup sheet for this chassis yet, so I won't guess.`,
      conditions_echo: echo,
    };
  }

  // 1. Engine-scope refusal (D13) — before anything else
  const refusal = engineScopeViolation(bundle, data.taxonomy);
  if (refusal) {
    return { kind: "refusal", source: "offline_deterministic", message: refusal, conditions_echo: echo };
  }

  // 2. Deterministic retrieval (retrieve() applies the race-day bar to the FULL pool
  // BEFORE truncating to top-N, so an eligible rule is never starved behind ineligible ones)
  const scored = retrieve(data.rules, bundle, template);

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
