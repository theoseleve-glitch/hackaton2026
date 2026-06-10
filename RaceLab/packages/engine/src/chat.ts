import { loadChassisTemplate, loadRules, loadTaxonomy } from "./kb.js";
import { parseFeedback } from "./nlu.js";
import { retrieve } from "./retrieval.js";
import { engineScopeViolation, raceDayFilter, DO_NOTHING_MESSAGE } from "./guard.js";
import { conditionsEcho, ruleToOption } from "./offline.js";
import type { ContextBundle, FeedbackTag, RecommendationOption } from "./types.js";

/**
 * RaceLab's deterministic race-engineer chatbot (D18) — no API, no model.
 * A dialogue state machine over the KB: parse the complaint, ask the one
 * clarifying question a real engineer would ask, propose ONE change, then
 * walk the better/same/worse loop through ranked alternatives.
 */

type State = "awaiting_problem" | "awaiting_phase" | "awaiting_outcome";

const PHASE_QUESTION =
  "When does it do that? (corner entry / mid-corner / exit / on power / off power / braking / jumps / bumps / high speed / low speed)";

const PROBLEM_PROMPT =
  'Describe what the car is doing — like you\'d tell your pit man. e.g. "it pushes mid-corner", "loose on power out of the infield", "bounces through the braking bumps".';

export class RaceEngineerChat {
  private state: State = "awaiting_problem";
  private bundle: ContextBundle;
  private pendingSymptoms: FeedbackTag[] = [];
  private queue: RecommendationOption[] = [];
  private current?: RecommendationOption;
  private taxonomy = loadTaxonomy();
  private rules = loadRules();
  private template;

  constructor(bundle: ContextBundle) {
    this.bundle = bundle;
    this.template = loadChassisTemplate(bundle.chassis_template_id);
  }

  greeting(): string[] {
    return [
      `Race engineer ready — ${this.template.brand} ${this.template.model}.`,
      `Session: ${conditionsEcho(this.bundle)}.`,
      PROBLEM_PROMPT,
    ];
  }

  handle(rawInput: string): string[] {
    const input = rawInput.trim();
    if (!input) return ["I'm listening."];

    // global commands work in any state
    const cmd = this.handleCommand(input);
    if (cmd) return cmd;

    // engine-scope refusal beats everything (D13)
    const refusal = engineScopeViolation(
      { ...this.bundle, question: input, feedback: { tags: [], text: input } },
      this.taxonomy,
    );
    if (refusal) return [`🚫 ${refusal}`];

    switch (this.state) {
      case "awaiting_problem":
        return this.onProblem(input);
      case "awaiting_phase":
        return this.onPhase(input);
      case "awaiting_outcome":
        return this.onOutcome(input);
    }
  }

  private handleCommand(input: string): string[] | null {
    const lower = input.toLowerCase();
    if (/^(race ?day|main|qualif)/.test(lower)) {
      this.bundle.mode = "race_day";
      return ["⏱ Race-day mode: I'll only propose high-confidence changes you can revert fast."];
    }
    if (/^practice/.test(lower)) {
      this.bundle.mode = "practice";
      return ["🔧 Practice mode: we can experiment."];
    }
    if (/^(help|\?)$/.test(lower)) {
      return [
        PROBLEM_PROMPT,
        'After a suggestion, tell me "better", "same" or "worse". Say "race day" or "practice" to switch mode.',
      ];
    }
    return null;
  }

  private onProblem(input: string): string[] {
    const parsed = parseFeedback(input);
    if (parsed.conditions.length > 0) {
      this.bundle.track.conditions = [
        ...new Set([...this.bundle.track.conditions, ...parsed.conditions]),
      ];
    }
    if (parsed.tags.length === 0) {
      return [
        "I couldn't pin the symptom down from that.",
        PROBLEM_PROMPT,
      ];
    }
    const hasPhase = parsed.tags.some((t) => t.phase);
    if (!hasPhase) {
      this.pendingSymptoms = parsed.tags;
      this.state = "awaiting_phase";
      return [`Got it — ${parsed.tags.map((t) => t.symptom.replace(/_/g, " ")).join(" + ")}.`, PHASE_QUESTION];
    }
    return this.recommendFor(parsed.tags);
  }

