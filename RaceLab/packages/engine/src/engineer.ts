import { loadChassisTemplate, loadRules, loadTaxonomy, validateRulesAgainstTaxonomy } from "./kb.js";
import { retrieve } from "./retrieval.js";
import {
  DO_NOTHING_MESSAGE,
  OUT_OF_KB_MESSAGE,
  engineScopeViolation,
  invalidCitations,
  raceDayFilter,
  settingUnknownToTemplate,
} from "./guard.js";
import { buildOfflineCard, conditionsEcho } from "./offline.js";
import type { ContextBundle, Recommendation, RecommendationOption } from "./types.js";

export interface EngineerOptions {
  online?: boolean;
}

/**
 * The pipeline of docs/04 §4: scope check → deterministic retrieval →
 * offline card OR LLM → deterministic guard → contract-shaped output.
 */
export async function recommend(
  bundle: ContextBundle,
  opts: EngineerOptions = {},
): Promise<Recommendation> {
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
      bundle.mode === "race_day" ? DO_NOTHING_MESSAGE : `${OUT_OF_KB_MESSAGE} Closest area to investigate: tires/inserts for this surface — the most common cause when no chassis rule matches.`;
    return {
      kind: bundle.mode === "race_day" ? "do_nothing" : "refusal",
      source: "offline_deterministic",
      message,
      conditions_echo: echo,
    };
  }

  const retrievedIds = new Set(scored.map(({ rule }) => rule.id));

  // 4. Online path: LLM reasons over ONLY the retrieved rules, then is guard-checked
  if (opts.online) {
    const { llmRecommend } = await import("./llm.js");
    const out = await llmRecommend(bundle, scored.map((s) => s.rule));

    if (out.decision === "do_nothing") {
      return { kind: "do_nothing", source: "llm", message: out.reason ?? DO_NOTHING_MESSAGE, conditions_echo: echo };
    }
    if (out.decision === "refuse_out_of_kb" || !out.primary) {
      return { kind: "refusal", source: "llm", message: out.reason ?? OUT_OF_KB_MESSAGE, conditions_echo: echo };
    }

    const guardProblems = guardCheck([out.primary, ...out.alternatives], retrievedIds, template);
    if (guardProblems.length === 0) {
      return {
        kind: "recommendation",
        source: "llm",
        primary: out.primary,
        alternatives: out.alternatives.slice(0, 2),
        conditions_echo: echo,
      };
    }
    // Guard violation: never ship an unverifiable answer — fall back to the deterministic card
    console.error(`[guard] LLM output rejected (${guardProblems.join("; ")}) — falling back to offline card`);
  }

  // 5. Offline deterministic card
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

function guardCheck(
  options: RecommendationOption[],
  retrievedIds: Set<string>,
  template: ReturnType<typeof loadChassisTemplate>,
): string[] {
  const problems: string[] = [];
  for (const opt of options) {
    if (opt.citations.length === 0) problems.push(`${opt.setting}: no citations`);
    const bad = invalidCitations(opt, retrievedIds);
    if (bad.length > 0) problems.push(`${opt.setting}: cites non-retrieved rules ${bad.join(",")}`);
    if (settingUnknownToTemplate(opt.setting, template)) {
      problems.push(`${opt.setting}: setting not on chassis template ${template.template_id}`);
    }
  }
  const settings = options.map((o) => o.setting);
  if (new Set(settings).size !== settings.length) problems.push("duplicate settings across options");
  if (options.length > 3) problems.push("more than 1 primary + 2 alternatives");
  return problems;
}
