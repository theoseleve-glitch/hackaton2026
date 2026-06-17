import { type KBData, resolveTemplate } from "./data";
import { retrieve, type ScoredRule } from "./retrieval";
import {
  DO_NOTHING_MESSAGE,
  OUT_OF_KB_MESSAGE,
  engineScopeViolation,
  raceDayFilter,
} from "./guard";
import { conditionsEcho, humanize, ruleToOption } from "./offline";
import { historyNote } from "./history";
import type { ContextBundle, RecommendationOption } from "./types";

/**
 * Multi-change plans (CEO decision, D-row pending): the engineer proposes a
 * RANKED plan of up to MAX_PLAN_CHANGES cited canonical changes — but they are
 * applied and rated ONE AT A TIME (D6's spirit: never two untested changes on
 * the car at once; trial-time attribution survives because each change goes
 * through the same apply → rate loop).
 *
 * Pure function of (bundle, data) — D18: no I/O, no model, no API. Every
 * change is a rendered KB rule (grounded by construction); when the KB grounds
 * nothing the plan is an honest refusal, never a guess.
 */

export const MAX_PLAN_CHANGES = 3;

export interface PlannedChange {
  /** 1-based rank — the order the outcome loop walks. */
  position: number;
  option: RecommendationOption;
  /** Why this change is in the plan at this rank (deterministic template). */
  rationale: string;
}

export interface RecommendationPlan {
  kind: "plan" | "do_nothing" | "refusal";
  source: "offline_deterministic";
  /** Ranked, distinct settings, max MAX_PLAN_CHANGES. Empty unless kind === "plan". */
  changes: PlannedChange[];
  message?: string;
  conditions_echo: string;
}

export interface ProposePlanOptions {
  /** Cap the plan length (1..MAX_PLAN_CHANGES). Default MAX_PLAN_CHANGES. */
  max_changes?: number;
}

export function proposePlan(
  bundle: ContextBundle,
  data: KBData,
  opts?: ProposePlanOptions,
): RecommendationPlan {
  const echo = conditionsEcho(bundle);
  const source = "offline_deterministic" as const;

  // 0. Unknown chassis template is an in-band refusal — never a throw across
  //    the package boundary.
  const template = resolveTemplate(data, bundle.chassis_template_id);
  if (!template) {
    return {
      kind: "refusal",
      source,
      changes: [],
      message: `Chassis template '${bundle.chassis_template_id}' is not in the KB — no grounded plan.`,
      conditions_echo: echo,
    };
  }

  // 1. Engine-scope refusal (D13) — before anything else
  const refusal = engineScopeViolation(bundle, data.taxonomy);
  if (refusal) {
    return { kind: "refusal", source, changes: [], message: refusal, conditions_echo: echo };
  }

  // 2. Deterministic retrieval (history re-ranking happens inside)
  let scored = retrieve(data.rules, bundle, template);

  // 3. Race-day mode: filter the candidate pool BEFORE ranking the plan
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
      source,
      changes: [],
      message,
      conditions_echo: echo,
    };
  }

  // 4. Ranked plan: distinct settings (one lever per change), capped
  const max = Math.max(1, Math.min(opts?.max_changes ?? MAX_PLAN_CHANGES, MAX_PLAN_CHANGES));
  const seenSettings = new Set<string>();
  const changes: PlannedChange[] = [];
  for (const entry of scored) {
    if (seenSettings.has(entry.rule.setting)) continue;
    seenSettings.add(entry.rule.setting);
    const position = changes.length + 1;
    changes.push({
      position,
      option: ruleToOption(entry.rule, bundle, entry.history),
      rationale: rationaleFor(position, entry, bundle),
    });
    if (changes.length === max) break;
  }

  return { kind: "plan", source, changes, conditions_echo: echo };
}

/** Deterministic rationale: what the rule addresses + confidence + history. */
function rationaleFor(position: number, entry: ScoredRule, bundle: ContextBundle): string {
  const present = new Set(bundle.feedback.tags.map((t) => t.symptom));
  const matched = entry.rule.addresses
    .filter((a) => present.has(a.symptom))
    .map((a) => `${humanize(a.symptom)}${a.phase ? ` ${humanize(a.phase)}` : ""}`);
  const addressTxt = matched.length > 0 ? [...new Set(matched)].join(", ") : "the reported symptom";
  const parts = [
    `Ranked #${position} — addresses ${addressTxt}; confidence ${entry.rule.confidence}; revert ~${entry.rule.reversal_cost_minutes} min.`,
  ];
  if (entry.history) parts.push(`History: ${historyNote(entry.history)}`);
  return parts.join(" ");
}