  private onPhase(input: string): string[] {
    const parsed = parseFeedback(input);
    const phases = parsed.tags.map((t) => t.phase).filter(Boolean) as string[];
    const phaseFromText = phases[0] ?? this.matchBarePhase(input);
    const tags = this.pendingSymptoms.map((t) => ({
      ...t,
      phase: phaseFromText ?? undefined,
    }));
    this.pendingSymptoms = [];
    return this.recommendFor(tags);
  }

  private matchBarePhase(input: string): string | null {
    const lower = input.toLowerCase();
    if (/everywhere|always|all the time|the whole lap/.test(lower)) return null;
    const map: Record<string, string> = {
      entry: "corner_entry",
      "turn in": "corner_entry",
      mid: "mid_corner",
      apex: "mid_corner",
      exit: "corner_exit",
      "on power": "on_power",
      throttle: "on_power",
      "off power": "off_power",
      braking: "braking",
      brakes: "braking",
      jumps: "jumps",
      jump: "jumps",
      bumps: "rough_section",
      rough: "rough_section",
      "high speed": "high_speed",
      fast: "high_speed",
      "low speed": "low_speed",
      slow: "low_speed",
      tight: "low_speed",
    };
    for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
    return null;
  }

  private recommendFor(tags: FeedbackTag[]): string[] {
    this.bundle.feedback = { tags, text: "" };
    let scored = retrieve(this.rules, this.bundle, this.template);
    if (this.bundle.mode === "race_day") {
      scored = scored.filter(({ rule }) => raceDayFilter(rule).allowed);
    }
    if (scored.length === 0) {
      this.state = "awaiting_problem";
      return [
        this.bundle.mode === "race_day"
          ? `🤝 ${DO_NOTHING_MESSAGE}`
          : "I don't have a verified chassis rule for that one. Before touching the chassis: check tires/inserts for this surface — that's the usual cause.",
      ];
    }
    // one option per setting, ranked
    const seen = new Set<string>();
    this.queue = [];
    for (const { rule } of scored) {
      if (seen.has(rule.setting)) continue;
      seen.add(rule.setting);
      this.queue.push(ruleToOption(rule, this.bundle));
    }
    return this.presentNext(true);
  }

  private presentNext(first: boolean): string[] {
    this.current = this.queue.shift();
    if (!this.current) {
      this.state = "awaiting_problem";
      return [
        "We've been through my whole list for that symptom. Revert to your last good setup and let's look at tires — or describe what changed.",
      ];
    }
    this.state = "awaiting_outcome";
    const o = this.current;
    const lead = first ? "Try ONE change:" : "Next on my list:";
    return [
      `${lead}`,
      `🔧 ${o.change}`,
      `   why: ${o.mechanism}`,
      `   revert: ${o.revert}  ·  confidence: ${o.confidence}  ·  source: ${o.citations.join(", ")}`,
      `Run it, then tell me: better / same / worse?`,
    ];
  }

  private onOutcome(input: string): string[] {
    const lower = input.toLowerCase();
    if (/better|good|fixed|solved|works/.test(lower)) {
      this.state = "awaiting_problem";
      return [
        "✅ Keep it — note it on the setup sheet so the change is traceable.",
        "Anything else the car is doing?",
      ];
    }
    if (/worse|bad|horrible/.test(lower)) {
      return [`↩ Revert that first (${this.current?.revert ?? "put it back"}). One variable at a time.`, ...this.presentNext(false)];
    }
    if (/same|no change|nothing|identical/.test(lower)) {
      return ["↩ Revert it — a change that does nothing is just wear. Next:", ...this.presentNext(false)];
    }
    // driver described a NEW problem instead of an outcome
    const parsed = parseFeedback(input);
    if (parsed.tags.length > 0) {
      return this.onProblem(input);
    }
    return ['Tell me "better", "same" or "worse" — or describe a new problem.'];
  }
}
